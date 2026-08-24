import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  fuzzyFilter,
  getKeybindings,
  type Component,
  type SelectItem,
  SelectList,
  type SelectListTheme,
  Spacer,
  Text,
  truncateToWidth,
  type TUI,
  visibleWidth,
} from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";
import * as child_process from "node:child_process";
import * as os from "node:os";
import * as crypto from "node:crypto";

/**
 * runtime-orchestrator: Runtime Abstraction Layer (RAL) v1 Foundation & Sync for Harness Pi.
 *
 * Responsibilities:
 * 1. Startup supervision: checks 9router health on startup, attempts auto-start if down.
 * 2. Project topology detection: fast, synchronous inspection of workspace markers.
 * 3. Minimal context injection: injects concise active workspace topology into system prompt.
 * 4. /doctor diagnostic command: verifies Pi, 9router, MCP servers, permissions, and extensions.
 * 5. /sync command (RAL Phase 2): one-way deterministic sync from Blueprint repo to runtime.
 *
 * Designed with zero external dependencies (Node.js stdlib only).
 */

export interface ProjectTopology {
  name: string;
  type: string;
  framework?: string;
  packageManager?: string;
  gitBranch?: string;
  hasTests?: boolean;
}

export type SyncActionStatus =
  | "unchanged"
  | "updated"
  | "created"
  | "conflict"
  | "protected"
  | "skipped"
  | "failed";

export interface SyncItemResult {
  assetName: string;
  category: "prompts" | "extensions" | "skills" | "mcp" | "protected";
  sourcePath?: string;
  runtimePath: string;
  status: SyncActionStatus;
  detail?: string;
  sourceHash?: string;
  runtimeHash?: string;
}

export interface SyncSummary {
  dryRun: boolean;
  repoPath?: string;
  items: SyncItemResult[];
  counts: Record<SyncActionStatus, number>;
}

const ROUTER_ENDPOINT = "http://127.0.0.1:20128/v1/models";
const ROUTER_HEALTH_TIMEOUT_MS = 1500;
/** Base URL for the 9router chat API (derived, single source of truth). */
export const ROUTER_BASE_URL = ROUTER_ENDPOINT.replace(/\/models$/, "");
const DEFAULT_BLUEPRINT_REPO_PATH = "G:/pisetup";

/**
 * State store path for tracking baseline hashes of deployed assets.
 */
const SYNC_STATE_FILE = path.join(os.homedir(), ".pi", "agent", "sync-state.json");

interface SyncStateStore {
  lastSyncTime?: string;
  repoGitCommit?: string;
  hashes: Record<string, { sourceHash: string; runtimeHash: string; timestamp: string }>;
}

const topologyCache = new Map<string, ProjectTopology>();

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Calculates SHA256 content hash of a file or directory string.
 */
export function hashContent(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Computes hash of a single file on disk (returns empty if missing).
 */
export function hashFile(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  try {
    const data = fs.readFileSync(filePath);
    return hashContent(data);
  } catch {
    return "";
  }
}

/**
 * Computes hash of a directory recursively (stable order).
 */
export function hashDirectory(dirPath: string): string {
  if (!fs.existsSync(dirPath)) return "";
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return hashFile(dirPath);

    const files: string[] = [];
    function collect(d: string, rel: string) {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const full = path.join(d, entry.name);
        const r = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          collect(full, r);
        } else {
          const h = hashFile(full);
          files.push(`${r}:${h}`);
        }
      }
    }
    collect(dirPath, "");
    return hashContent(files.join("\n"));
  } catch {
    return "";
  }
}

/**
 * Reads persistent sync state store.
 */
export function loadSyncState(): SyncStateStore {
  if (!fs.existsSync(SYNC_STATE_FILE)) {
    return { hashes: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(SYNC_STATE_FILE, "utf-8")) as SyncStateStore;
  } catch {
    return { hashes: {} };
  }
}

/**
 * Saves persistent sync state store.
 */
export function saveSyncState(state: SyncStateStore): void {
  try {
    const dir = path.dirname(SYNC_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // Non-fatal
  }
}

/**
 * Detects workspace project topology from standard manifest files in cwd.
 */
export function detectProjectTopology(cwd: string): ProjectTopology {
  const cached = topologyCache.get(cwd);
  if (cached) return cached;

  const dirName = path.basename(cwd) || "root";
  let topology: ProjectTopology = {
    name: dirName,
    type: "Generic",
  };

  const gitHeadPath = path.join(cwd, ".git", "HEAD");
  if (fs.existsSync(gitHeadPath)) {
    try {
      const headContent = fs.readFileSync(gitHeadPath, "utf-8").trim();
      if (headContent.startsWith("ref: refs/heads/")) {
        topology.gitBranch = headContent.replace("ref: refs/heads/", "");
      } else {
        topology.gitBranch = headContent.slice(0, 7);
      }
    } catch {
      topology.gitBranch = "detected";
    }
  }

  const pkgJsonPath = path.join(cwd, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      const isTs = fs.existsSync(path.join(cwd, "tsconfig.json"));
      topology.name = pkg.name || dirName;
      topology.type = isTs ? "TypeScript / Node" : "JavaScript / Node";

      if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) topology.packageManager = "pnpm";
      else if (fs.existsSync(path.join(cwd, "yarn.lock"))) topology.packageManager = "yarn";
      else if (fs.existsSync(path.join(cwd, "bun.lockb")) || fs.existsSync(path.join(cwd, "bun.lock"))) topology.packageManager = "bun";
      else if (fs.existsSync(path.join(cwd, "package-lock.json"))) topology.packageManager = "npm";
      else topology.packageManager = "npm";

      const deps: Record<string, string | undefined> = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps["next"]) topology.framework = "Next.js";
      else if (deps["@remix-run/react"] || deps["@remix-run/node"]) topology.framework = "Remix";
      else if (deps["astro"]) topology.framework = "Astro";
      else if (deps["nuxt"] || deps["vue"]) topology.framework = deps["nuxt"] ? "Nuxt" : "Vue";
      else if (deps["@sveltejs/kit"] || deps["svelte"]) topology.framework = deps["@sveltejs/kit"] ? "SvelteKit" : "Svelte";
      else if (deps["react"]) topology.framework = "React";
      else if (deps["@nestjs/core"]) topology.framework = "NestJS";
      else if (deps["hono"]) topology.framework = "Hono";
      else if (deps["fastify"]) topology.framework = "Fastify";
      else if (deps["express"]) topology.framework = "Express";
      else if (deps["vite"]) topology.framework = "Vite";

      if (pkg.scripts && (pkg.scripts.test || pkg.scripts["test:unit"])) {
        topology.hasTests = true;
      }
      topologyCache.set(cwd, topology);
      return topology;
    } catch {}
  }

  const cargoPath = path.join(cwd, "Cargo.toml");
  if (fs.existsSync(cargoPath)) {
    topology.type = "Rust";
    try {
      const cargoContent = fs.readFileSync(cargoPath, "utf-8");
      const nameMatch = cargoContent.match(/name\s*=\s*"([^"]+)"/);
      if (nameMatch) topology.name = nameMatch[1];
      if (cargoContent.includes("actix-web")) topology.framework = "Actix Web";
      else if (cargoContent.includes("axum")) topology.framework = "Axum";
      else if (cargoContent.includes("tokio")) topology.framework = "Tokio Async";
      topology.packageManager = "cargo";
      topology.hasTests = true;
      topologyCache.set(cwd, topology);
      return topology;
    } catch {}
  }

  const pyprojectPath = path.join(cwd, "pyproject.toml");
  const reqsPath = path.join(cwd, "requirements.txt");
  if (fs.existsSync(pyprojectPath) || fs.existsSync(reqsPath) || fs.existsSync(path.join(cwd, "setup.py"))) {
    topology.type = "Python";
    if (fs.existsSync(path.join(cwd, "uv.lock"))) topology.packageManager = "uv";
    else if (fs.existsSync(path.join(cwd, "poetry.lock"))) topology.packageManager = "poetry";
    else if (fs.existsSync(path.join(cwd, "Pipfile"))) topology.packageManager = "pipenv";
    else topology.packageManager = "pip";

    let pyContent = "";
    if (fs.existsSync(pyprojectPath)) {
      try {
        pyContent += fs.readFileSync(pyprojectPath, "utf-8");
        const nameMatch = pyContent.match(/name\s*=\s*"([^"]+)"/);
        if (nameMatch) topology.name = nameMatch[1];
      } catch {}
    }
    if (fs.existsSync(reqsPath)) {
      try { pyContent += " " + fs.readFileSync(reqsPath, "utf-8"); } catch {}
    }
    const lower = pyContent.toLowerCase();
    if (lower.includes("fastapi")) topology.framework = "FastAPI";
    else if (lower.includes("django")) topology.framework = "Django";
    else if (lower.includes("flask")) topology.framework = "Flask";
    else if (lower.includes("torch") || lower.includes("pytorch")) topology.framework = "PyTorch";
    else if (lower.includes("tensorflow")) topology.framework = "TensorFlow";

    topology.hasTests = fs.existsSync(path.join(cwd, "tests")) || fs.existsSync(path.join(cwd, "test")) || lower.includes("pytest");
    topologyCache.set(cwd, topology);
    return topology;
  }

  const goModPath = path.join(cwd, "go.mod");
  if (fs.existsSync(goModPath)) {
    topology.type = "Go";
    topology.packageManager = "go";
    try {
      const goContent = fs.readFileSync(goModPath, "utf-8");
      const modMatch = goContent.match(/module\s+([^\s\n]+)/);
      if (modMatch) topology.name = path.basename(modMatch[1]);
      if (goContent.includes("gin-gonic/gin")) topology.framework = "Gin";
      else if (goContent.includes("gofiber/fiber")) topology.framework = "Fiber";
      else if (goContent.includes("labstack/echo")) topology.framework = "Echo";
    } catch {}
    topologyCache.set(cwd, topology);
    return topology;
  }

  const rojoPath = path.join(cwd, "default.project.json");
  if (fs.existsSync(rojoPath)) {
    topology.type = "Roblox Studio (Luau)";
    topology.framework = "Rojo";
    try {
      const rojo = JSON.parse(fs.readFileSync(rojoPath, "utf-8"));
      if (rojo.name) topology.name = rojo.name;
    } catch {}
    topologyCache.set(cwd, topology);
    return topology;
  }

  topologyCache.set(cwd, topology);
  return topology;
}

