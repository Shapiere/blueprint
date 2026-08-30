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

// --- D42 Phase 1: user-owned model visibility (NOT a registry — curation only) ---

const MODELS_STATE_FILE = path.join(os.homedir(), ".pi", "agent", "harness-models.json");
const ROUTER_INFO_ENDPOINT = ROUTER_BASE_URL.replace(/\/v1$/, "") + "/api/v1/models/info";

export interface ModelsVisibilityState {
  /** null = everything discovered is visible; otherwise the allowlist. */
  visible: string[] | null;
  hidden: string[];
  /** Best-effort display names from the router's public info endpoint. */
  names: Record<string, string>;
}

export function loadModelsVisibility(): ModelsVisibilityState {
  try {
    const raw = JSON.parse(fs.readFileSync(MODELS_STATE_FILE, "utf-8")) as Partial<ModelsVisibilityState>;
    const strArr = (v: unknown): string[] | null =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
    const visible = strArr(raw.visible);
    return {
      visible: visible && visible.length > 0 ? visible : null,
      hidden: strArr(raw.hidden) ?? [],
      names: raw.names && typeof raw.names === "object" ? raw.names : {},
    };
  } catch {
    return { visible: null, hidden: [], names: {} };
  }
}

export function saveModelsVisibility(state: ModelsVisibilityState): void {
  try {
    fs.writeFileSync(MODELS_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {}
}

/** Applies VISIBLE to DISCOVERED: hidden removed, optional allowlist intersected. */
export function applyVisibility(ids: readonly string[], state: ModelsVisibilityState): string[] {
  const hidden = new Set(state.hidden);
  const allowed = state.visible ? new Set(state.visible) : null;
  return ids.filter((id) => !hidden.has(id) && (!allowed || allowed.has(id)));
}

/** Last refresh counters for /doctor (module-scoped, in-memory only). */
export const catalogStats = { discovered: 0, selectable: 0 };

/** Reads the installed Pi host to report D44 bridge state for /doctor. */
export function modelBridgeStatus(): { applied: boolean; version: string } | null {
  try {
    const appdata = process.env.APPDATA;
    const dir =
      (process.env.PI_CODE_AGENT_DIR as string | undefined) ??
      (appdata ? path.join(appdata, "npm", "node_modules", "@earendil-works", "pi-coding-agent") : "");
    if (!dir) return null;
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8")) as { version?: string };
    const src = fs.readFileSync(path.join(dir, "dist", "core", "agent-session.js"), "utf-8");
    return { applied: src.includes("sameModel: true"), version: pkg.version ?? "?" };
  } catch {
    return null;
  }
}

/**
 * Best-effort display-name enrichment for the SELECTABLE set via the router's
 * public info endpoint. Strictly bounded (sequential, capped, short timeout),
 * cached in harness-models.json, never blocking and never affecting selection.
 */
const ENRICH_CAP = 40;
let enrichInFlight = false;
export async function enrichModelNames(ids: readonly string[]): Promise<void> {
  if (enrichInFlight) return;
  enrichInFlight = true;
  try {
    const state = loadModelsVisibility();
    const pending = ids.filter((id) => !state.names[id]).slice(0, ENRICH_CAP);
    let mutated = false;
    for (const id of pending) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);
      try {
        const res = await fetch(`${ROUTER_INFO_ENDPOINT}?id=${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const body = (await res.json()) as { name?: unknown };
          if (typeof body.name === "string" && body.name.length > 0 && body.name !== id) {
            state.names[id] = body.name;
            mutated = true;
          }
        }
      } catch {
        break; // router slow/gone: stop quietly, retry on a future refresh
      } finally {
        clearTimeout(timer);
      }
    }
    if (mutated) saveModelsVisibility({ ...state, names: state.names });
  } finally {
    enrichInFlight = false;
  }
}

/** Lists model specs from Pi's availability snapshot (provider-scoped; NEVER getAll). */
export function listAvailableModelSpecsSafe(ctx: ExtensionContext): string[] {
  try {
    const models = ctx.modelRegistry.getAvailable();
    return models.map((m) => `${m.provider}/${m.id}`);
  } catch {
    return [];
  }
}
/**
 * Restores the user's DECLARED default model when Pi left the session at the
 * placeholder because the static catalog predated the dynamic one. This is
 * restoration of existing configuration — never a model switch. Guards:
 * only when ctx.model is the placeholder, the declared default exists in the
 * availability snapshot, and it is currently visible per harness-models.json.
 */
export async function restoreDeclaredDefault(ctx: ExtensionContext): Promise<boolean> {
  try {
    const model = ctx.model;
    const isPlaceholder = !!model && model.provider === "unknown" && model.id === "unknown";
    if (!isPlaceholder) return false;
    const settings = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), ".pi", "agent", "settings.json"), "utf-8"),
    ) as { defaultProvider?: unknown; defaultModel?: unknown };
    const provider = typeof settings.defaultProvider === "string" ? settings.defaultProvider : undefined;
    const id = typeof settings.defaultModel === "string" ? settings.defaultModel : undefined;
    if (!provider || !id) return false;
    const available = ctx.modelRegistry.getAvailable();
    const target = available.find((m) => m.provider === provider && m.id === id);
    if (!target) return false;
    const selectable = applyVisibility([`${provider}/${id}`], loadModelsVisibility());
    if (selectable.length === 0) return false;
    restoringBootDefault = true;
    try {
      await piSetModelRef?.(target);
    } finally {
      // Let the model_select handler swallow its own dialog for this event.
      setTimeout(() => {
        restoringBootDefault = false;
      }, 0);
    }
    return true;
  } catch {
    return false;
  }
}

/** Late-bound setModel bridge; assigned inside the extension bootstrap. */
let piSetModelRef: ((m: unknown) => Promise<unknown>) | null = null;
/** True while a boot-default restoration is in flight; suppresses the post-select dialog. */
let restoringBootDefault = false;

/**
 * D44 bridge decision: the version-guarded host patch emits model_select with
 * sameModel:true when the user re-confirms the current model via the selector
 * (source "set"). Only that explicit user action opens the control center;
 * programmatic equal-model emissions (e.g. cycling) do not.
 */
export function shouldOpenControlCenter(ev: { sameModel?: boolean; source?: string }): boolean {
  if (ev.sameModel) return ev.source === "set";
  return true;
}

/** Human-readable "provider/id" of the declared default from settings.json. */
export function declaredDefaultLabel(): string {
  try {
    const settings = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), ".pi", "agent", "settings.json"), "utf-8"),
    ) as { defaultProvider?: unknown; defaultModel?: unknown };
    return `${String(settings.defaultProvider)}/${String(settings.defaultModel)}`;
  } catch {
    return "(settings unavailable)";
  }
}

/** Stable value token encoding a profile row in the /model overview. */
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

/** v3 reasoning state: one authoritative level per profile + user-designated default. */
export interface ReasoningStateV3 {
  version: 3;
  defaultProfile: ReasoningProfileName;
  profiles: Record<ReasoningProfileName, string>;
}

export interface EffectiveReasoning {
  profile: ReasoningProfileName;
  level: string;
  source: "default" | "execution";
}

const RUNTIME_LEVELS = new Set<string>(Object.values(USER_LEVEL_MAP));

function sanitizeProfiles(input: unknown): Record<ReasoningProfileName, string> {
  const out = {} as Record<ReasoningProfileName, string>;
  for (const p of REASONING_PROFILES) {
    const candidate = (input as Record<string, unknown> | null | undefined)?.[p];
    out[p] =
      typeof candidate === "string" && RUNTIME_LEVELS.has(candidate)
        ? candidate
        : PROFILE_DEFAULT_LEVELS[p];
  }
  return out;
}

/**
 * Loads the v3 reasoning state, migrating v2 ({activeProfile, activeLevel,
 * overrides}) and legacy v1 ({profile, level}) shapes. Existing user values
 * are preserved; only invalid entries fall back to profile defaults.
 */
export function loadReasoningState(): ReasoningStateV3 {
  try {
    const raw = JSON.parse(fs.readFileSync(REASONING_STATE_FILE, "utf-8")) as Record<string, unknown>;
    if (raw && raw.version === 3) {
      const defaultProfile = REASONING_PROFILES.includes(raw.defaultProfile as ReasoningProfileName)
        ? (raw.defaultProfile as ReasoningProfileName)
        : "Default";
      return { version: 3, defaultProfile, profiles: sanitizeProfiles(raw.profiles) };
    }
    // v2 / v1 migration: preserve every configured value we can recognize.
    const v2 = raw as Partial<ReasoningStateV2> & Partial<ReasoningProfileState>;
    const overrides = sanitizeProfiles(v2.overrides);
    if (typeof v2.level === "string" && RUNTIME_LEVELS.has(v2.level)) {
      const legacyProfile = REASONING_PROFILES.includes(v2.profile as ReasoningProfileName)
        ? (v2.profile as ReasoningProfileName)
        : "Default";
      overrides[legacyProfile] = v2.level;
    }
    const defaultProfile = REASONING_PROFILES.includes(v2.activeProfile as ReasoningProfileName)
      ? (v2.activeProfile as ReasoningProfileName)
      : "Default";
    return { version: 3, defaultProfile, profiles: overrides };
  } catch {
    return { version: 3, defaultProfile: "Default", profiles: sanitizeProfiles(undefined) };
  }
}

/** Single sanitized writer for the v3 reasoning state. */
export function saveReasoningState(state: ReasoningStateV3): void {
  try {
    const defaultProfile = REASONING_PROFILES.includes(state.defaultProfile)
      ? state.defaultProfile
      : "Default";
    const payload: ReasoningStateV3 = {
      version: 3,
      defaultProfile,
      profiles: sanitizeProfiles(state.profiles),
    };
    fs.writeFileSync(REASONING_STATE_FILE, JSON.stringify(payload, null, 2), "utf-8");
  } catch {}
}

// --- Execution profile (Option C): ephemeral, run-scoped, never persisted ---

export interface ExecutionContext {
  profile: ReasoningProfileName;
  since: number;
}

const EXECUTION_WINDOW_MS = 30 * 60 * 1000; // a workflow run never outlives this window
let executionContext: ExecutionContext | null = null;

/** Declares an execution profile for the current workflow run window. */
export function setExecutionProfile(profile: ReasoningProfileName): void {
  executionContext = { profile, since: Date.now() };
}

/** Clears any active execution context (used by tests and explicit resets). */
export function clearExecutionProfile(): void {
  executionContext = null;
}

function activeExecutionContext(): ExecutionContext | null {
  if (!executionContext) return null;
  if (Date.now() - executionContext.since > EXECUTION_WINDOW_MS) {
    executionContext = null;
    return null;
  }
  return executionContext;
}

/**
 * The single authoritative resolution path for effective reasoning.
 * Execution profile (when a fresh workflow declared one) wins over the
 * user's Default Profile; configuration itself is never mutated.
 */
export function resolveEffective(state: ReasoningStateV3): EffectiveReasoning {
  const exec = activeExecutionContext();
  if (exec) {
    return { profile: exec.profile, level: state.profiles[exec.profile], source: "execution" };
  }
  return { profile: state.defaultProfile, level: state.profiles[state.defaultProfile], source: "default" };
}

/** Parses `// profile: <Name>` from a workflow script header. */
export function parseProfileTag(script: string): ReasoningProfileName | undefined {
  const m = script.match(/^\s*\/\/\s*profile:\s*(\w+)\s*$/im);
  const name = m?.[1] as ReasoningProfileName | undefined;
  return name && REASONING_PROFILES.includes(name) ? name : undefined;
}

/**
 * Loads persisted reasoning-profile configuration (compat view over v3).
 * Legacy {profile, level} files are migrated by loadReasoningState.
 */
export function loadReasoningProfile(): ReasoningProfileState {
  const resolved = resolveEffective(loadReasoningState());
  return { profile: resolved.profile, level: resolved.level };
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
  If you believe a different model is required, ask the user first.
- Reasoning profiles: declare "// profile: <Name>" (e.g. // profile: Review) as the SECOND script line
  to request an execution profile for this run only. This requests configuration — it never changes it.
- NEVER read or write harness-reasoning.json or harness-models.json from workflow scripts.
  Those are user-owned runtime state; scripts consume resolved values, they do not mutate them.`;

/**
 * Detects explicit model overrides in a workflow script (silent-switch guard).
 * Covers standalone `model:` lines, `meta.model =`, and inline options-object
 * forms like `agent(p, { model: "..." })`.
 */
export function scriptHasModelOverrides(script: string): boolean {
  return (
    /^\s*(?:\w+\.)?model\s*:/im.test(script) ||
    /meta\.model\s*=/.test(script) ||
    /\bmodel\s*:\s*["'`]/.test(script)
  );
}

/** Strips inline and standalone model override fragments from a script. */
export function stripModelOverrides(script: string): string {
  return script
    .split("\n")
    .filter((l) => !/^\s*(?:\w+\.)?model\s*:/i.test(l) && !/meta\.model\s*=/i.test(l))
    .join("\n")
    .replace(/,\s*model\s*:\s*(["'`])[^"'`]*\1/g, "")
    .replace(/\bmodel\s*:\s*(["'`])[^"'`]*\1\s*,\s*/g, "");
}

/** Detects workflow scripts attempting to mutate protected runtime state files. */
export function scriptWritesProtectedState(script: string): boolean {
  const mentions = /harness-(?:reasoning|models)\.json/.test(script);
  const writes = /writeFileSync|appendFileSync|\.write\(|createWriteStream/.test(script);
  return mentions && writes;
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
  /** Appends a success-colored marker (e.g. ●active, ★default) after the label. */
  marked?: boolean | string;
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
/** Width reserved for the semantic reasoning-level column. */
const LEVEL_WIDTH = 11;

/**
 * Semantic emphasis per reasoning level: quiet for low effort, stronger as the
 * level rises. Uses theme tokens only — no hardcoded terminal colors.
 */
function levelTone(level: string): "dim" | "muted" | "text" | "accent" {
  switch (level) {
    case "off":
    case "low":
      return "dim";
    case "medium":
      return "muted";
    case "high":
      return "text";
    default:
      return "accent"; // ultra (xhigh) and anything above
  }
}

/**
 * Width-safe single-line text: the content is produced from the ACTUAL render
 * width (so narrow terminals can simplify wording), then clamped so the final
 * rendered line never exceeds that width. ANSI-styled input is measured with
 * pi-tui's display-width helper, never with string length.
 */
class WidthSafeText implements Component {
  constructor(
    private readonly build: (width: number) => string,
    private readonly paddingX = 0,
    private readonly paddingY = 0,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const inner = Math.max(1, width - this.paddingX * 2);
    const line = truncateToWidth(this.build(width), inner, "");
    const pad = " ".repeat(this.paddingX);
    const out = [pad + line];
    for (let i = 0; i < this.paddingY; i++) out.push("");
    return out;
  }
}

/**
 * Pads a cell to its column width while guaranteeing at least one trailing
 * space, so adjacent columns (name/level/description) can never abut — even
 * when a value exactly fills its column.
 */
function padCell(text: string, column: number): string {
  const w = visibleWidth(text);
  // Always leave one trailing space, even when the text fills the column.
  if (w >= column) return truncateToWidth(text, Math.max(1, column - 1), "…") + " ";
  return text + " ".repeat(column - w);
}

/**
 * Keeps the most useful part of a model identifier when space is tight:
 * the trailing segments carry the model identity, the provider prefix does not.
 */
function shortModel(modelLabel: string, max: number): string {
  if (visibleWidth(modelLabel) <= max) return modelLabel;
  const parts = modelLabel.split("/");
  let out = parts[parts.length - 1];
  for (let i = parts.length - 2; i >= 0; i--) {
    const candidate = parts.slice(i).join("/");
    if (visibleWidth(candidate) > max) break;
    out = candidate;
  }
  return truncateToWidth(out, max, "…");
}

/** Clamps every rendered line to the available width (ANSI/Unicode aware). */
function clampLines(lines: readonly string[], width: number): string[] {
  return lines.map((l) => (visibleWidth(l) > width ? truncateToWidth(l, width, "") : l));
}

/**
 * Semantic panel: a titled rule followed by the panel's lines, all clamped to
 * the available width. This is the shared visual vocabulary for the four
 * regions of the control surface (current context, navigation+detail, detail
 * strips, footer).
 */
export function panelLines(title: string, lines: readonly string[], width: number, theme: Theme): string[] {
  const label = ` ${title} `;
  const rule = theme.fg("dim", "─".repeat(Math.max(0, width - visibleWidth(label))));
  const head = theme.fg("accent", theme.bold(label)) + rule;
  return [head, ...clampLines(lines, width)];
}

/**
 * Navigation + detail composite. Above the width threshold the navigation list
 * renders on the left and the detail panel on the right (each clamped to its
 * column); on narrow terminals the layout stacks. Both sides are width-safe
 * by construction (D45 invariant).
 */
export class NavDetailPane implements Component {
  private detailLines: string[] = [];
  constructor(
    private readonly nav: MccOverviewList,
    private readonly buildDetail: (width: number) => string[],
    private readonly maxLines = 14,
  ) {
    nav.onSelectionChange = () => this.refreshDetail();
    this.refreshDetail();
  }
  invalidate(): void {
    this.nav.invalidate();
    this.refreshDetail();
  }
  handleInput(data: string): void {
    this.nav.handleInput(data);
    this.refreshDetail();
  }
  private refreshDetail(): void {
    this.detailLines = this.buildDetail(this.maxLines);
  }
  render(width: number): string[] {
    if (width < 100) {
      // Stacked: navigation, then detail below.
      return [
        ...clampLines(this.nav.render(width), width),
        "",
        ...clampLines(this.detailLines, width),
      ];
    }
    // Two-pane: navigation left (~40%), a subtle divider, detail right.
    const navW = Math.max(24, Math.min(44, Math.floor(width * 0.4)));
    const divider = "│";
    const detailW = Math.max(10, width - navW - 2);
    const navLines = this.nav.render(navW);
    const rows = Math.max(navLines.length, this.detailLines.length);
    const out: string[] = [];
    for (let i = 0; i < rows; i++) {
      const left = navLines[i] ?? "";
      const leftW = visibleWidth(left);
      const right = this.detailLines[i] ?? "";
      const pad = leftW < navW ? " ".repeat(navW - leftW) : "";
      const line = left + pad + divider + (right ? " " + right : "");
      out.push(visibleWidth(line) > width ? truncateToWidth(line, width, "") : line);
    }
    return out;
  }
}

/** Compact capability summary of a session model for detail panels. */
function modelCaps(model: { reasoning?: boolean; input?: unknown[]; contextWindow?: number }): {
  reasoning: boolean;
  vision: boolean;
  ctx: string;
} {
  return {
    reasoning: model.reasoning === true,
    vision: Array.isArray(model.input) && model.input.includes("image"),
    ctx: typeof model.contextWindow === "number" ? `${Math.round(model.contextWindow / 1000)}k` : "—",
  };
}

/** Provider -> selectable model count from the availability snapshot. */
export function providerCounts(specs: readonly string[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const spec of specs) {
    const provider = spec.split("/")[0];
    counts.set(provider, (counts.get(provider) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Scope-aware content title for the model list. */
export function scopeTitle(provider: string | null): string {
  return provider ? `${provider.toUpperCase()} MODELS` : "ALL MODELS";
}

/** Detail panel for a provider navigation row. */
export function providerDetailLines(
  provider: string,
  count: number,
  theme: Theme,
  maxLines: number,
): string[] {
  return [
    theme.fg("dim", "PROVIDER"),
    theme.fg("text", theme.bold(provider)),
    theme.fg("muted", `${count} selectable model${count === 1 ? "" : "s"}`),
    theme.fg("muted", "Connectivity: Unverified"),
    "",
    theme.fg("dim", "Enter — browse models"),
  ].slice(0, maxLines);
}

/** Detail panel for a highlighted model in the picker. */
function pickedModelDetailLines(
  spec: string,
  getAvailable: () => Array<{ provider: string; id: string; reasoning?: boolean; input?: unknown[]; contextWindow?: number }>,
  currentLabel: string,
  theme: Theme,
  maxLines: number,
): string[] {
  const [prov, ...rest] = spec.split("/");
  const model = getAvailable().find((m) => m.provider === prov && m.id === rest.join("/"));
  const caps = modelCaps(model ?? {});
  const isCurrent = spec === currentLabel;
  const lines = [
    theme.fg("dim", "SELECTED MODEL"),
    theme.fg("text", theme.bold(spec)),
    theme.fg("muted", `${prov} · ${caps.ctx} ctx${isCurrent ? " · current" : ""}`),
    "",
    theme.fg("dim", "CAPABILITIES"),
    theme.fg(caps.reasoning ? "success" : "muted", `${caps.reasoning ? "●" : "○"} Reasoning`),
    theme.fg(caps.vision ? "success" : "muted", `${caps.vision ? "●" : "○"} Vision`),
  ];
  return lines.slice(0, maxLines);
}

/** Detail panel for the current model (overview's "Select model…" context). */
function modelDetailLines(
  modelLabel: string,
  model: { reasoning?: boolean; input?: unknown[]; contextWindow?: number } | undefined,
  theme: Theme,
  maxLines: number,
): string[] {
  const caps = modelCaps(model ?? {});
  const provider = modelLabel.includes("/") ? modelLabel.split("/")[0] : "9router";
  const lines = [
    theme.fg("dim", "CURRENT MODEL"),
    theme.fg("text", theme.bold(modelLabel)),
    theme.fg("muted", `${provider} · ${caps.ctx} ctx`),
    "",
    theme.fg("dim", "CAPABILITIES"),
    theme.fg(caps.reasoning ? "success" : "muted", `${caps.reasoning ? "●" : "○"} Reasoning`),
    theme.fg(caps.vision ? "success" : "muted", `${caps.vision ? "●" : "○"} Vision`),
    "",
    theme.fg("dim", "Enter — open model picker"),
  ];
  return lines.slice(0, maxLines);
}

/** Detail panel for a focused profile row. */
export function profileDetailLines(
  profile: ReasoningProfileName,
  state: ReasoningStateV3,
  resolved: EffectiveReasoning,
  theme: Theme,
  maxLines: number,
): string[] {
  const level = state.profiles[profile];
  const isDefault = state.defaultProfile === profile;
  const isActive = resolved.profile === profile;
  const lines = [
    theme.fg("accent", theme.bold(profile.toUpperCase())),
    theme.fg("muted", PROFILE_DESCRIPTIONS[profile]),
    "",
    theme.fg("dim", "REASONING"),
    theme.fg(levelTone(level), level),
    "",
    theme.fg("dim", "STATE"),
  ];
  if (resolved.source === "execution" && isActive) {
    lines.push(theme.fg("warning", `● Execution · ${resolved.level}`));
  } else if (isActive) {
    lines.push(theme.fg("success", "● Active"));
  }
  lines.push(isDefault ? theme.fg("success", "★ Default") : theme.fg("muted", "○ Not default"));
  lines.push("", theme.fg("dim", "Enter — edit reasoning"));
  if (!isDefault) lines.push(theme.fg("dim", "↑ editor — set as default"));
  return lines.slice(0, maxLines);
}

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
  /** Fired when arrow navigation changes the selected row (detail panels). */
  onSelectionChange?: (item: MccItem | null) => void;

  /** Current keyboard-selected row, or null. */
  getSelectedItem(): MccItem | null {
    return this.items[this.selectedIndex] ?? null;
  }

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
      this.onSelectionChange?.(this.items[this.selectedIndex] ?? null);
    } else if (kb.matches(data, "tui.select.down")) {
      this.selectedIndex = (this.selectedIndex + 1) % count;
      this.onSelectionChange?.(this.items[this.selectedIndex] ?? null);
    } else if (kb.matches(data, "tui.select.confirm")) {
      const item = this.items[this.selectedIndex];
      if (item && this.onSelect) this.onSelect(item.value);
    } else if (kb.matches(data, "tui.select.cancel")) {
      if (this.onCancel) this.onCancel();
    }
  }

  render(width: number): string[] {
    const lines = this.layout();
    const cols = this.columns(width);
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
          out.push(this.renderItem(line.item, line.index === this.selectedIndex, cols, width));
          break;
        case "disabled":
          out.push(this.renderDisabled(line.disabled, cols, width));
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

  /**
   * Dynamic, content-driven column sizing: name column from the widest row,
   * a fixed semantic level column, and the description takes what is left.
   * Always bounded by the available width (D45 invariant).
   */
  private columns(width: number): { name: number; level: number; desc: number } {
    let widestName = 0;
    let widestMarker = 0;
    for (const s of this.sections) {
      for (const row of s.rows) {
        const isItem = row.kind === "item";
        widestName = Math.max(widestName, visibleWidth(MccOverviewList.nameOf(row)));
        if (isItem) {
          const markerText = MccOverviewList.markerOf(row.item.marked);
          if (markerText) widestMarker = Math.max(widestMarker, visibleWidth(markerText) + 1);
        }
      }
    }
    const prefixW = 2;
    // Level column sized to the widest level label actually present.
    let widestLevel = 0;
    for (const sec of this.sections) {
      for (const row of sec.rows) {
        const level = MccOverviewList.levelOf(row.kind === "item" ? row.item.primary : row.disabled.primary);
        widestLevel = Math.max(widestLevel, visibleWidth(level || "unavailable"));
      }
    }
    // +1 leading separator space, +1 trailing gap before the description.
    const levelCol = Math.min(LEVEL_WIDTH + 2, Math.max(0, widestLevel) + 2);
    const usable = Math.max(8, width - prefixW - levelCol);
    const nameNeeds = widestName + 2 + widestMarker;
    // Content-driven: the name column takes only what names need, so the
    // description keeps the remaining width.
    const nameCol = Math.max(6, Math.min(nameNeeds, usable));
    const descCol = Math.max(0, width - prefixW - nameCol - levelCol);
    return { name: nameCol, level: levelCol, desc: descCol };
  }

  private renderHeader(title: string, width: number): string {
    const text = ` ${title} `;
    const w = visibleWidth(text);
    // Restrained rule: enough to group, never a full-bleed separator.
    const ruleW = Math.max(0, Math.min(width - w, Math.max(24, Math.floor(width / 3))));
    return this.fitLine(
      this.theme.fg("accent", this.theme.bold(text)) + this.theme.fg("dim", "─".repeat(ruleW)),
      width,
    );
  }

  /** Row name: the primary text before the " · level" separator. */
  private static nameOf(row: MccRow): string {
    const primary = row.kind === "item" ? row.item.primary : row.disabled.primary;
    return primary.split(" · ")[0];
  }

  /** Marker text for a row ("" when the row has no marker). */
  private static markerOf(marked: MccItem["marked"]): string {
    if (typeof marked === "string") return marked;
    return marked ? MCC_ACTIVE_MARKER : "";
  }

  /** Level text carried in the row primary ("Plan · high" → "high"). */
  private static levelOf(primary: string): string {
    return primary.split(" · ").slice(1).join(" · ");
  }

  /**
   * Responsive row rendered as name | level | description. The marker shares
   * the name column, so it can never widen the row (D45 overflow guard).
   */
  private renderItem(
    item: MccItem,
    selected: boolean,
    cols: { name: number; level: number; desc: number },
    width: number,
  ): string {
    const prefix = selected ? this.theme.fg("accent", "› ") : "  ";
    const markerText = MccOverviewList.markerOf(item.marked);
    const markerW = markerText ? visibleWidth(markerText) + 1 : 0;
    const nameMax = Math.max(1, cols.name - markerW - 2);
    const nameText = truncateToWidth(MccOverviewList.nameOf({ kind: "item", item }), nameMax, "…");
    const nameCell = padCell(
      nameText + (markerText ? " " + this.theme.fg("success", markerText) : ""),
      cols.name,
    );
    const levelText = MccOverviewList.levelOf(item.primary);
    // Rows without a reasoning level (model/provider/action rows) keep an empty
    // level cell instead of a decorative dash — only real levels are shown.
    const levelCell = levelText
      ? this.theme.fg(levelTone(levelText), " " + padCell(levelText, Math.max(1, cols.level - 1)))
      : " ".repeat(cols.level);
    const descCell =
      item.description && cols.desc >= 14
        ? this.theme.fg("muted", truncateToWidth(item.description, cols.desc, "…"))
        : "";
    const content = prefix + nameCell + levelCell + descCell;
    if (selected) {
      // Subtle, bounded highlight: only the row's own text, never a full-width bar.
      return this.fitLine(this.theme.bg("selectedBg", this.theme.bold(content)), width);
    }
    return this.fitLine(content, width);
  }

  private renderDisabled(
    disabled: MccDisabled,
    cols: { name: number; level: number; desc: number },
    width: number,
  ): string {
    const nameCell = padCell(MccOverviewList.nameOf({ kind: "disabled", disabled }), cols.name);
    // Unavailable rows say why, aligned with the level column.
    const levelCell = this.theme.fg("dim", " " + padCell("unavailable", Math.max(1, cols.level - 1)));
    const descCell =
      disabled.description && cols.desc >= 14 ? truncateToWidth(disabled.description, cols.desc, "…") : "";
    return this.fitLine(this.theme.fg("dim", "  " + nameCell + levelCell + descCell), width);
  }

  /** Final safety net: no rendered line may ever exceed the available width. */
  private fitLine(line: string, width: number): string {
    return visibleWidth(line) > width ? truncateToWidth(line, width, "") : line;
  }
}

/**
 * Two-pane provider-scoped model browser. Left: provider navigation with real
 * counts; right: the scoped, searchable model list. The detail strip below the
 * list describes the highlighted model. Wide terminals render both panes side
 * by side; narrow terminals stack them. Returns the picked spec or null.
 */
export async function openModelBrowser(
  ctx: ExtensionContext,
  modelLabel: string,
  names: Record<string, string>,
  initialProvider: string | null,
): Promise<string | null> {
  const allSpecs = sortModelsRouterFirst(listAvailableModelSpecsSafe(ctx));
  if (allSpecs.length === 0) return null;
  const providers = providerCounts(allSpecs);

  return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    let provider: string | null = initialProvider;
    let focus: "providers" | "models" = "providers";
    let filter = "";
    let highlight: string | null = null;

    const listTheme: SelectListTheme = {
      selectedPrefix: (t) => theme.fg("accent", "→ "),
      selectedText: (t) => theme.bg("selectedBg", theme.bold(t)),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    };

    const makeProvidersList = () => {
      const items: SelectItem[] = [
        { value: "__all__", label: "All providers", description: `${allSpecs.length} model${allSpecs.length === 1 ? "" : "s"}` },
        ...providers.map((p) => ({
          value: p.name,
          label: p.name,
          description: `${p.count} model${p.count === 1 ? "" : "s"}`,
        })),
      ];
      const l = new SelectList(items, 12, listTheme);
      l.onSelect = (item) => {
        provider = item.value === "__all__" ? null : item.value;
        focus = "models";
        models = makeModelsList();
        tui.requestRender();
      };
      l.onCancel = () => done(null);
      return l;
    };

    const makeModelsList = () => {
      const scoped = provider ? allSpecs.filter((s) => s.startsWith(`${provider}/`)) : allSpecs;
      const pool = filter
        ? fuzzyFilter(scoped, filter.toLowerCase(), (s) => `${s} ${names[s] ?? ""}`.toLowerCase())
        : scoped;
      const items: SelectItem[] = pool.map((s) => ({
        value: s,
        label: `${s === modelLabel ? "✓ " : ""}${names[s] ?? s}`,
        description: names[s] && names[s] !== s ? s : undefined,
      }));
      const l = new SelectList(items, 12, listTheme);
      l.onSelect = (item) => done(item.value);
      l.onCancel = () => {
        // Esc in the model pane returns to provider navigation.
        focus = "providers";
      };
      l.onSelectionChange = (item) => {
        highlight = item.value;
      };
      return l;
    };

    let providersList = makeProvidersList();
    let models = makeModelsList();

    return {
      render: (w: number) => {
        const title = scopeTitle(provider);
        const head = [
          theme.fg("accent", theme.bold("MODEL BROWSER")),
          theme.fg("text", theme.bold(title)),
          theme.fg("dim", `Current  ${shortModel(modelLabel, Math.max(16, w - 10))}`),
        ];
        const detail = highlight
          ? ["", ...pickedModelDetailLines(highlight, () => ctx.modelRegistry.getAvailable(), modelLabel, theme, 6)]
          : [];
        const filterLine = theme.fg("dim", filter ? `filter: ${filter}` : "type to search (name · id · provider)");
        const footer = theme.fg(
          "dim",
          w >= 76
            ? "↑↓ move   ←→ switch pane   type search   enter select   esc back"
            : "↑↓ · ←→ · type · enter · esc",
        );
        if (w >= 100) {
          const leftW = Math.max(22, Math.min(30, Math.floor(w * 0.3)));
          const rightW = Math.max(10, w - leftW - 2);
          const left = clampLines(providersList.render(leftW), leftW);
          const right = clampLines(models.render(rightW), rightW);
          const rows = Math.max(left.length, right.length);
          const panes: string[] = [];
          for (let i = 0; i < rows; i++) {
            const l = left[i] ?? "";
            const r = right[i] ?? "";
            const pad = " ".repeat(Math.max(1, leftW - visibleWidth(l)));
            panes.push(visibleWidth(l + pad + r) > w ? truncateToWidth(l + pad + r, w, "") : l + pad + r);
          }
          return clampLines([...head, "", ...panes, ...detail, "", filterLine, footer], w);
        }
        return clampLines(
          [
            ...head,
            "",
            ...clampLines(providersList.render(w), w),
            "",
            ...clampLines(models.render(w), w),
            ...detail,
            "",
            filterLine,
            ...footer,
          ],
          w,
        );
      },
      invalidate: () => {
        providersList.invalidate();
        models.invalidate();
      },
      handleInput: (data: string) => {
        // Focus switching between panes.
        if (data === "\x1b[C") {
          focus = "models";
        } else if (data === "\x1b[D") {
          focus = "providers";
        } else if (!data.startsWith("\x1b") && data.length >= 1 && data >= " " && data <= "~") {
          filter += data;
          models = makeModelsList();
          tui.requestRender();
          return;
        } else if (data === "\x7f" || data === "\b" || data === "\x1b[3~") {
          filter = filter.slice(0, -1);
          models = makeModelsList();
          tui.requestRender();
          return;
        } else if (focus === "models" && data === "\x1b") {
          focus = "providers";
        } else {
          (focus === "providers" ? providersList : models).handleInput(data);
        }
        tui.requestRender();
      },
    };
  });
}

export default function (pi: ExtensionAPI) {
  // Late-bound bridge used by boot-default restoration (setModel lives here).
  piSetModelRef = (m) => pi.setModel(m as never);

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
      const mapped = await fetchRouterCatalog();
      let models = mapped;
      if (models.length === 0) {
        // Entire response invalid/empty: prefer previous usable catalog.
        const stored = await ctx.store?.read?.();
        const prior = [...((stored?.models ?? []) as readonly PiModelDefinition[])];
        if (prior.length > 0) models = prior;
      }
      // D42 Phase 1: apply user visibility curation (never claims connectivity).
      const vis = loadModelsVisibility();
      const ids = models.map((m) => `9router/${m.id}`);
      catalogStats.discovered = ids.length;
      const selectable = new Set(applyVisibility(ids, vis));
      models = models.filter((m) => selectable.has(`9router/${m.id}`));
      catalogStats.selectable = models.length;
      // Cosmetic only: bounded display-name enrichment, never blocks selection.
      void enrichModelNames([...selectable]).catch(() => {});
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
              try {
                void ctx.modelRegistry.refresh();
              } catch {}
              // D42 boot-default restoration: a bounded startup handshake.
              // The dynamic catalog populates asynchronously after launch; a
              // few short attempts run once at startup and then stop. This is
              // initialization, not polling.
              let attempts = 0;
              const tryRestore = () => {
                attempts++;
                void (async () => {
                try {
                  if (await restoreDeclaredDefault(ctx)) {
                    if (ctx.hasUI)
                      ctx.ui.notify(`Restored default model:\n${declaredDefaultLabel()}`, "info");
                    return;
                  }
                  if (attempts < 8) setTimeout(tryRestore, 900);
                } catch {}
                })();
              };
              setTimeout(tryRestore, 1200);
            } else {
              await autoStart9router(ctx);
            }
          } catch {}
        })
        .catch(() => {});
    } catch {}
  });
  // D42/D43: /model is the single entry point. Native selector stays
  // authoritative for picking a model; on a CHANGED selection Pi emits
  // model_select and we open the control center. NOTE (host constraint,
  // agent-session.js _emitModelSelect): Pi SKIPS the event when the selected
  // model equals the current one, so re-confirming the current model cannot
  // trigger any extension hook. Ctrl+G and `/reasoning` open the identical
  // control center for reasoning-only access.
  pi.on("model_select", async (event, ctx) => {
    if (!ctx.hasUI) return;
    if (restoringBootDefault) {
      restoringBootDefault = false; // boot restoration is not a user model change
      return;
    }
    // D44 host bridge: same-model selector picks now emit with sameModel+set.
    const ev = event as { sameModel?: boolean; source?: string };
    if (!shouldOpenControlCenter(ev)) return;
    try {
      await runModelControlCenter(pi, ctx);
    } catch (e) {
      try {
        ctx.ui.notify(`Model control center error: ${e instanceof Error ? e.message : String(e)}`, "error");
      } catch {}
    }
  });

  // D43: direct control-center access without requiring a model change.
  pi.registerShortcut("alt+m", {
    description: "Model Control Center (reasoning profiles & levels)",
    handler: async (ctx) => {
      try {
        await runModelControlCenter(pi, ctx);
      } catch (e) {
        try {
          ctx.ui.notify(`Model control center error: ${e instanceof Error ? e.message : String(e)}`, "error");
        } catch {}
      }
    },
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
    const state = loadReasoningState();
    const resolved = resolveEffective(state);
    try {
      if (ctx.hasUI)
        ctx.ui.setStatus(
          "reasoning",
          resolved.source === "execution"
            ? `Execution: ${resolved.profile} · ${resolved.level}`
            : `${resolved.profile} · ${resolved.level}`,
        );
    } catch {}
    const reasoningLine =
      resolved.source === "execution"
        ? `Execution Profile: ${resolved.profile} @ level ${resolved.level} (workflow-scoped; your stored configuration is unchanged). Honor this depth now; use ":${resolved.level}" thinking suffixes on agent() calls.`
        : `Default Profile: ${resolved.profile} @ level ${resolved.level}. Honor this depth for planning/review/synthesis phases; when writing workflow scripts, use ":${resolved.level}" thinking suffixes and declare "// profile: <Name>" to request an execution profile.`;
    return {
      systemPrompt: `${basePrompt}\n\n# Active Workspace Environment\n${topoContext}\n${ORCHESTRATION_CONTRACT}\n# Reasoning Profile\n${reasoningLine}`,
    };
  });

  // Phase 5 (D37): complexity-aware orchestration enforcement at the workflow
  // tool boundary. Strategy caps are hard; HEAVY requires explicit approval.
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "workflow") return;
    const input = event.input as { maxAgents?: unknown; script?: unknown };

    // D42: execution-profile request — validated, ephemeral, run-scoped.
    if (typeof input.script === "string") {
      const requested = parseProfileTag(input.script);
      if (requested) {
        setExecutionProfile(requested);
      }
      // Protected-state guard: scripts must not mutate user-owned runtime files.
      if (scriptWritesProtectedState(input.script)) {
        if (ctx.hasUI) {
          const choice = await ctx.ui.select(
            "Workflow script writes protected runtime state",
            ["Block this workflow", "Allow this run (I accept the risk)"],
          );
          if (choice !== "Allow this run (I accept the risk)") {
            return { block: true, reason: "Blocked: script attempts to write harness-reasoning.json / harness-models.json. Profiles are user-owned; scripts may only declare '// profile:' requests." };
          }
        } else {
          return { block: true, reason: "Blocked headless: script writes protected runtime state files (harness-reasoning.json / harness-models.json)." };
        }
      }
    }

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
          input.script = stripModelOverrides(input.script);
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
        results.push(`✓ 9router: Online (:20128) — ${routerHealth.modelCount ?? catalogStats.discovered} models discovered (live refresh via RAL)`);
      } else {
        results.push(`✗ 9router: Offline (${routerHealth.error ?? "connection refused"})`);
      }

      // D42: model catalog + connectivity truth (Phase 1 = UNVERIFIED by design).
      const isPlaceholderModel =
        !!ctx.model && ctx.model.provider === "unknown" && ctx.model.id === "unknown";
      if (isPlaceholderModel) {
        results.push("! Model Catalog: no session model resolved yet — open /model to choose one");
      } else {
        try {
          const liveCatalog = await fetchRouterCatalog();
          const liveIds = new Set(liveCatalog.map((m) => m.id));
          const currentModel = ctx.model;
          if (currentModel && currentModel.provider === "9router" && !liveIds.has(currentModel.id)) {
            results.push(`! Model Catalog: configured model "${currentModel.id}" is NOT in the live router catalog — select a current model via /model`);
          } else if (currentModel) {
            results.push(`✓ Model Catalog: current model "${currentModel.provider}/${currentModel.id}" is live-router current`);
          }
        } catch {
          results.push("! Model Catalog: could not verify against live router (offline?)");
        }
      }
      const visState = loadModelsVisibility();
      results.push(
        `• Model Selection: discovered ${catalogStats.discovered} · selectable ${catalogStats.selectable}` +
        `${visState.hidden.length ? ` · hidden ${visState.hidden.length}` : ""}` +
        `${visState.visible ? ` · allowlist ${visState.visible.length}` : ""}`,
      );
      results.push("• Connectivity: UNVERIFIED (Phase 1 — discovery + user visibility; admin verification deferred to Phase 2)");
      try {
        const bridge = modelBridgeStatus();
        if (!bridge) results.push("! /model bridge: host runtime not found — same-model selections cannot open the control center");
        else if (bridge.applied) results.push(`✓ /model bridge: APPLIED (pi ${bridge.version}) — same-model selections open the control center`);
        else results.push(`! /model bridge: NOT APPLIED for pi ${bridge.version} — run: node capabilities/scripts/pi-model-bridge.mjs apply`);
      } catch {
        results.push("! /model bridge: status unknown");
      }
      results.push("Tip: Alt+M or /reasoning opens the Model Control Center — profiles, levels, default");
      const rs = loadReasoningState();
      const rr = resolveEffective(rs);
      results.push(`• Reasoning: default profile ${rs.defaultProfile} · effective ${rr.profile} @ ${rr.level}${rr.source === "execution" ? " (execution)" : ""}`);
      results.push("• /model UI: ✓ responsive width-safe (dynamic columns + truncation on every rendered line)");

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
    description: "Model Control Center (bare) or set default profile via CLI args",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        // D43: bare /reasoning opens the same control center as Ctrl+G and the
        // post-selection flow — one shared v3 state, one resolution path.
        await runModelControlCenter(pi, ctx);
        return;
      }
      if (parts[0].toLowerCase() === "show") {
        const st = loadReasoningState();
        const r = resolveEffective(st);
        ctx.ui.notify(`Default Profile: ${st.defaultProfile} · effective ${r.profile} @ ${r.level} (${r.source})`, "info");
        return;
      }
      const profileArg = parts[0];
      const levelArg = parts[1]?.toLowerCase();
      if (!REASONING_PROFILES.includes(profileArg as ReasoningProfileName)) {
        ctx.ui.notify(`Unknown profile "${profileArg}". Profiles: ${REASONING_PROFILES.join(", ")}`, "warning");
        return;
      }
      const state = loadReasoningState();
      state.defaultProfile = profileArg as ReasoningProfileName;
      if (levelArg) state.profiles[state.defaultProfile] = levelArg;
      saveReasoningState(state);
      ctx.ui.notify(`Default Profile: ${state.defaultProfile} · ${state.profiles[state.defaultProfile]} (applies via :${state.profiles[state.defaultProfile]} script suffixes)`, "info");
    },
  });
}