export function formatTopologyContext(topo: ProjectTopology): string {
  const parts: string[] = [`Active Workspace: ${topo.name} (${topo.type})`];
  const meta: string[] = [];
  if (topo.framework) meta.push(`Framework: ${topo.framework}`);
  if (topo.packageManager) meta.push(`PkgManager: ${topo.packageManager}`);
  if (topo.gitBranch) meta.push(`Git: ${topo.gitBranch}`);
  if (topo.hasTests) meta.push("Tests: configured");

  if (meta.length > 0) {
    parts.push(`Environment: ${meta.join(" | ")}`);
  }
  return parts.join("\n");
}

export async function check9routerHealth(): Promise<{ ok: boolean; modelCount?: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ROUTER_HEALTH_TIMEOUT_MS);
    const res = await fetch(ROUTER_ENDPOINT, {
      signal: controller.signal,
      headers: { Authorization: "Bearer sk_9router" },
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { data?: unknown[] };
      const modelCount = Array.isArray(data?.data) ? data.data.length : undefined;
      return { ok: true, modelCount };
    }
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function autoStart9router(ctx: ExtensionContext): Promise<boolean> {
  // All UI access is guarded: extension contexts go stale after the session
  // ends (headless -p runs), and every ctx property getter throws via assertActive.
  try {
    if (ctx.hasUI) ctx.ui.setStatus("9router", "starting…");
    const child = child_process.spawn("9router", [], {
      detached: true,
      stdio: "ignore",
      shell: true,
    });
    child.unref();

    for (let i = 0; i < 7; i++) {
      await sleep(500);
      const health = await check9routerHealth();
      if (health.ok) {
        try {
          if (ctx.hasUI) {
            ctx.ui.setStatus("9router", "online");
            ctx.ui.notify("9router auto-started successfully (:20128)", "info");
          }
        } catch {}
        return true;
      }
    }
  } catch {}

  try {
    if (ctx.hasUI) {
      ctx.ui.setStatus("9router", "offline");
      ctx.ui.notify("9router is offline (:20128). Run '9router' in a terminal.", "warning");
    }
  } catch {}
  return false;
}

/**
 * Deep recursive copy of directory or file with explicit error handling.
 */
function copyRecursive(src: string, dest: string): void {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

/**
 * Reconciles Blueprint assets against runtime destinations (RAL Phase 2 One-Way Sync Engine).
 */
export function executeSync(options?: {
  repoPath?: string;
  agentDir?: string;
  apply?: boolean;
  force?: boolean;
}): SyncSummary {
  const apply = options?.apply ?? false;
  const force = options?.force ?? false;
  const repoPath = options?.repoPath || process.env.BLUEPRINT_REPO_PATH || DEFAULT_BLUEPRINT_REPO_PATH;
  const agentDir =
    options?.agentDir ||
    process.env.PI_CODING_AGENT_DIR ||
    process.env.PI_AGENT_DIR ||
    path.join(os.homedir(), ".pi", "agent");

  const state = loadSyncState();

  const results: SyncItemResult[] = [];
  const counts: Record<SyncActionStatus, number> = {
    unchanged: 0,
    updated: 0,
    created: 0,
    conflict: 0,
    protected: 0,
    skipped: 0,
    failed: 0,
  };

  // Check Blueprint repo availability
  if (!fs.existsSync(repoPath) || !fs.existsSync(path.join(repoPath, "capabilities"))) {
    return {
      dryRun: !apply,
      repoPath,
      items: [
        {
          assetName: "Blueprint Repo",
          category: "prompts",
          runtimePath: repoPath,
          status: "failed",
          detail: `Blueprint repository not found at '${repoPath}'`,
        },
      ],
      counts: { ...counts, failed: 1 },
    };
  }

  // 1. Protected Files Audit (explicit allowlist compliance checks)
  const protectedPaths = [
    { name: "auth.json", path: path.join(agentDir, "auth.json") },
    { name: "models.json", path: path.join(agentDir, "models.json") },
    { name: "settings.json", path: path.join(agentDir, "settings.json") },
    { name: "oauth.json", path: path.join(agentDir, "oauth.json") },
    { name: "mcp.json", path: path.join(os.homedir(), ".config", "mcp", "mcp.json") },
    { name: "sessions/", path: path.join(agentDir, "sessions") },
  ];

  for (const prot of protectedPaths) {
    if (fs.existsSync(prot.path)) {
      results.push({
        assetName: prot.name,
        category: "protected",
        runtimePath: prot.path,
        status: "protected",
        detail: "Runtime file protected by security policy; never overwritten by /sync",
      });
      counts.protected++;
    }
  }

  // Helper for single asset sync evaluation
  function evaluateAssetSync(
    assetName: string,
    category: "prompts" | "extensions" | "skills" | "mcp",
    sourcePath: string,
    runtimePath: string,
    isDir = false
  ) {
    if (!fs.existsSync(sourcePath)) {
      results.push({
        assetName,
        category,
        sourcePath,
        runtimePath,
        status: "failed",
        detail: `Source asset missing in Blueprint repo at ${sourcePath}`,
      });
      counts.failed++;
      return;
    }

    const srcHash = isDir ? hashDirectory(sourcePath) : hashFile(sourcePath);
    const runHash = isDir ? hashDirectory(runtimePath) : hashFile(runtimePath);
    const lastRecord = state.hashes[assetName];

    // Case A: Runtime missing → Create
    if (!fs.existsSync(runtimePath)) {
      if (apply) {
        try {
          copyRecursive(sourcePath, runtimePath);
          const newRunHash = isDir ? hashDirectory(runtimePath) : hashFile(runtimePath);
          state.hashes[assetName] = {
            sourceHash: srcHash,
            runtimeHash: newRunHash,
            timestamp: new Date().toISOString(),
          };
          results.push({
            assetName,
            category,
            sourcePath,
            runtimePath,
            status: "created",
            sourceHash: srcHash,
            runtimeHash: newRunHash,
            detail: "Deployed missing asset from Blueprint source",
          });
          counts.created++;
        } catch (err) {
          results.push({
            assetName,
            category,
            sourcePath,
            runtimePath,
            status: "failed",
            detail: `Copy failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          counts.failed++;
        }
      } else {
        results.push({
          assetName,
          category,
          sourcePath,
          runtimePath,
          status: "created",
          sourceHash: srcHash,
          runtimeHash: "",
          detail: "Will deploy missing asset from Blueprint source",
        });
        counts.created++;
      }
      return;
    }

    // Case B: Hashes identical → Unchanged
    if (srcHash === runHash) {
      state.hashes[assetName] = {
        sourceHash: srcHash,
        runtimeHash: runHash,
        timestamp: new Date().toISOString(),
      };
      results.push({
        assetName,
        category,
        sourcePath,
        runtimePath,
        status: "unchanged",
        sourceHash: srcHash,
        runtimeHash: runHash,
      });
      counts.unchanged++;
      return;
    }

    // Case C: Hashes differ -> check for drift / conflicts
    // If runtime hash matches previous baseline (lastRecord.runtimeHash), runtime was NOT modified locally -> safe update
    // If runtime hash differs from baseline AND from source -> runtime drifted locally -> CONFLICT unless force
    const runtimeDrifted = lastRecord && lastRecord.runtimeHash && lastRecord.runtimeHash !== runHash;

    if (runtimeDrifted && !force) {
      results.push({
        assetName,
        category,
        sourcePath,
        runtimePath,
        status: "conflict",
        sourceHash: srcHash,
        runtimeHash: runHash,
        detail: "Runtime file modified locally since last sync. Use /sync --force to overwrite.",
      });
      counts.conflict++;
      return;
    }

    // Safe update or forced update
    if (apply) {
      try {
        copyRecursive(sourcePath, runtimePath);
        const newRunHash = isDir ? hashDirectory(runtimePath) : hashFile(runtimePath);
        state.hashes[assetName] = {
          sourceHash: srcHash,
          runtimeHash: newRunHash,
          timestamp: new Date().toISOString(),
        };
        results.push({
          assetName,
          category,
          sourcePath,
          runtimePath,
          status: "updated",
          sourceHash: srcHash,
          runtimeHash: newRunHash,
          detail: force && runtimeDrifted ? "Forced overwrite of local runtime drift" : "Updated from Blueprint source",
        });
        counts.updated++;
      } catch (err) {
        results.push({
          assetName,
          category,
          sourcePath,
          runtimePath,
          status: "failed",
          detail: `Update failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        counts.failed++;
      }
    } else {
      results.push({
        assetName,
        category,
        sourcePath,
        runtimePath,
        status: "updated",
        sourceHash: srcHash,
        runtimeHash: runHash,
        detail: force && runtimeDrifted ? "Will force overwrite local runtime drift" : "Will update from Blueprint source",
      });
      counts.updated++;
    }
  }

  // 2. Sync Prompts (capabilities/prompts/* -> ~/.pi/agent/prompts/*)
  const sourcePromptsDir = path.join(repoPath, "capabilities", "prompts");
  const runtimePromptsDir = path.join(agentDir, "prompts");
  if (fs.existsSync(sourcePromptsDir)) {
    const promptFiles = fs.readdirSync(sourcePromptsDir).filter((f) => f.endsWith(".md"));
    for (const file of promptFiles) {
      evaluateAssetSync(
        `prompts/${file}`,
        "prompts",
        path.join(sourcePromptsDir, file),
        path.join(runtimePromptsDir, file)
      );
    }
  }

  // 3. Sync Extensions (capabilities/extensions/* -> ~/.pi/agent/extensions/*)
  const sourceExtDir = path.join(repoPath, "capabilities", "extensions");
  const runtimeExtDir = path.join(agentDir, "extensions");
  if (fs.existsSync(sourceExtDir)) {
    const extFiles = fs.readdirSync(sourceExtDir).filter((f) => f.endsWith(".ts"));
    for (const file of extFiles) {
      evaluateAssetSync(
        `extensions/${file}`,
        "extensions",
        path.join(sourceExtDir, file),
        path.join(runtimeExtDir, file)
      );
    }
  }

  // 4. Sync Skills (capabilities/skills/repository-intelligence -> ~/.pi/agent/skills/repository-intelligence)
  const sourceSkillPath = path.join(repoPath, "capabilities", "skills", "repository-intelligence");
  const runtimeSkillPath = path.join(agentDir, "skills", "repository-intelligence");
  if (fs.existsSync(sourceSkillPath)) {
    evaluateAssetSync(
      "skills/repository-intelligence",
      "skills",
      sourceSkillPath,
      runtimeSkillPath,
      true
    );
  }

  // 5. Sync Scope Map (capabilities/scopes.json -> runtime copy for /doctor reads)
  const sourceScopesPath = path.join(repoPath, "capabilities", "scopes.json");
  const runtimeScopesDir = path.join(agentDir);
  if (fs.existsSync(sourceScopesPath)) {
    evaluateAssetSync(
      "capabilities/scopes.json",
      "prompts",
      sourceScopesPath,
      path.join(runtimeScopesDir, "scopes.json")
    );
  }

  if (apply) {
    state.lastSyncTime = new Date().toISOString();
    saveSyncState(state);
  }

  return {
    dryRun: !apply,
    repoPath,
    items: results,
    counts,
  };
}

/**
 * Formats SyncSummary report for terminal / UI notification.
 */
export function formatSyncReport(summary: SyncSummary): string {
  const lines: string[] = [
    `Harness Pi Sync (${summary.dryRun ? "Dry-Run Preview" : "Execution Applied"})`,
    `Source: ${summary.repoPath}`,
    "==========================================",
  ];

  const statusIcons: Record<SyncActionStatus, string> = {
    unchanged: "✓",
    created: "+",
    updated: "↑",
    conflict: "⚡",
    protected: "⊘",
    skipped: "○",
    failed: "✗",
  };

  for (const item of summary.items) {
    const icon = statusIcons[item.status] || "•";
    const detail = item.detail ? ` (${item.detail})` : "";
    lines.push(`${icon} ${item.assetName.padEnd(32)} ${item.status.toUpperCase()}${detail}`);
  }

  lines.push("------------------------------------------");
  const c = summary.counts;
  lines.push(
    `Summary: ${c.created} created, ${c.updated} updated, ${c.unchanged} unchanged, ${c.conflict} conflicts, ${c.protected} protected, ${c.failed} failed`
  );

  if (summary.dryRun && (c.created > 0 || c.updated > 0 || c.conflict > 0)) {
    lines.push("\nRun '/sync --apply' to execute changes (or '/sync --apply --force' to overwrite local conflicts).");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// RAL Phase 3 — Dynamic Project-Aware Capability Scoping (D35)
// In-memory, per-turn skill-index filtering. No files are ever mutated.
// Fail-open: any scoping failure leaves the prompt unmodified (all skills visible).
// ---------------------------------------------------------------------------

export type ScopeMap = Record<string, string[]>;

export interface CapabilityResolution {
  activeNames: string[];
  availableNames: string[];
  coreNames: string[];
  profileTags: string[];
}

interface ScopeMapFile {
  core?: string[];
  scopes?: Record<string, string[]>;
}

const SCOPE_MAP_CACHE_TTL_MS = 30_000;
let scopeMapCache: { map: ScopeMap; core: string[]; loadedAt: number } | null = null;
const profileCacheByCwd = new Map<string, string[]>();

/**
 * Loads capabilities/scopes.json from the Blueprint repo. Cached briefly so
 * per-turn cost is zero I/O in steady state. Returns fail-open defaults on error.
 */
export function loadScopeMap(repoPath?: string): { map: ScopeMap; core: string[]; error?: string } {
  const now = Date.now();
  if (scopeMapCache && now - scopeMapCache.loadedAt < SCOPE_MAP_CACHE_TTL_MS) {
    return { map: scopeMapCache.map, core: scopeMapCache.core };
  }
  const repo = repoPath || process.env.BLUEPRINT_REPO_PATH || DEFAULT_BLUEPRINT_REPO_PATH;
  const scopesPath = path.join(repo, "capabilities", "scopes.json");
  try {
    const raw = JSON.parse(fs.readFileSync(scopesPath, "utf-8")) as ScopeMapFile;
    const map: ScopeMap = {};
    for (const [name, tags] of Object.entries(raw.scopes ?? {})) {
      if (Array.isArray(tags)) map[name] = tags;
    }
    const core = Array.isArray(raw.core) ? raw.core : [];
    scopeMapCache = { map, core, loadedAt: now };
    return { map, core };
  } catch (err) {
    // Fail-open: empty map means nothing gets scoped out; all skills stay visible.
    const error = err instanceof Error ? err.message : String(err);
    scopeMapCache = { map: {}, core: [], loadedAt: now };
    return { map: {}, core: [], error };
  }
}

/** Static deterministic mapping from topology traits to capability-domain tags. */
export function mapTopologyToProfile(topo: ProjectTopology): string[] {
  const cacheKey = `${topo.type}|${topo.framework ?? ""}`;
  const cached = profileCacheByCwd.get(cacheKey);
  if (cached) return cached;

  const tags = new Set<string>(["core"]);
  const t = topo.type.toLowerCase();
  const f = (topo.framework ?? "").toLowerCase();

  if (t.includes("typescript") || t.includes("javascript") || t.includes("node")) {
    tags.add("node");
    if (t.includes("typescript")) tags.add("typescript");
    else tags.add("javascript");
  }
  if (f.includes("next")) { tags.add("web"); tags.add("react"); tags.add("browser-testing"); }
  else if (f.includes("react")) { tags.add("web"); tags.add("react"); tags.add("browser-testing"); }
  else if (f.includes("remix") || f.includes("astro") || f.includes("nuxt") || f.includes("svelte")) { tags.add("web"); tags.add("browser-testing"); }
  else if (f.includes("nestjs") || f.includes("hono") || f.includes("fastify") || f.includes("express")) { tags.add("backend"); tags.add("api"); }
  else if (t.includes("node")) { tags.add("backend"); }

  if (t.includes("python")) {
    tags.add("python");
    if (f.includes("fastapi") || f.includes("django") || f.includes("flask")) tags.add("backend");
    else if (f.includes("torch") || f.includes("tensorflow")) { tags.add("ai-ml"); tags.add("data"); }
  }
  if (t.includes("rust")) { tags.add("rust"); tags.add("backend"); }
  if (t.includes("go")) { tags.add("go"); tags.add("backend"); }
  if (t.includes("roblox") || f.includes("rojo")) { tags.add("roblox"); tags.add("game"); tags.add("luau"); }

  const result = Array.from(tags);
  profileCacheByCwd.set(cacheKey, result);
  return result;
}

/**
 * Deterministic capability resolution over a loaded skill list.
 * ACTIVE = CORE ∪ {skills whose tags ∩ profile ≠ ∅}; everything else AVAILABLE.
 * Unmapped skills are treated as CORE (fail-open: unknown = always visible).
 */
export function resolveCapabilitySets(
  skills: ReadonlyArray<{ name: string }>,
  profileTags: readonly string[],
  scope: { map: ScopeMap; core: readonly string[] }
): CapabilityResolution {
  const profile = new Set(profileTags);
  const core = new Set(scope.core);
  const activeNames: string[] = [];
  const availableNames: string[] = [];
  for (const skill of skills) {
    if (core.has(skill.name)) { activeNames.push(skill.name); continue; }
    const skillTags = scope.map[skill.name];
    if (!skillTags || skillTags.some((tag) => profile.has(tag))) activeNames.push(skill.name);
    else availableNames.push(skill.name);
  }
  return { activeNames, availableNames, coreNames: [...core], profileTags: [...profileTags] };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Rebuilds the <available_skills> XML section with only ACTIVE skills,
 * mirroring Pi's stock formatSkillsForPrompt structure. Returns undefined on
 * fail-open (section not found in the prompt) so caller keeps original prompt.
 */
export function renderFilteredSystemPrompt(
  originalPrompt: string,
  allSkills: ReadonlyArray<{ name: string; description: string; filePath: string }>,
  activeNames: ReadonlySet<string>
): string | undefined {
  const start = originalPrompt.indexOf("<available_skills>");
  const endTag = "</available_skills>";
  const end = originalPrompt.indexOf(endTag);
  if (start === -1 || end === -1) return undefined;

  const visible = allSkills.filter((s) => activeNames.has(s.name));
  let replacement: string;
  if (visible.length === 0) {
    replacement = "";
  } else {
    const lines = [
      "\n\nThe following skills provide specialized instructions for specific tasks.",
      "Use the read tool to load a skill's file when the task matches its description.",
      "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
      "",
      "<available_skills>",
    ];
    for (const skill of visible) {
      lines.push("  <skill>");
      lines.push(`    <name>${escapeXml(skill.name)}</name>`);
      lines.push(`    <description>${escapeXml(skill.description)}</description>`);
      lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
      lines.push("  </skill>");
    }
    lines.push("</available_skills>");
    replacement = lines.join("\n");
  }
  const before = originalPrompt.slice(0, start).replace(/\n\n$/, "\n");
  const after = originalPrompt.slice(end + endTag.length);
  return before + replacement + after;
}

/**
 * Lists currently deployed runtime skills by scanning the agent skills
 * directory tree for SKILL.md files and extracting name/description from
 * frontmatter. Used by /doctor for scoping observability (read-only).
 */
export function listRuntimeSkills(agentDir?: string): Array<{ name: string; description: string; filePath: string }> {
  const base = agentDir || path.join(os.homedir(), ".pi", "agent");
  const roots: string[] = [];
  const settingsPath = path.join(base, "settings.json");
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as { skills?: string[] };
      for (const entry of settings.skills ?? []) {
        roots.push(entry.replace(/^~(?=\/|$)/, os.homedir()));
      }
    }
  } catch {}
  const skills: Array<{ name: string; description: string; filePath: string }> = [];
  const seen = new Set<string>();
  function scanDir(dir: string): void {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        scanDir(full);
      } else if (entry.name === "SKILL.md") {
        try {
          const content = fs.readFileSync(full, "utf-8").slice(0, 4000);
          const fm = content.match(/^---\n([\s\S]*?)\n---/);
          const body = fm ? fm[1] : "";
          const name = body.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? path.basename(path.dirname(full));

          if (seen.has(name)) continue;
          seen.add(name);
          let desc = body.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
          if (desc.length > 160) desc = desc.slice(0, 157) + "...";
          skills.push({ name, description: desc.replace(/\s+/g, " "), filePath: full });
        } catch {}
      }
    }
  }
  for (const root of roots) scanDir(root);
  return skills;
}

// ---------------------------------------------------------------------------
// RAL Phase 4 — Runtime Model Catalog bridge (D36)
// Pi-native dynamic provider registration: refreshModels() bridges the live
// 9router /v1/models catalog into Pi's /model selector. models.json and
// auth.json are never read or written by this code path.
// ---------------------------------------------------------------------------

type CanonicalThinkingFormat =
  | "openai" | "openrouter" | "deepseek" | "together" | "zai"
  | "qwen" | "chat-template" | "qwen-chat-template" | "string-thinking" | "ant-ling";

const CANONICAL_THINKING_FORMATS: ReadonlySet<string> = new Set<CanonicalThinkingFormat>([
  "openai", "openrouter", "deepseek", "together", "zai",
  "qwen", "chat-template", "qwen-chat-template", "string-thinking", "ant-ling",
]);

export interface RouterModel {
  id?: unknown;
  context_length?: unknown;
  max_completion_tokens?: unknown;
  capabilities?: {
    reasoning?: unknown;
    vision?: unknown;
    thinkingFormat?: unknown;
  } | null;
}

export interface PiModelDefinition {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  compat?: { thinkingFormat?: CanonicalThinkingFormat };
}

/**
 * Pure deterministic mapping from a 9router model entry to a Pi model
 * definition. Returns undefined for entries that cannot be mapped safely
 * (missing id/context/tokens). Never fabricates capability semantics:
 * non-canonical thinkingFormats are omitted rather than translated.
 */
export function mapRouterModelToPi(model: RouterModel): PiModelDefinition | undefined {
  if (typeof model.id !== "string" || model.id.length === 0) return undefined;
  const ctx = typeof model.context_length === "number" ? model.context_length : NaN;
  const maxTok = typeof model.max_completion_tokens === "number" ? model.max_completion_tokens : NaN;
  if (!Number.isFinite(ctx) || !Number.isFinite(maxTok)) return undefined;

  const caps = model.capabilities ?? {};
  const reasoning = caps.reasoning === true;
  const input: ("text" | "image")[] = caps.vision === true ? ["text", "image"] : ["text"];

  const def: PiModelDefinition = {
    id: model.id,
    name: model.id,
    reasoning,
    input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: ctx,
    maxTokens: maxTok,
  };
  const tf = caps.thinkingFormat;
  if (typeof tf === "string" && CANONICAL_THINKING_FORMATS.has(tf)) {
    def.compat = { thinkingFormat: tf as CanonicalThinkingFormat };
  }
  return def;
}

/** Maps a full /v1/models payload to Pi definitions, skipping malformed entries. */
export function mapRouterCatalog(payload: unknown): PiModelDefinition[] {
  const data = (payload as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: PiModelDefinition[] = [];
  const seen = new Set<string>();
  for (const entry of data) {
    if (entry === null || typeof entry !== "object") continue;
    const mapped = mapRouterModelToPi(entry);
    if (mapped && !seen.has(mapped.id)) {
      seen.add(mapped.id);
      out.push(mapped);
    }
  }
  return out;
}

/** Fetches the live router catalog via the shared transport. Throws on failure. */
async function fetchRouterCatalog(): Promise<PiModelDefinition[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTER_HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(ROUTER_ENDPOINT, {
      signal: controller.signal,
      headers: { Authorization: "Bearer sk_9router" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return mapRouterCatalog(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Display metadata for reasoning profiles in the Model Control Center. */
export const PROFILE_DESCRIPTIONS: Record<ReasoningProfileName, string> = {
  Default: "Normal interactions",
  Plan: "Planning & architecture",
  Task: "Execution-oriented work",
  Review: "Critique & verification",
  Vision: "Visual reasoning",
  Advisor: "Decision support",
  Synthesis: "Deep synthesis",
  Commit: "Commit-oriented work",
  Research: "Research-oriented work",
  Coding: "Implementation-oriented work",
};

/** Profile groupings for the MCC overview (information architecture only). */
export const PROFILE_GROUPS: Array<{ title: string; items: ReasoningProfileName[] }> = [
  { title: "GENERAL", items: ["Default", "Task", "Review"] },
  { title: "PLANNING", items: ["Plan", "Advisor", "Research"] },
  { title: "EXECUTION", items: ["Coding", "Synthesis", "Commit"] },
  { title: "SPECIALIZED", items: ["Vision"] },
];

/** Lists model specs from the session registry (fail-open to []). */
export function listAvailableModelSpecsSafe(ctx: ExtensionCommandContext): string[] {
  try {
    const models = ctx.modelRegistry.getAll();
    return models.map((m) => `${m.provider}/${m.id}`);
  } catch {
    return [];
  }
}

/** Stable value token encoding a profile row in the /mcc overview. */
export function mccProfileValue(name: ReasoningProfileName): string {
  return `profile:${name}`;
}

/** Orders model specs: 9router catalog first (alphabetical), then the rest. */
export function sortModelsRouterFirst(specs: readonly string[]): string[] {
  const isRouter = (s: string) => s.startsWith("9router/");
  return [...specs].sort((a, b) =>
    isRouter(a) === isRouter(b) ? a.localeCompare(b) : isRouter(a) ? -1 : 1,
  );
}


// ---------------------------------------------------------------------------
// RAL Phase 5 — Complexity-aware orchestration & reasoning profiles (D37)
// Effort controls reasoning DEPTH, never agent count. Strategy caps are
// enforced at the workflow tool boundary; HEAVY requires explicit approval.
// ---------------------------------------------------------------------------

export type ExecutionStrategy = "DIRECT" | "LIGHT" | "FULL" | "HEAVY";

/** Agent ceilings per strategy (policy defaults, not runtime hard limits). */
export const STRATEGY_CAPS: Record<Exclude<ExecutionStrategy, "HEAVY">, number> = {
  DIRECT: 1,
  LIGHT: 3,
  FULL: 8,
};

export type ReasoningProfileName =
  | "Default" | "Plan" | "Task" | "Review" | "Vision"
  | "Advisor" | "Synthesis" | "Commit" | "Research" | "Coding";

export const REASONING_PROFILES: readonly ReasoningProfileName[] = [
  "Default", "Plan", "Task", "Review", "Vision",
  "Advisor", "Synthesis", "Commit", "Research", "Coding",
];

/** Profile default thinking levels (user may override per selection). */
export const PROFILE_DEFAULT_LEVELS: Record<ReasoningProfileName, string> = {
  Default: "medium",
  Plan: "high",
  Task: "high",
  Review: "high",
  Vision: "medium",
  Advisor: "high",
  Synthesis: "high",
  Commit: "low",
  Research: "high",
  Coding: "high",
};

/**
 * User-facing reasoning level → canonical pi-ai/pi runtime value.
 * "Ultra" maps to the runtime's xhigh tier; runtime `max` remains reachable
 * via Pi's native /thinking-level command for power users.
 */
export const USER_LEVEL_MAP: Record<string, string> = {
  "Off": "off",
  "Low": "low",
  "Medium": "medium",
  "High": "high",
  "Ultra": "xhigh",
};

export interface ReasoningProfileState {
  profile: ReasoningProfileName;
  level: string;
}

const REASONING_STATE_FILE = path.join(os.homedir(), ".pi", "agent", "harness-reasoning.json");

let heavyApprovalState: { ceiling: number } | null = null;

/** Parses the declared complexity tag from a workflow script header comment. */
export function parseComplexityTag(script: string): ExecutionStrategy | undefined {
  const m = script.match(/^\s*\/\/\s*complexity:\s*(DIRECT|LIGHT|FULL|HEAVY)\b/im);
  return m ? (m[1] as ExecutionStrategy) : undefined;
}

/** Deterministic cap for a strategy; HEAVY has no numeric cap (approval-gated). */
export function strategyCap(strategy: ExecutionStrategy): number | undefined {
  return strategy === "HEAVY" ? undefined : STRATEGY_CAPS[strategy];
}

/** Clamps a requested maxAgents into the strategy's ceiling. */
export function clampAgents(strategy: ExecutionStrategy, requested: number | undefined): number {
  const cap = strategyCap(strategy);
  const req = typeof requested === "number" && Number.isFinite(requested) ? Math.floor(requested) : 1;
  return cap === undefined ? req : Math.max(1, Math.min(req, cap));
}

/** Maps a canonical runtime level back to its user-facing label. */
export function levelLabelForRuntime(runtimeLevel: string): string | undefined {
  return Object.entries(USER_LEVEL_MAP).find(([, v]) => v === runtimeLevel)?.[0];
}

// --- Model Control Center state (v2): per-profile overrides + active selection ---

export interface ReasoningStateV2 {
  activeProfile: ReasoningProfileName;
  activeLevel: string;
  overrides: Partial<Record<ReasoningProfileName, string>>;
}

/** Effective level for a profile = user override, else the profile default. */
export function effectiveLevel(profile: ReasoningProfileName, overrides: Partial<Record<ReasoningProfileName, string>>): string {
  return overrides[profile] ?? PROFILE_DEFAULT_LEVELS[profile];
}

/** Loads full v2 reasoning state; migrates legacy {profile, level} files. */
export function loadReasoningStateV2(): ReasoningStateV2 {
  try {
    const raw = JSON.parse(fs.readFileSync(REASONING_STATE_FILE, "utf-8")) as Partial<ReasoningStateV2> & Partial<ReasoningProfileState>;
    const activeProfile = REASONING_PROFILES.includes(raw.activeProfile as ReasoningProfileName)
      ? (raw.activeProfile as ReasoningProfileName)
      : "Default";
    const overrides: Partial<Record<ReasoningProfileName, string>> = {};
    if (raw.overrides && typeof raw.overrides === "object") {
      for (const [k, v] of Object.entries(raw.overrides)) {
        if (REASONING_PROFILES.includes(k as ReasoningProfileName) && typeof v === "string") {
          overrides[k as ReasoningProfileName] = v;
        }
      }
    }
    // Legacy migration: old shape stored a single active profile/level pair.
    if (typeof raw.level === "string" && overrides[activeProfile] === undefined) {
      overrides[activeProfile] = raw.level;
    }
    const activeLevel =
      typeof raw.activeLevel === "string"
        ? raw.activeLevel
        : effectiveLevel(activeProfile, overrides);
    return { activeProfile, activeLevel, overrides };
  } catch {
    return { activeProfile: "Default", activeLevel: PROFILE_DEFAULT_LEVELS.Default, overrides: {} };
  }
}

/** Persists v2 reasoning state. Overrides are pruned to valid profiles/levels on write. */
export function saveReasoningStateV2(state: ReasoningStateV2): void {
  try {
    const overrides: Partial<Record<ReasoningProfileName, string>> = {};
    for (const [k, v] of Object.entries(state.overrides ?? {})) {
      if (REASONING_PROFILES.includes(k as ReasoningProfileName) && typeof v === "string" && v.length > 0) {
        overrides[k as ReasoningProfileName] = v;
      }
    }
    const activeProfile = REASONING_PROFILES.includes(state.activeProfile) ? state.activeProfile : "Default";
    const activeLevel =
      typeof state.activeLevel === "string" && state.activeLevel.length > 0
        ? state.activeLevel
        : effectiveLevel(activeProfile, overrides);
    fs.writeFileSync(
      REASONING_STATE_FILE,
      JSON.stringify({ activeProfile, activeLevel, overrides }, null, 2),
      "utf-8",
    );
  } catch {}
}

/**
 * Loads persisted reasoning-profile configuration (runtime-owned state).
 * Single read path over the v2 state; legacy {profile, level} files are
 * migrated by loadReasoningStateV2. Fail-open: unknown values fall back to
 * Default with its profile default level.
 */
export function loadReasoningProfile(): ReasoningProfileState {
  const state = loadReasoningStateV2();
  return { profile: state.activeProfile, level: state.activeLevel };
}

const ORCHESTRATION_CONTRACT = `
# Orchestration Governance (supersedes any earlier effort/fan-out directives)
- Effort level controls REASONING DEPTH and verification rigor — NEVER agent count.
- ULTRA/HIGH on a simple task means one agent reasoning deeply with thorough self-review.
- Before calling the workflow tool you MUST assess complexity and declare it as the FIRST line of the script:
  // complexity: DIRECT | LIGHT | FULL | HEAVY
  // workstreams: <n>; parallelizable: yes|no; risk: low|medium|high
- Caps: DIRECT=1 agent, LIGHT<=3, FULL<=8. HEAVY requires explicit user approval (you will be prompted).
- Never set maxAgents above your declared strategy's cap.
- Model policy: USE CURRENT MODEL. Sub-agents inherit the session model. Do NOT add model overrides
  (model:/baseUrl:) to workflow scripts unless the user explicitly approved a different model.
  If you believe a different model is required, ask the user first.`;

/** Detects explicit model overrides in a workflow script (silent-switch guard). */
export function scriptHasModelOverrides(script: string): boolean {
  return /^\s*(?:\w+\.)?model\s*:/im.test(script) || /meta\.model\s*=/.test(script);
}
// ---------------------------------------------------------------------------
// Model Control Center UI (D39/D41): grouped overview list with structural,
// never-selectable section headers, columnar rows, and a distinct active-
// profile marker. Built on pi-tui primitives only — no new UI framework.
// ---------------------------------------------------------------------------

/** One selectable row in the MCC overview. */
export interface MccItem {
  value: string;
  primary: string;
  description?: string;
  /** Appends the success-colored ●active marker (active reasoning profile). */
  marked?: boolean;
}

/** One non-selectable informational row (e.g. Vision without image input). */
export interface MccDisabled {
  primary: string;
  description?: string;
}

export type MccRow = { kind: "item"; item: MccItem } | { kind: "disabled"; disabled: MccDisabled };

export interface MccSection {
  /** Rendered as a structural header rule; "" renders no header. */
  title: string;
  rows: MccRow[];
}

type MccLine =
  | { kind: "spacer" }
  | { kind: "header"; title: string }
  | { kind: "item"; item: MccItem; index: number }
  | { kind: "disabled"; disabled: MccDisabled };

const MCC_ACTIVE_MARKER = "●active";

/**
 * Grouped selection list for the /mcc overview. Headers and disabled rows are
 * rendered but skipped by navigation; arrow keys wrap across selectable items
 * only. Viewport-limited to maxLines rendered lines with a scroll indicator.
 */
export class MccOverviewList implements Component {
  private readonly items: MccItem[] = [];
  private selectedIndex = 0;
  onSelect?: (value: string) => void;
  onCancel?: () => void;

  constructor(
    private readonly sections: readonly MccSection[],
    private readonly theme: Theme,
    private readonly maxLines = 14,
  ) {
    for (const s of sections) {
      for (const row of s.rows) {
        if (row.kind === "item") this.items.push(row.item);
      }
    }
  }

  invalidate(): void {}

  handleInput(data: string): void {
    const kb = getKeybindings();
    const count = this.items.length;
    if (count === 0) return;
    if (kb.matches(data, "tui.select.up")) {
      this.selectedIndex = (this.selectedIndex - 1 + count) % count;
    } else if (kb.matches(data, "tui.select.down")) {
      this.selectedIndex = (this.selectedIndex + 1) % count;
    } else if (kb.matches(data, "tui.select.confirm")) {
      const item = this.items[this.selectedIndex];
      if (item && this.onSelect) this.onSelect(item.value);
    } else if (kb.matches(data, "tui.select.cancel")) {
      if (this.onCancel) this.onCancel();
    }
  }

  render(width: number): string[] {
    const lines = this.layout();
    const labelCol = this.labelColumnWidth(width);
    const selectedLine = lines.findIndex((l) => l.kind === "item" && l.item.value === this.items[this.selectedIndex]?.value);
    const start = Math.max(
      0,
      Math.min(selectedLine - Math.floor((this.maxLines - 1) / 2), Math.max(0, lines.length - this.maxLines)),
    );
    const visible = lines.slice(start, start + this.maxLines);
    // Never open the window on blank space, and never end it on an orphan
    // header/spacer (a header with none of its rows visible reads as broken).
    while (visible.length > 0 && visible[0].kind === "spacer") visible.shift();
    while (
      visible.length > 1 &&
      visible[visible.length - 1].kind !== "item" &&
      visible.some((l) => l.kind === "item")
    ) {
      visible.pop();
    }

    const out: string[] = [];
    for (const line of visible) {
      switch (line.kind) {
        case "spacer":
          out.push("");
          break;
        case "header":
          out.push(this.renderHeader(line.title, width));
          break;
        case "item":
          out.push(this.renderItem(line.item, line.index === this.selectedIndex, labelCol, width));
          break;
        case "disabled":
          out.push(this.renderDisabled(line.disabled, labelCol, width));
          break;
      }
    }
    if (lines.length > this.maxLines && this.items.length > 0) {
      out.push(this.theme.fg("dim", `  (${this.selectedIndex + 1}/${this.items.length})`));
    }
    return out;
  }

  private layout(): MccLine[] {
    const lines: MccLine[] = [];
    let nextIndex = 0;
    this.sections.forEach((section, si) => {
      if (si > 0) lines.push({ kind: "spacer" });
      if (section.title) lines.push({ kind: "header", title: section.title });
      for (const row of section.rows) {
        if (row.kind === "item") {
          lines.push({ kind: "item", item: row.item, index: nextIndex++ });
        } else {
          lines.push({ kind: "disabled", disabled: row.disabled });
        }
      }
    });
    return lines;
  }

  private labelColumnWidth(width: number): number {
    let widest = 0;
    for (const s of this.sections) {
      for (const row of s.rows) {
        const primary = row.kind === "item" ? row.item.primary : row.disabled.primary;
        const marked = row.kind === "item" && row.item.marked ? MCC_ACTIVE_MARKER.length + 1 : 0;
        widest = Math.max(widest, visibleWidth(primary) + marked);
      }
    }
    return Math.max(16, Math.min(34, widest + 2, Math.max(16, width - 12)));
  }

  private renderHeader(title: string, width: number): string {
    const text = ` ${title} `;
    const w = visibleWidth(text);
    if (width <= w + 3) return this.theme.fg("accent", this.theme.bold(truncateToWidth(text, width, "")));
    return (
      this.theme.fg("accent", this.theme.bold(text)) +
      this.theme.fg("dim", "─".repeat(Math.max(0, width - w)))
    );
  }

  private renderItem(item: MccItem, selected: boolean, labelCol: number, width: number): string {
    const prefix = selected ? this.theme.fg("accent", "→ ") : "  ";
    const cell =
      truncateToWidth(item.primary, labelCol, "", true) +
      (item.marked ? this.theme.fg("success", truncateToWidth(` ${MCC_ACTIVE_MARKER}`, Math.max(0, labelCol - visibleWidth(item.primary)), "", true)) : "");
    let descPart = "";
    if (item.description && width > 40) {
      const remaining = width - 2 - labelCol;
      if (remaining >= 10) descPart = this.theme.fg("muted", truncateToWidth(item.description, remaining));
    }
    const line = prefix + cell + descPart;
    if (selected) {
      const padTo = Math.max(0, width - 2 - labelCol - visibleWidth(descPart));
      return this.theme.bg("selectedBg", this.theme.bold(prefix + cell + descPart + " ".repeat(padTo)));
    }
    return line;
  }

  private renderDisabled(disabled: MccDisabled, labelCol: number, width: number): string {
    const cell = truncateToWidth(disabled.primary, labelCol, "", true);
    let descPlain = "";
    if (disabled.description && width > 40) {
      const remaining = width - 2 - labelCol;
      if (remaining >= 10) descPlain = truncateToWidth(disabled.description, remaining);
    }
    return this.theme.fg("dim", "  " + cell + descPlain);
  }
}

export default function (pi: ExtensionAPI) {


  // Phase 4 (D36): bridge the live 9router catalog into Pi's /model selector via
  // the native dynamic-provider mechanism. Only the "9router" provider id is
  // touched; all other providers remain untouched. Fail-open: refresh errors are
  // handled by Pi's per-provider error isolation and keep the previous catalog.
  pi.registerProvider("9router", {
    name: "9router",
    baseUrl: ROUTER_BASE_URL,
    models: [],
    async refreshModels(ctx) {
      if (ctx.allowNetwork === false) return []; // offline: serve store-only
      const models = await fetchRouterCatalog();
      if (models.length === 0) {
        // Entire response invalid/empty: prefer previous usable catalog.
        const stored = await ctx.store?.read?.();
        const prior = [...((stored?.models ?? []) as readonly PiModelDefinition[])];
        if (prior.length > 0) return prior;
      }
      return models;
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    // Whole body guarded: async continuations can run after the runner goes
    // inactive (headless runs), where every ctx accessor throws assertActive.
    try {
      const topo = detectProjectTopology(ctx.cwd);
      try {
        if (ctx.hasUI) ctx.ui.setStatus("topology", `${topo.name} [${topo.type}${topo.framework ? `/${topo.framework}` : ""}]`);
      } catch {}

      check9routerHealth()
        .then(async (health) => {
          try {
            if (health.ok) {
              if (ctx.hasUI) ctx.ui.setStatus("9router", "online");
              // Warm the registry so the dynamic 9router catalog is resolvable
              // immediately (no first-visit lag, no "No models available" gap).
              try {
                void ctx.modelRegistry.refresh();
              } catch {}
            } else {
              await autoStart9router(ctx);
            }
          } catch {}
        })
        .catch(() => {});
    } catch {}
  });


  // Phase 6 (D38): integrated /model flow — after the user selects a model via
  // Pi's native selector (which auto-refreshes providers via D36), offer
  // reasoning profile + level selection in one coherent flow. The session
  // model is whatever the user just picked; profiles never change it.
  pi.on("model_select", async (_event, ctx) => {
    try {
      if (!ctx.hasUI) return;
      const model = ctx.model;
      if (!model) return;

      const supportsVision = Array.isArray(model.input) && model.input.includes("image");
      const profileChoices = REASONING_PROFILES.filter(
        (p) => p !== "Vision" || supportsVision,
      );
      const current = loadReasoningProfile();

      const profile = await ctx.ui.select("Reasoning Profile", profileChoices);
      if (!profile) return; // cancelled → keep previous configuration

      const defaultLevel =
        profile === current.profile ? current.level : PROFILE_DEFAULT_LEVELS[profile as ReasoningProfileName];
      const levelLabels = Object.keys(USER_LEVEL_MAP);
      const levelLabel = await ctx.ui.select(
        `Reasoning Level (${profile})`,
        levelLabels,
      );
      if (!levelLabel) return;

      const runtimeLevel = USER_LEVEL_MAP[levelLabel] as never;
      const state = loadReasoningStateV2();
      state.activeProfile = profile as ReasoningProfileName;
      state.activeLevel = runtimeLevel;
      state.overrides[state.activeProfile] = runtimeLevel;
      saveReasoningStateV2(state);
      // Native setter clamps to the selected model's capabilities.
      pi.setThinkingLevel(runtimeLevel);
      ctx.ui.notify(`Model: ${model.provider}/${model.id} · Profile: ${profile} · Level: ${levelLabel}`, "info");
    } catch {}
  });
  pi.on("before_agent_start", (event, ctx) => {
    const topo = detectProjectTopology(ctx.cwd);
    const topoContext = formatTopologyContext(topo);

    // Phase 3: per-turn skill-index scoping. Fail-open on any problem.
    let scopedPrompt: string | undefined;
    try {
      const skills = event.systemPromptOptions?.skills ?? [];
      if (skills.length > 0) {
        const profileTags = mapTopologyToProfile(topo);
        const scope = loadScopeMap();
        const resolution = resolveCapabilitySets(skills, profileTags, scope);
        const activeSet = new Set(resolution.activeNames);
        scopedPrompt = renderFilteredSystemPrompt(event.systemPrompt, skills, activeSet);
      }
    } catch {
      scopedPrompt = undefined; // fail-open
    }

    const basePrompt = scopedPrompt ?? event.systemPrompt;
    const rp = loadReasoningProfile();
    return {
      systemPrompt: `${basePrompt}\n\n# Active Workspace Environment\n${topoContext}\n${ORCHESTRATION_CONTRACT}\n# Reasoning Profile\nActive profile: ${rp.profile} @ reasoning level ${rp.level}. Honor this depth for planning/review/synthesis phases; when writing workflow scripts, use ":${rp.level}" thinking suffixes on agent() calls for the matching phases.`,
    };
  });

  // Phase 5 (D37): complexity-aware orchestration enforcement at the workflow
  // tool boundary. Strategy caps are hard; HEAVY requires explicit approval.
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "workflow") return;
    const input = event.input as { maxAgents?: unknown; script?: unknown };

    // Model-policy guard: block silent model switching in workflow scripts.
    if (typeof input.script === "string" && scriptHasModelOverrides(input.script)) {
      if (ctx.hasUI) {
        const choice = await ctx.ui.select(
          "Model change requested",
          [
            "Keep current model (strip model overrides from script)",
            "Allow these models for this workflow run",
          ],
        );
        if (choice?.startsWith("Keep")) {
          input.script = input.script
            .split("\n")
            .filter((l) => !/^\s*(?:\w+\.)?model\s*:/i.test(l) && !/meta\.model\s*=/i.test(l))
            .join("\n");
          ctx.ui.notify("Model overrides stripped — workflow will use the current session model.", "info");
        } else if (choice?.startsWith("Allow")) {
          ctx.ui.notify("Model overrides allowed for this workflow run.", "info");
        } else {
          return { block: true, reason: "Model policy unresolved: choose Keep current model or Allow in the prompt." };
        }
      } else {
        return { block: true, reason: "Model overrides present but no UI available to approve them. Remove model:/meta.model from the script or run interactively." };
      }
    }

    // Complexity strategy enforcement.
    const script = typeof input.script === "string" ? input.script : "";
    const declared = parseComplexityTag(script);
    const requested = typeof input.maxAgents === "number" ? input.maxAgents : undefined;
    let strategy: ExecutionStrategy = declared ?? (requested && requested > 8 ? "HEAVY" : "LIGHT");

    if (strategy === "HEAVY" && heavyApprovalState === null) {
      if (!ctx.hasUI) {
        return { block: true, reason: "HEAVY fan-out requires user approval, but no interactive UI is available. Reduce maxAgents to <=8." };
      }
      const choice = await ctx.ui.select(
        "Execution Strategy — HEAVY fan-out requested",
        [
          `Multi-agent (up to ${requested ?? "N"} agents as scripted)`,
          "Single-agent (sequential, cap 1)",
          "Let Harness decide (cap 8)",
        ],
      );
      if (!choice || choice.startsWith("Single")) {
        heavyApprovalState = { ceiling: 1 };
        input.maxAgents = 1;
        strategy = "DIRECT";
      } else if (choice.startsWith("Let")) {
        heavyApprovalState = { ceiling: STRATEGY_CAPS.FULL };
        input.maxAgents = STRATEGY_CAPS.FULL;
        strategy = "FULL";
      } else {
        heavyApprovalState = { ceiling: typeof requested === "number" ? requested : 16 };
      }
    }

    const ceiling = heavyApprovalState?.ceiling;
    if (typeof requested === "number") {
      const capped = clampAgents(strategy, requested);
      const effective = ceiling !== undefined ? Math.min(capped, ceiling) : capped;
      if (effective !== requested) input.maxAgents = effective;
    }
    if (strategy === "HEAVY" && !heavyApprovalState) {
      return { block: true, reason: "HEAVY fan-out requires explicit user approval." };
    }
  });

  pi.registerCommand("doctor", {
    description: "Run Harness Pi environment, router, MCP, permissions, and sync diagnostics",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      ctx.ui.notify("Running Harness Pi diagnostic scan…", "info");

      const results: string[] = ["Harness Pi Doctor Report", "========================"];

      results.push(`✓ Pi Runtime: Node ${process.version} (${process.platform} ${process.arch})`);

      const routerHealth = await check9routerHealth();
      if (routerHealth.ok) {
        results.push(`✓ 9router: Online (:20128) — ${routerHealth.modelCount ?? "~200"} models available (live refresh enabled via RAL)`);
      } else {
        results.push(`✗ 9router: Offline (${routerHealth.error ?? "connection refused"})`);
      }

      // Model catalog drift check: warn when the session's configured model is
      // no longer served by the live router (prevents silent request failures).
      try {
        const liveCatalog = await fetchRouterCatalog();
        const liveIds = new Set(liveCatalog.map((m) => m.id));
        const currentModel = ctx.model;
        if (currentModel && currentModel.provider === "9router" && !liveIds.has(currentModel.id)) {
          results.push(`! Model Catalog: configured model "${currentModel.id}" is NOT in the live router catalog — select a current model via /model`);
        } else if (currentModel) {
          results.push(`✓ Model Catalog: current model "${currentModel.id}" is live-router current`);
        }
      } catch {
        results.push("! Model Catalog: could not verify against live router (offline?)");
      }

      const mcpPath = path.join(os.homedir(), ".config", "mcp", "mcp.json");
      if (fs.existsSync(mcpPath)) {
        try {
          const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
          const servers = Object.keys(mcp.mcpServers || {});
          results.push(`✓ MCP Configuration: ${servers.length} pinned servers configured (${servers.join(", ")})`);
        } catch {
          results.push(`✗ MCP Configuration: Invalid JSON in ${mcpPath}`);
        }
      } else {
        results.push(`✗ MCP Configuration: Missing ${mcpPath}`);
      }

      const permConfigPath = path.join(os.homedir(), ".pi", "agent", "extensions", "pi-permission-system", "config.json");
      if (fs.existsSync(permConfigPath)) {
        results.push("✓ Permission System: Active (path protection + bash deny rules)");
      } else {
        results.push(`✗ Permission System: Missing config at ${permConfigPath}`);
      }

      const topo = detectProjectTopology(ctx.cwd);
      const scope = loadScopeMap();
      const profileTags = mapTopologyToProfile(topo);
      const allSkills = listRuntimeSkills();
      const resolution = resolveCapabilitySets(allSkills, profileTags, scope);
      results.push(`✓ Capability Profile: ${resolution.profileTags.join(", ")}`);
      results.push(`  Active (${resolution.activeNames.length}): ${resolution.activeNames.join(", ") || "(none)"}`);
      if (scope.error) {
        results.push(`! Scope Map: failed to load (${scope.error}) — fail-open, all skills visible`);
      } else {
        results.push(`  Available via /skill:<name> (${resolution.availableNames.length}): ${resolution.availableNames.join(", ") || "(none)"}`);
      }
      results.push("✓ Governance: Blueprint-approved capabilities only; escape hatch /skill:<name>");

      const extDir = path.join(os.homedir(), ".pi", "agent", "extensions");
      const powerToolsExists = fs.existsSync(path.join(extDir, "power-tools.ts"));
      results.push(`✓ Platform Extensions: power-tools (${powerToolsExists ? "active" : "missing"}), runtime-orchestrator (active)`);

      // Sync State Diagnostic
      const syncSummary = executeSync({ apply: false });
      const pendingChanges = syncSummary.counts.created + syncSummary.counts.updated + syncSummary.counts.conflict;
      if (pendingChanges === 0) {
        results.push("✓ Asset Sync: Up to date (all runtime assets match Blueprint source)");
      } else {
        results.push(`! Asset Sync: ${pendingChanges} pending changes (run /sync --apply to align)`);
      }

      results.push(`✓ Current Workspace: ${topo.name} [${topo.type}${topo.framework ? `, ${topo.framework}` : ""}${topo.packageManager ? `, ${topo.packageManager}` : ""}${topo.gitBranch ? `, branch:${topo.gitBranch}` : ""}]`);

      const report = results.join("\n");
      ctx.ui.notify(report, routerHealth.ok && pendingChanges === 0 ? "info" : "warning");
    },
  });


  // D41: /mcc — re-enterable Model Control Center. Grouped overview with
  // structural (never-selectable) section headers, columnar rows, distinct
  // active-profile marker, fuzzy-filtered router-first model picker, and
  // immediate overview refresh after every save.
  pi.registerCommand("mcc", {
    description: "Model Control Center — inspect current model and configure reasoning profiles",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      await ctx.waitForIdle();

      // Pi's placeholder model has provider/id/api all set to "unknown" before
      // any real selection; treat it as "no model" rather than displaying it.
      const isPlaceholder =
        !!ctx.model && ctx.model.provider === "unknown" && ctx.model.id === "unknown";

      let modelLabel = isPlaceholder || !ctx.model
        ? "(none — choose below)"
        : `${ctx.model.provider}/${ctx.model.id}`;

      const supportsVision =
        !!ctx.model && !isPlaceholder &&
        Array.isArray(ctx.model.input) && ctx.model.input.includes("image");

      for (;;) {
        const state = loadReasoningStateV2();

        // ---- Overview: grouped sections; headers/disabled rows are structural ----
        const profileByValue: Record<string, ReasoningProfileName> = {};
        const sections: MccSection[] = [
          {
            title: "MODEL",
            rows: [{ kind: "item", item: { value: "__model__", primary: "Select model…" } }],
          },
        ];
        for (const g of PROFILE_GROUPS) {
          const rows: MccRow[] = [];
          for (const name of g.items) {
            if (name === "Vision" && !supportsVision) {
              rows.push({
                kind: "disabled",
                disabled: { primary: `${name} · unavailable`, description: "current model has no image input" },
              });
              continue;
            }
            profileByValue[mccProfileValue(name)] = name;
            rows.push({
              kind: "item",
              item: {
                value: mccProfileValue(name),
                primary: `${name} · ${effectiveLevel(name, state.overrides)}`,
                description: PROFILE_DESCRIPTIONS[name],
                marked: state.activeProfile === name,
              },
            });
          }
          sections.push({ title: g.title, rows });
        }
        sections.push({
          title: "",
          rows: [{ kind: "item", item: { value: "__done__", primary: "Done", description: "Save & exit" } }],
        });

        const overviewPicked = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
          const container = new Container();
          container.addChild(new Text(theme.fg("accent", theme.bold("MODEL CONTROL CENTER")), 1, 0));
          container.addChild(new Text(theme.fg("text", `Current model: ${modelLabel}`), 0, 1));
          container.addChild(new Spacer(1));
          const list = new MccOverviewList(sections, theme, 14);
          list.onSelect = (value) => done(value);
          list.onCancel = () => done("__done__"); // esc exits the MCC
          container.addChild(list);
          container.addChild(new Spacer(1));
          container.addChild(new Text(theme.fg("dim", "↑↓ navigate · enter select · esc done"), 1, 0));
          return {
            render: (w: number) => container.render(w),
            invalidate: () => container.invalidate(),
            handleInput: (data: string) => {
              list.handleInput(data);
              tui.requestRender();
            },
          };
        });

        if (overviewPicked === null || overviewPicked === "__done__") return;

        // ---- Select model (viewport-limited, fuzzy-filtered, router-first) ----
        if (overviewPicked === "__model__") {
          const specs = sortModelsRouterFirst(listAvailableModelSpecsSafe(ctx));
          if (specs.length === 0) {
            ctx.ui.notify("No models available in the registry.", "warning");
            continue;
          }
          const pickedSpec = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
            const makeList = (pool: string[]) => {
              const l = new SelectList(pool.map((s) => ({ value: s, label: s })), 12, {
                selectedPrefix: (t) => theme.fg("accent", "→ "),
                selectedText: (t) => theme.bg("selectedBg", theme.bold(t)),
                description: (t) => theme.fg("muted", t),
                scrollInfo: (t) => theme.fg("dim", t),
                noMatch: (t) => theme.fg("warning", t),
              });
              l.onSelect = (item) => done(item.value);
              l.onCancel = () => done(null);
              return l;
            };
            let list = makeList(specs);
            let filter = "";
            let filterLine = theme.fg("dim", "type to filter");
            const applyFilter = () => {
              const pool = filter ? fuzzyFilter(specs, filter.toLowerCase(), (s) => s.toLowerCase()) : specs;
              list = makeList(pool);
              filterLine = theme.fg("dim", filter ? `filter: ${filter} (${pool.length}/${specs.length})` : "type to filter");
            };
            return {
              render: (w: number) => [
                theme.fg("accent", theme.bold("SELECT MODEL")),
                theme.fg("muted", `Current: ${modelLabel}`),
                "",
                ...list.render(w),
                "",
                filterLine,
                theme.fg("dim", "↑↓ navigate · type to filter · enter select · esc cancel"),
              ],
              invalidate: () => list.invalidate(),
              handleInput: (data: string) => {
                if (!data.startsWith("\x1b") && data.length >= 1 && data >= " " && data <= "~") {
                  filter += data;
                  applyFilter();
                } else if (data === "\x7f" || data === "\b" || data === "\x1b[3~") {
                  filter = filter.slice(0, -1);
                  applyFilter();
                } else {
                  list.handleInput(data);
                }
                tui.requestRender();
              },
            };
          });
          if (!pickedSpec) continue;
          const target = ctx.modelRegistry.getAll().find((mm) => `${mm.provider}/${mm.id}` === pickedSpec);
          if (!target) {
            ctx.ui.notify(`Could not resolve model "${pickedSpec}".`, "warning");
            continue;
          }
          await pi.setModel(target as never);
          modelLabel = pickedSpec;
          ctx.ui.notify(`Model set to ${pickedSpec}`, "info");
          continue;
        }

        // ---- Profile level editor (single-profile, radio-style) ----
        const profile = profileByValue[overviewPicked];
        if (!profile) continue;
        {
          const currentLevel = effectiveLevel(profile, state.overrides);
          const levelLabels = Object.keys(USER_LEVEL_MAP);
          const curIdx = levelLabels.findIndex((l) => USER_LEVEL_MAP[l] === currentLevel);

          interface LevelChoice { label: string; runtime: string }
          const choices: LevelChoice[] = [];
          if (curIdx < 0) {
            // Stored level outside the user-facing map (e.g. legacy "max"):
            // offer keeping it explicitly instead of silently defaulting.
            choices.push({ label: `Keep current (${currentLevel})`, runtime: currentLevel });
          }
          for (const l of levelLabels) {
            choices.push({
              label: `${USER_LEVEL_MAP[l] === currentLevel ? "●" : "○"} ${l}`,
              runtime: USER_LEVEL_MAP[l],
            });
          }

          const chosen = await ctx.ui.custom<LevelChoice | null>((tui, theme, _kb, done) => {
            const container = new Container();
            container.addChild(new Text(theme.fg("accent", theme.bold(profile.toUpperCase())), 1, 0));
            container.addChild(new Text(theme.fg("muted", PROFILE_DESCRIPTIONS[profile]), 0, 1));
            container.addChild(new Text(theme.fg("text", `Current level: ${currentLevel}`), 0, 1));
            container.addChild(new Spacer(1));

            const items: SelectItem[] = choices.map((c) => ({ value: c.runtime, label: c.label }));
            const listTheme: SelectListTheme = {
              selectedPrefix: (t) => theme.fg("accent", "→ "),
              selectedText: (t) => theme.bg("selectedBg", theme.bold(t)),
              description: (t) => theme.fg("muted", t),
              scrollInfo: (t) => theme.fg("dim", t),
              noMatch: (t) => theme.fg("warning", t),
            };
            const list = new SelectList(items, Math.max(7, items.length), listTheme);
            list.setSelectedIndex(curIdx >= 0 ? curIdx : 0);
            list.onSelect = (item) => {
              const c = choices.find((cc) => cc.runtime === item.value);
              if (c) done(c);
            };
            list.onCancel = () => done(null);

            container.addChild(list);
            container.addChild(new Spacer(1));
            container.addChild(new Text(theme.fg("dim", "↑↓ navigate · enter save · esc cancel"), 1, 0));

            return {
              render: (w: number) => container.render(w),
              invalidate: () => container.invalidate(),
              handleInput: (data: string) => {
                list.handleInput(data);
                tui.requestRender();
              },
            };
          });
          if (chosen === null) continue; // Esc — cancel-safe, no change
          state.overrides[profile] = chosen.runtime;
          if (state.activeProfile === profile) state.activeLevel = chosen.runtime;
          saveReasoningStateV2(state); // sanitized write; overview rebuilds next loop pass
          ctx.ui.notify(`${profile} → ${chosen.runtime}`, "info");
        }
      }
    },
  });

  pi.registerCommand("sync", {
    description: "One-way sync platform assets from Blueprint repo to runtime (~/.pi/agent)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const apply = args.includes("--apply");
      const force = args.includes("--force");

      ctx.ui.notify(`Running Harness Pi Sync (${apply ? "Applying Changes" : "Preview Mode"})…`, "info");

      const summary = executeSync({ apply, force });
      const reportText = formatSyncReport(summary);

      const notifyType = summary.counts.failed > 0 ? "error" : summary.counts.conflict > 0 ? "warning" : "info";
      ctx.ui.notify(reportText, notifyType);
    },
  });

  pi.registerCommand("reasoning", {
    description: "Configure reasoning profile (Default/Plan/Review) and thinking level",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const current = loadReasoningProfile();
      const parts = args.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0 || parts[0].toLowerCase() === "show") {
        ctx.ui.notify(`Reasoning profile: ${current.profile} @ ${current.level}. Usage: /reasoning <Default|Plan|Review> <off|minimal|low|medium|high|xhigh|max>`, "info");
        return;
      }
      const profileArg = parts[0];
      const levelArg = parts[1]?.toLowerCase();
      if (!REASONING_PROFILES.includes(profileArg as ReasoningProfileName)) {
        ctx.ui.notify(`Unknown profile "${profileArg}". Profiles: ${REASONING_PROFILES.join(", ")}`, "warning");
        return;
      }
      const state = loadReasoningStateV2();
      state.activeProfile = profileArg as ReasoningProfileName;
      state.activeLevel = levelArg ?? effectiveLevel(state.activeProfile, state.overrides);
      state.overrides[state.activeProfile] = state.activeLevel;
      saveReasoningStateV2(state);
      ctx.ui.notify(`Reasoning profile set: ${state.activeProfile} @ ${state.activeLevel} (applies to planning/review/synthesis phases via :${state.activeLevel} script suffixes)`, "info");
    },
  });
}