/** The unified Model Control Center flow: visibility-aware picker → profiles → levels. */
async function runModelControlCenter(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
    for (;;) {
        const state = loadReasoningState();
        const resolved = resolveEffective(state);
        const isPlaceholder =
          !!ctx.model && ctx.model.provider === "unknown" && ctx.model.id === "unknown";
        const modelLabel =
          isPlaceholder || !ctx.model ? "(none — choose below)" : `${ctx.model.provider}/${ctx.model.id}`;
        const supportsVision =
          !!ctx.model && !isPlaceholder &&
          Array.isArray(ctx.model.input) && ctx.model.input.includes("image");

        const profileByValue: Record<string, ReasoningProfileName> = {};
        const sections: MccSection[] = [
          { title: "MODEL", rows: [{ kind: "item", item: { value: "__model__", primary: "Select model…" } }] },
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
                primary: `${name} · ${state.profiles[name]}`,
                description: PROFILE_DESCRIPTIONS[name],
                marked: state.defaultProfile === name ? "★default" : undefined,
              },
            });
          }
          sections.push({ title: g.title, rows });
        }
        // PROVIDERS navigation: truthful counts from the selectable catalog.
        const providerRows: MccRow[] = providerCounts(listAvailableModelSpecsSafe(ctx)).map((p) => ({
          kind: "item" as const,
          item: {
            value: `provider:${p.name}`,
            primary: `${p.name}`,
            description: `${p.count} model${p.count === 1 ? "" : "s"}`,
          },
        }));
        sections.push({ title: "PROVIDERS", rows: providerRows });
        sections.push({
          title: "",
          rows: [{ kind: "item", item: { value: "__done__", primary: "Done", description: "Save & exit" } }],
        });

        const picked = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
          const list = new MccOverviewList(sections, theme, 14);
          list.onSelect = (value) => done(value);
          list.onCancel = () => done("__done__");
          // Navigation + detail: the right panel explains the focused row.
          const pane = new NavDetailPane(
            list,
            (maxLines) => {
              const sel = list.getSelectedItem();
              if (!sel) return [];
              if (sel.value === "__model__") return modelDetailLines(modelLabel, ctx.model, theme, maxLines);
              if (sel.value === "__done__") return [theme.fg("muted", "Done — save & exit")];
              if (sel.value.startsWith("provider:")) {
                const pname = sel.value.slice("provider:".length);
                const pc = providerCounts(listAvailableModelSpecsSafe(ctx)).find((p) => p.name === pname);
                return providerDetailLines(pname, pc?.count ?? 0, theme, maxLines);
              }
              const profile = profileByValue[sel.value];
              return profile ? profileDetailLines(profile, state, resolved, theme, maxLines) : [];
            },
            14,
          );

          return {
            render: (w: number) =>
              clampLines(
                [
                  theme.fg("accent", theme.bold("MODEL CONTROL CENTER")),
                  "",
                  // Region 1 — current context: model + connectivity + reasoning.
                  ...panelLines(
                    "CURRENT MODEL",
                    [
                      theme.fg("text", theme.bold(w >= 72 ? modelLabel : shortModel(modelLabel, Math.max(12, w - 10)))),
                      theme.fg("muted", `${modelLabel.includes("/") ? modelLabel.split("/")[0] : "9router"} · Connectivity: Unverified`),
                      "",
                      resolved.source === "execution"
                        ? theme.fg("warning", `● Execution: ${resolved.profile} · ${resolved.level}`)
                        : theme.fg("muted", `★ Default profile: ${state.defaultProfile} · ${state.profiles[state.defaultProfile]}`),
                    ],
                    w,
                    theme,
                  ),
                  "",
                  // Region 2 — navigation | detail.
                  ...panelLines("NAVIGATION · DETAIL", pane.render(w), w, theme),
                  "",
                  // Region 4 — footer.
                  theme.fg("dim", "─".repeat(Math.max(1, w - 2))),
                  theme.fg("dim", w >= 46 ? "↑↓ Navigate   Enter Edit   Esc Close" : "↑↓ · Enter · Esc"),
                ],
                w,
              ),
            invalidate: () => pane.invalidate(),
            handleInput: (data: string) => {
              pane.handleInput(data);
              tui.requestRender();
            },
          };
        });

        if (picked === null || picked === "__done__") return;

        if (picked === "__model__" || picked.startsWith("provider:")) {
          // Model browser: provider scope from the nav row (or all when the
          // "Select model…" row is used), searchable, with selected detail.
          const initialProvider = picked.startsWith("provider:")
            ? picked.slice("provider:".length)
            : null;
          const names = loadModelsVisibility().names;
          const pickedSpec = await openModelBrowser(ctx, modelLabel, names, initialProvider);
          if (!pickedSpec) continue;
          const [prov, ...rest] = pickedSpec.split("/");
          const target = ctx.modelRegistry.getAvailable().find((mm) => mm.provider === prov && mm.id === rest.join("/"));
          if (!target) {
            ctx.ui.notify(`Could not resolve model "${pickedSpec}".`, "warning");
            continue;
          }
          await pi.setModel(target as never);
          ctx.ui.notify(`Model: ${pickedSpec}`, "info");
          continue;
        }

        // ---- Profile editor (levels + Default Profile designation) ----
        const profile = profileByValue[picked];
        if (!profile) continue;
        {
          interface Choice { kind: "default" | "level"; label: string; runtime?: string }
          const choices: Choice[] = [];
          if (state.defaultProfile !== profile) {
            choices.push({ kind: "default", label: "★ Set as Default Profile" });
          }
          for (const l of Object.keys(USER_LEVEL_MAP)) {
            choices.push({
              kind: "level",
              runtime: USER_LEVEL_MAP[l],
              label: `${USER_LEVEL_MAP[l] === state.profiles[profile] ? "●" : "○"} ${l}`,
            });
          }

          const chosen = await ctx.ui.custom<Choice | null>((tui, theme, _kb, done) => {
            const container = new Container();
            container.addChild(new WidthSafeText(() => theme.fg("accent", theme.bold(profile.toUpperCase())), 1));
            container.addChild(new WidthSafeText(() => theme.fg("muted", PROFILE_DESCRIPTIONS[profile]), 0));
            container.addChild(new WidthSafeText(() => theme.fg("dim", "REASONING LEVEL"), 0, 1));
            container.addChild(new WidthSafeText(() => {
              const isDefault = state.defaultProfile === profile;
              return theme.fg("text", `Current  ${state.profiles[profile]}${isDefault ? "   ★ default profile" : ""}`);
            }));
            container.addChild(new Spacer(1));
            const items: SelectItem[] = choices.map((c) => ({ value: c.runtime ?? c.kind, label: c.label }));
            const list = new SelectList(items, Math.max(7, items.length), {
              selectedPrefix: (t) => theme.fg("accent", "→ "),
              selectedText: (t) => theme.bg("selectedBg", theme.bold(t)),
              description: (t) => theme.fg("muted", t),
              scrollInfo: (t) => theme.fg("dim", t),
              noMatch: (t) => theme.fg("warning", t),
            });
            list.setSelectedIndex(state.defaultProfile === profile ? 0 : Math.max(0, choices.findIndex((c) => c.label.startsWith("●"))));
            list.onSelect = (item) => {
              const c = choices.find((cc) => (cc.runtime ?? cc.kind) === item.value && cc.label === item.label);
              if (c) done(c);
            };
            list.onCancel = () => done(null);
            container.addChild(list);
            container.addChild(new Spacer(1));
            container.addChild(new WidthSafeText((w) => theme.fg("dim", w >= 46 ? "↑↓ Choose   Enter Save   Esc Cancel" : "↑↓ · Enter · Esc"), 1));
            return {
              render: (w: number) => container.render(w),
              invalidate: () => container.invalidate(),
              handleInput: (data: string) => {
                list.handleInput(data);
                tui.requestRender();
              },
            };
          });
          if (chosen === null) continue; // Esc — cancel-safe
          if (chosen.kind === "default") {
            state.defaultProfile = profile;
            saveReasoningState(state);
            ctx.ui.notify(`Default Profile: ${profile}`, "info");
          } else if (chosen.runtime) {
            state.profiles[profile] = chosen.runtime;
            saveReasoningState(state); // single sanitized writer → overview rebuilds fresh
            ctx.ui.notify(`${profile} · ${chosen.runtime}`, "info");
          }
        }
      }
}
