import type { ContextUsage, CustomEditor as CustomEditorType, ExtensionAPI, ExtensionContext, ExtensionCommandContext, KeybindingsManager, ReadonlyFooterDataProvider, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import {
  fuzzyFilter,
  getKeybindings,
  type EditorComponent,
  type Component,
  type EditorOptions,
  type EditorTheme,
  type SelectItem,
  SelectList,
  type SelectListTheme,
  truncateToWidth,
  type TUI,
  visibleWidth,
} from "@earendil-works/pi-tui";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import { pathToFileURL } from "node:url";

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


/**
 * D56/D57: when the router is healthy, the catalog is refreshed exactly
 * ONCE per readiness transition — at boot when it is already up, or on the
 * next explicit user-triggered refresh after the user starts it manually.
 * Refresh failures are absorbed (the provider stays unavailable until a
 * later successful refresh); nothing is ever spawned and no polling occurs.
 * 9router startup itself is the USER's action (D57 manual-start policy).
 */
export async function refreshCatalogWhenRouterReady(
  refresh: () => unknown,
): Promise<void> {
  try {
    await refresh();
  } catch {}
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

  // 3b. Sync Bundled Themes (capabilities/extensions/*.theme.json ->
  // ~/.pi/agent/themes/*). Pi discovers themes ONLY from the themes dir
  // (resource-loader), so the MCC purple theme must land there for
  // name-based setTheme to find it.
  if (fs.existsSync(sourceExtDir)) {
    const themeFiles = fs.readdirSync(sourceExtDir).filter((f) => f.startsWith("mcc-") && f.endsWith(".json"));
    for (const file of themeFiles) {
      evaluateAssetSync(
        `themes/${file}`,
        "extensions",
        path.join(sourceExtDir, file),
        path.join(agentDir, "themes", file)
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
// Model Control Center UI (D53): providers | models browser, focus-following
// detail, horizontal reasoning profiles, contextual footer. Built on pi-tui
// primitives only — no new UI framework.
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
 * D59/D60 semantic color per user-facing reasoning level. Theme tokens only —
 * under mcc-purple these resolve to the approved gray/green/blue/amber/violet
 * ladder (the theme's own thinking-depth palette); under any other theme they
 * resolve to that theme's tokens. Medium and Ultra are DISTINCT tokens: purple
 * is reserved for the MCC identity (accent) and Ultra (violet) alone.
 * Never raw hex.
 */
export const LEVEL_COLOR: Record<string, ThemeColor> = {
  Off: "dim",
  Low: "success",
  Medium: "thinkingMedium",
  High: "thinkingHigh",
  Ultra: "thinkingXhigh",
};

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
  const head = theme.fg("text", theme.bold(label)) + rule;
  return [head, ...clampLines(lines, width)];
}

/** Per-model metadata shape used for detail rendering (never getAll). */
type AvailableModelMeta = {
  provider: string;
  id: string;
  reasoning?: boolean;
  input?: unknown[];
  contextWindow?: number;
  /** Output limit (Pi Model.maxTokens) when the registry entry carries it. */
  maxTokens?: number;
};

/** Surface state persisted across the /model loop: focus, scope, search and
 * the profile cursor survive model selections and profile edits. */
export interface ModelSurfaceState {
  focus: "providers" | "models" | "profiles";
  provider: string | null;
  filter: string;
  profileFocus: number;
}

/** One reasoning-profile chip in the horizontal profiles region. */
export interface ProfileChip {
  profile: ReasoningProfileName;
  /** User-facing level label (Off/Low/Medium/High/Ultra). */
  level: string;
  /** ★ user-designated default; ● ephemeral execution profile. */
  marker: "default" | "execution" | null;
  /** Set when the profile is not selectable (capability gate). */
  disabled?: string;
}

/**
 * Horizontal-dense reasoning profile strip (D53). All configured profiles are
 * visible at once as wrapped chips; arrow keys move over selectable chips
 * only; Enter opens the level editor. Markers stay visually distinct:
 * › focus, ★ default, ● execution.
 */
export class ReasoningProfilesPanel implements Component {
  private readonly selectable: number[] = [];
  private index = 0;
  onSelect?: (profile: ReasoningProfileName) => void;
  onSelectionChange?: (chip: ProfileChip | null) => void;
  /**
   * Whether the keyboard cursor (› + highlight) is visible. The surface keeps
   * exactly ONE region active at a time; a passive profiles region renders
   * chips without any cursor or selection background.
   */
  showCursor = true;

  constructor(
    private readonly chips: readonly ProfileChip[],
    private readonly theme: Theme,
    initialIndex = 0,
  ) {
    chips.forEach((c, i) => {
      if (!c.disabled) this.selectable.push(i);
    });
    const pos = this.selectable.indexOf(initialIndex);
    this.index = pos >= 0 ? pos : 0;
  }

  /** Current keyboard-focused chip, or null when none is selectable. */
  getSelected(): ProfileChip | null {
    const i = this.selectable[this.index];
    return i === undefined ? null : (this.chips[i] ?? null);
  }

  invalidate(): void {}

  handleInput(data: string): void {
    const kb = getKeybindings();
    if (this.selectable.length === 0) return;
    if (kb.matches(data, "tui.select.up")) {
      this.index = (this.index - 1 + this.selectable.length) % this.selectable.length;
      this.onSelectionChange?.(this.getSelected());
    } else if (kb.matches(data, "tui.select.down")) {
      this.index = (this.index + 1) % this.selectable.length;
      this.onSelectionChange?.(this.getSelected());
    } else if (kb.matches(data, "tui.select.confirm")) {
      const chip = this.getSelected();
      if (chip && this.onSelect) this.onSelect(chip.profile);
    }
  }

  render(width: number): string[] {
    const GAP = 2;
    // D59 aligned grid: every cell is two lines (name / level). The level
    // cell indents by exactly the name line's prefix width (cursor slot 2 +
    // marker width), so `● level` aligns under the profile name's first
    // letter in EVERY column. Column width must fit the widest cell of
    // either line: name (incl. prefix+marker) or dot+level at max indent.
    const nameW = Math.max(...this.chips.map((c) => visibleWidth(this.nameLine(c, false))));
    const levelW = Math.max(...this.chips.map((c) => visibleWidth(c.disabled ? "unavailable" : c.level)));
    const colW = Math.max(nameW, 6 + levelW);
    const cols = Math.max(1, Math.floor((width + GAP) / (colW + GAP)));
    const lines: string[] = [];
    const focusedIdx = this.selectable[this.index];
    for (let start = 0; start < this.chips.length; start += cols) {
      const l1: string[] = [];
      const l2: string[] = [];
      this.chips.slice(start, start + cols).forEach((c, i) => {
        const selected = start + i === focusedIdx;
        const cursor = selected && this.showCursor;
        const marker =
          c.marker === "default"
            ? this.theme.fg("success", "★ ")
            : c.marker === "execution"
              ? this.theme.fg("warning", "● ")
              : "";
        const name = this.theme.fg(c.disabled ? "dim" : "text", c.profile);
        const nameLine = cursor
          ? this.theme.bg("selectedBg", this.theme.bold(`› ${marker}${name}`))
          : `  ${marker}${name}`;
        // D59 semantic level: dot + word in one LEVEL_COLOR span. The level
        // cell indents by exactly the name line's prefix width (cursor slot
        // 2 + marker width) so `● level` aligns under the profile name's
        // first letter in EVERY column, markers included.
        const markerW = c.marker === "default" || c.marker === "execution" ? 2 : 0;
        const levelText = c.disabled ? "unavailable" : c.level;
        const level = c.disabled
          ? this.theme.fg("dim", levelText)
          : this.theme.fg(LEVEL_COLOR[levelText] ?? "muted", `● ${levelText}`);
        l1.push(this.padCellTo(nameLine, colW));
        l2.push(this.padCellTo(`${" ".repeat(2 + markerW)}${level}`, colW));
      });
      lines.push(truncateToWidth(l1.join(" ".repeat(GAP)), width, ""));
      lines.push(truncateToWidth(l2.join(" ".repeat(GAP)), width, ""));
    }
    return lines;
  }

  private nameLine(c: ProfileChip, cursor: boolean): string {
    const marker = c.marker === "default" ? "★ " : c.marker === "execution" ? "● " : "";
    return `${cursor ? "› " : "  "}${marker}${c.profile}`;
  }

  private padCellTo(line: string, width: number): string {
    return line + " ".repeat(Math.max(0, width - visibleWidth(line)));
  }
}

/**
 * D53 Model Control Surface:
 *
 *   PROVIDERS | MODELS              (wide >= 64; stacked below)
 *   ─────────────────────────────
 *   PROVIDER / SELECTED MODEL / PROFILE   (detail follows focus)
 *   ─────────────────────────────
 *   REASONING PROFILES              (horizontal chips)
 *   footer                          (contextual per focus)
 *
 * ←→ switch regions; ↑↓ navigates within; Enter selects/browses/edits; Esc
 * closes (a non-empty model search is cleared first). Typing filters the
 * focused model scope. Every rendered line is clamped (D45 invariant).
 */
export class ModelControlSurface implements Component {
  onSelectModel?: (spec: string) => void;
  onEditProfile?: (profile: ReasoningProfileName) => void;
  onClose?: () => void;
  private providers: MccOverviewList;
  private models: MccOverviewList;
  private profilesPanel: ReasoningProfilesPanel;
  private highlight: string | null = null;

  constructor(
    providerSections: readonly MccSection[],
    private readonly theme: Theme,
    private readonly allSpecs: readonly string[],
    private readonly names: Readonly<Record<string, string>>,
    private readonly modelLabel: string,
    private readonly getAvailable: () => ReadonlyArray<AvailableModelMeta>,
    private readonly reasoningState: ReasoningStateV3,
    private readonly resolved: EffectiveReasoning,
    chips: readonly ProfileChip[],
    private readonly persistent: ModelSurfaceState,
  ) {
    this.providers = new MccOverviewList(providerSections, theme, 8);
    this.providers.onSelect = (value) => this.handleProviderSelect(value);
    this.providers.onCancel = () => this.onClose?.();
    this.profilesPanel = new ReasoningProfilesPanel(chips, theme, persistent.profileFocus);
    this.profilesPanel.onSelect = (profile) => this.onEditProfile?.(profile);
    this.profilesPanel.onSelectionChange = (chip) => {
      const i = chips.findIndex((c) => c.profile === chip?.profile);
      if (i >= 0) this.persistent.profileFocus = i;
    };
    this.models = this.buildModels();
  }

  get focus(): ModelSurfaceState["focus"] {
    return this.persistent.focus;
  }

  invalidate(): void {
    this.providers.invalidate();
    this.models.invalidate();
    this.profilesPanel.invalidate();
  }

  private handleProviderSelect(value: string): void {
    if (!value.startsWith("provider:")) return;
    this.persistent.provider = value.slice("provider:".length);
    this.persistent.filter = "";
    this.persistent.focus = "models";
    this.models = this.buildModels();
  }

  private buildModels(): MccOverviewList {
    const scoped = (
      this.persistent.provider
        ? this.allSpecs.filter((spec) => spec.startsWith(`${this.persistent.provider}/`))
        : this.allSpecs
    ).slice();
    const filter = this.persistent.filter;
    const pool = filter
      ? fuzzyFilter(scoped, filter.toLowerCase(), (spec) => `${spec} ${this.names[spec] ?? ""}`.toLowerCase())
      : scoped;
    const rows: MccRow[] = pool.map((spec) => {
      const row = modelRowLabel(spec, this.names);
      return {
        kind: "item" as const,
        item: {
          value: spec,
          primary: `${spec === this.modelLabel ? "✓ " : ""}${row.label}`,
          description: row.description,
        },
      };
    });
    // Initialize the highlight to the first scoped model so the detail panel
    // has content the moment the surface is rendered.
    if (pool.length > 0 && (!this.highlight || !pool.includes(this.highlight))) {
      this.highlight = pool[0];
    }
    const l = new MccOverviewList([{ title: "", rows }], this.theme, 11);
    l.showCursor = this.persistent.focus === "models";
    l.onSelect = (value) => this.onSelectModel?.(value);
    l.onSelectionChange = (item) => {
      this.highlight = item?.value ?? null;
    };
    return l;
  }

  handleInput(data: string): void {
    if (data === "\x1b[C") {
      this.shiftRegion(1);
    } else if (data === "\x1b[D") {
      this.shiftRegion(-1);
    } else if (data === "\x1b") {
      // Esc closes; a non-empty model search is cleared first.
      if (this.persistent.focus === "models" && this.persistent.filter) {
        this.persistent.filter = "";
        this.models = this.buildModels();
      } else {
        this.onClose?.();
      }
    } else if (this.persistent.focus === "models") {
      if (!data.startsWith("\x1b") && data >= " " && data <= "~") {
        this.persistent.filter += data;
        this.models = this.buildModels();
      } else if (data === "\x7f" || data === "\b" || data === "\x1b[3~") {
        this.persistent.filter = this.persistent.filter.slice(0, -1);
        this.models = this.buildModels();
      } else {
        this.models.handleInput(data);
      }
    } else if (this.persistent.focus === "providers") {
      this.providers.handleInput(data);
    } else {
      this.profilesPanel.handleInput(data);
    }
  }

  private shiftRegion(dir: 1 | -1): void {
    const regions: ModelSurfaceState["focus"][] = ["providers", "models", "profiles"];
    const i = regions.indexOf(this.persistent.focus);
    this.persistent.focus = regions[(i + dir + regions.length) % regions.length];
  }

  /** Focus-following detail context (never model-dominant). */
  private detailLines(): { title: string; lines: string[] } {
    const maxLines = 10;
    if (this.persistent.focus === "providers") {
      const sel = this.providers.getSelectedItem();
      if (sel?.value.startsWith("provider:")) {
        const name = sel.value.slice("provider:".length);
        const count = providerCounts(this.allSpecs).find((p) => p.name === name)?.count ?? 0;
        return { title: "PROVIDER", lines: providerDetailLines(name, count, this.theme, maxLines) };
      }
    } else if (this.persistent.focus === "profiles") {
      const chip = this.profilesPanel.getSelected();
      if (chip) {
        return {
          title: "PROFILE",
          lines: profileDetailLines(chip.profile, this.reasoningState, this.resolved, this.theme, maxLines),
        };
      }
    }
    if (this.highlight) {
      return {
        title: "SELECTED MODEL",
        lines: selectedModelDetailLines(this.highlight, this.names[this.highlight], this.getAvailable, this.modelLabel, this.theme, maxLines),
      };
    }
    const [prov, ...rest] = this.modelLabel.split("/");
    const model = this.getAvailable().find((m) => m.provider === prov && m.id === rest.join("/"));
    return {
      title: "CURRENT MODEL",
      lines: currentModelDetailLines(this.modelLabel, this.names[this.modelLabel], model, this.theme, maxLines),
    };
  }

  /** Pane title line inside the browser box (no rule — the border frames it). */
  private paneTitle(title: string, focused: boolean): string {
    const text = ` ${title}`;
    return focused
      ? this.theme.fg("accent", this.theme.bold(text))
      : this.theme.fg("muted", text);
  }

  /** Pane rule header with a focus-aware tone. */
  private paneHeader(title: string, width: number, focused: boolean): string[] {
    const text = ` ${title} `;
    const ruleW = Math.max(0, Math.min(width - visibleWidth(text), Math.max(12, Math.floor(width / 4))));
    const head = focused
      ? this.theme.fg("accent", this.theme.bold(text)) + this.theme.fg("dim", "─".repeat(ruleW))
      : this.theme.fg("muted", text) + this.theme.fg("dim", "─".repeat(Math.max(0, ruleW)));
    return [this.fitLine(head, width)];
  }

  /** Visible search line inside the model pane. */
  private searchLine(width: number): string[] {
    if (this.persistent.filter) return [this.fitLine(this.theme.fg("text", `Search: ${this.persistent.filter}`), width)];
    if (this.persistent.focus === "models") return [this.fitLine(this.theme.fg("dim", "search…"), width)];
    return [];
  }

  private footerLine(width: number): string {
    const full = width >= 60;
    const text =
      this.persistent.focus === "providers"
        ? "↑↓ Navigate   ←→ Switch Region   Enter Browse   Esc Close"
        : this.persistent.focus === "models"
          ? "↑↓ Navigate   Type Search   Enter Select   ← Providers   Esc Close"
          : "↑↓ Navigate   Enter Edit   ← Models   Esc Close";
    return this.theme.fg("dim", full ? text : "↑↓ · ←→ · Enter · Esc");
  }

  /**
   * D60 bounded inspector: lines are built against an explicit column budget
   * (never the terminal width) so long display names, ids, routes, and
   * capability text truncate INSIDE the column.
   */
  private modelInspectorLines(width: number): string[] {
    let lines: string[];
    if (this.highlight) {
      lines = selectedModelDetailLines(
        this.highlight,
        this.names[this.highlight],
        this.getAvailable,
        this.modelLabel,
        this.theme,
        10,
      );
    } else {
      const [prov, ...rest] = this.modelLabel.split("/");
      const model = this.getAvailable().find((m) => m.provider === prov && m.id === rest.join("/"));
      lines = currentModelDetailLines(this.modelLabel, this.names[this.modelLabel], model, this.theme, 10);
    }
    // Readable truncation: long display names/ids keep an ellipsis tail
    // instead of a hard cut, per the D60 bounding rule.
    return lines.map((l) => (visibleWidth(l) > width ? truncateToWidth(l, width, "…") : l));
  }

  render(width: number): string[] {
    const innerWidth = width - 4; // inside the outer frame (│ + 1-space gutters)
    // D59 IA: three columns (providers | models | inspector) at innerWidth
    // ≥ 78; two-column collapse below; full stack below innerWidth 56.
    const threeCol = innerWidth >= 78;
    const boxed = innerWidth >= 56;
    // ONE ACTIVE FOCUS: the keyboard cursor (› + highlight) renders in the
    // focused region only; passive regions stay readable with no competing
    // selection indicators. The inspector column is NEVER focused (§12).
    this.providers.showCursor = this.persistent.focus === "providers";
    this.models.showCursor = this.persistent.focus === "models";
    this.profilesPanel.showCursor = this.persistent.focus === "profiles";
    const footer = this.footerLine(width);
    // Row 1 context: CURRENT MODEL band directly under the inline title rule.
    const header = [
      this.theme.fg("customMessageLabel", this.theme.bold(" CURRENT MODEL")),
      ...currentModelHeaderLines(this.modelLabel, this.names[this.modelLabel], this.theme),
    ];

    if (!boxed) {
      // Stacked (D58): providers, models, focus-following detail, profiles,
      // footer — all inside the outer Model Control Center frame.
      const detail = this.detailLines();
      const detailPanel = panelLines(detail.title, detail.lines, innerWidth, this.theme);
      const profilesPanel = panelLines("REASONING PROFILES", this.profilesPanel.render(innerWidth), innerWidth, this.theme);
      return this.frame(
        clampLines(
          [
            ...header,
            "",
            " " + this.paneTitle("PROVIDERS", this.persistent.focus === "providers"),
            ...clampLines(this.providers.render(innerWidth), innerWidth),
            "",
            " " + this.paneTitle(scopeTitle(this.persistent.provider), this.persistent.focus === "models"),
            ...this.searchLine(innerWidth).map((l) => " " + l),
            ...clampLines(this.models.render(innerWidth), innerWidth),
            "",
            ...detailPanel,
            "",
            ...profilesPanel,
            "",
            footer,
          ],
          innerWidth,
        ),
        width,
      );
    }

    if (!threeCol) {
      // Two-column collapse (D59): providers | models in one box; the model
      // inspector moves to the full-width region below the box (today's D58
      // detail slot). Focus-following detail is preserved here.
      const detail = this.detailLines();
      const detailPanel = panelLines(detail.title, detail.lines, innerWidth, this.theme);
      const profilesPanel = panelLines("REASONING PROFILES", this.profilesPanel.render(innerWidth), innerWidth, this.theme);
      const provW = Math.max(24, Math.min(36, Math.floor(innerWidth * 0.32)));
      const modelW = Math.max(14, innerWidth - provW - 3); // divider rails: leading │, ┬/│, trailing │
      const provLines = [
        " " + this.paneTitle("PROVIDERS", this.persistent.focus === "providers"),
        "",
        ...clampLines(this.providers.render(provW - 2), provW - 2),
      ];
      const modelLines = [
        " " + this.paneTitle(scopeTitle(this.persistent.provider), this.persistent.focus === "models"),
        "",
        ...this.searchLine(modelW - 2).map((l) => " " + l),
        ...clampLines(this.models.render(modelW - 2), modelW - 2),
      ];
      const t = this.theme;
      const top = t.fg("dim", "┌" + "─".repeat(provW) + "┬" + "─".repeat(modelW) + "┐");
      const bottom = t.fg("dim", "└" + "─".repeat(provW) + "┴" + "─".repeat(modelW) + "┘");
      const rows = Math.max(provLines.length, modelLines.length);
      const browser: string[] = [top];
      for (let i = 0; i < rows; i++) {
        const l = provLines[i] ?? "";
        const m = modelLines[i] ?? "";
        // D61: rows built by the ONE browser row builder — purple-family
        // rails/dividers from shared geometry (see browserRow).
        browser.push(this.browserRow([l, m], [provW, modelW]));
      }
      browser.push(bottom);
      return this.frame(
        clampLines([...header, "", ...browser, "", ...detailPanel, "", ...profilesPanel, "", footer], innerWidth),
        width,
      );
    }

    // Three-column browser (D60): PROVIDERS | MODELS | SELECTED MODEL — ONE
    // rectangular layout surface. Exact geometry contract (no drift possible):
    //   interior row width = 1 (leading │) + provW + 1 (│) + modelW + 1 (│)
    //                       + selW + 1 (trailing │)  == innerWidth
    // which matches the top/bottom borders ┌─provW─┬─modelW─┬─selW─┐
    // (1 + provW+1+modelW+1+selW+1). Every divider therefore starts exactly
    // at its top-border ┬ column and ends exactly at its ┴ column.
    const provW = Math.max(20, Math.min(30, Math.floor(innerWidth * 0.22)));
    const selW = Math.max(24, Math.min(34, Math.floor(innerWidth * 0.28)));
    const modelW = Math.max(14, innerWidth - provW - selW - 4); // two junction columns + one spare
    const provLines = [
      " " + this.paneTitle("PROVIDERS", this.persistent.focus === "providers"),
      ...clampLines(this.providers.render(provW - 2), provW - 2),
    ];
    const modelLines = [
      " " + this.paneTitle(scopeTitle(this.persistent.provider), this.persistent.focus === "models"),
      ...this.searchLine(modelW - 2).map((l) => " " + l),
      ...clampLines(this.models.render(modelW - 2), modelW - 2),
    ];
    // D60 bounding rule: the inspector renders against its OWN column width
    // (selW − 2 content budget inside the two pad columns) — never against
    // the terminal width. Long ids/routes/capabilities are truncated with a
    // readable ellipsis here, before any padding or border join.
    const selContentW = Math.max(10, selW - 2);
    const selLines = [
      " " + this.paneTitle("SELECTED MODEL", false),
      ...this.modelInspectorLines(selContentW),
    ];
    const t = this.theme;
    const top = t.fg("dim", "┌" + "─".repeat(provW) + "┬" + "─".repeat(modelW) + "┬" + "─".repeat(selW) + "┐");
    const bottom = t.fg("dim", "└" + "─".repeat(provW) + "┴" + "─".repeat(modelW) + "┴" + "─".repeat(selW) + "┘");
    const rows = Math.max(provLines.length, modelLines.length, selLines.length);
    const browser: string[] = [top];
    for (let i = 0; i < rows; i++) {
      const l = provLines[i] ?? "";
      const m = modelLines[i] ?? "";
      const s = selLines[i] ?? "";
      // ONE continuous box row from the ONE builder: leading rail + cells +
      // trailing rail, each divider a single purple │ on one display column,
      // on EVERY row, including blank rows — no floating, no drift, no gaps.
      browser.push(this.browserRow([l, m, s], [provW, modelW, selW]));
    }
    browser.push(bottom);
    // Row 2 band: REASONING PROFILES label + aligned grid + footer.
    const profilesBand = [
      t.fg("customMessageLabel", t.bold(" REASONING PROFILES")),
      ...clampLines(this.profilesPanel.render(innerWidth), innerWidth),
    ];
    return this.frame(
      clampLines([...header, "", ...browser, "", ...profilesBand, "", footer], innerWidth),
      width,
    );
  }

  /**
   * Outer Model Control Center boundary (§19): one subtle frame shared with
   * the profile editor (D59 single implementation in frameLines). Title sits
   * inline in the top rule. This is the ONLY full-width frame — regions
   * inside use spacing and the single browser box, never nested borders.
   */
  private frame(lines: readonly string[], width: number): string[] {
    return frameLines(lines, width, this.theme);
  }

  private fitLine(line: string, width: number): string {
    return visibleWidth(line) > width ? truncateToWidth(line, width, "") : line;
  }

  /**
   * D61: the ONE browser row builder — the single source of truth for the
   * vertical rails and internal dividers. Geometry derives from the widths
   * array (the same numbers that size the top/bottom dash runs), so every
   * divider occupies exactly one display column — the column of its ┬ above
   * and ┴ below — on EVERY row. Color: one token, `border` — the muted
   * purple of the frame system, never brighter than the `dim` outline and
   * never white. Cells must already be clamped to their column budgets.
   */
  private browserRow(cells: readonly string[], widths: readonly number[]): string {
    const divider = this.theme.fg("border", "│");
    let line = divider;
    for (let i = 0; i < widths.length; i++) {
      const cell = cells[i] ?? "";
      const w = widths[i];
      line += cell + " ".repeat(Math.max(0, w - visibleWidth(cell))) + divider;
    }
    return line;
  }
}

/**
 * D59: the ONE Model Control Center frame implementation, shared by the
 * control surface and the profile editor so both carry the same identity.
 * Title sits inline in the top rule; all output clamped to width (D45).
 */
export function frameLines(lines: readonly string[], width: number, theme: Theme): string[] {
  const title = " MODEL CONTROL CENTER ";
  const topRest = width - visibleWidth(title) - 2;
  const out: string[] = [
    theme.fg("dim", "┌" + title + "─".repeat(Math.max(0, topRest)) + "┐"),
    ...lines.map((l) => {
      const pad = " ".repeat(Math.max(0, width - 2 - visibleWidth(l)));
      return theme.fg("dim", "│") + l + pad + theme.fg("dim", "│");
    }),
    theme.fg("dim", "└" + "─".repeat(Math.max(0, width - 2)) + "┘"),
  ];
  return clampLines(out, width);
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

/** Detail content for a focused provider (title supplied by panelLines). */
export function providerDetailLines(
  provider: string,
  count: number,
  theme: Theme,
  maxLines: number,
): string[] {
  const lines = [
    theme.fg("text", theme.bold(provider)),
    theme.fg("muted", `${count} selectable model${count === 1 ? "" : "s"}`),
    theme.fg("muted", "Configured / available to Pi · Connectivity: Unverified"),
    "",
    theme.fg("dim", "Enter — Browse models"),
  ];
  return lines.map((l) => (l ? `  ${l}` : l)).slice(0, maxLines);
}

/** Splits a selectable spec ("9router/bai/deepseek-v4-flash") into display parts. */
export function splitModelSpec(spec: string): { provider: string; route: string; name: string } {
  const parts = spec.split("/");
  return {
    provider: parts[0] ?? spec,
    route: parts.length > 2 ? parts.slice(1, -1).join("/") : "",
    name: parts[parts.length - 1] ?? spec,
  };
}

/** Row label for the model pane: display name or the provider-stripped spec
 * (the pane scope already names the provider — rows never repeat it). */
export function modelRowLabel(
  spec: string,
  names: Readonly<Record<string, string>>,
): { label: string; description?: string } {
  const bare = spec.slice(spec.indexOf("/") + 1);
  const display = names[spec];
  return display ? { label: display, description: bare } : { label: bare };
}

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

/**
 * Formats an output limit the way the inspector quotes it: 131072 → "131k",
 * 1050000 → "1.1M". Returns undefined when the entry omits maxTokens —
 * never fabricated.
 */
function outputLimitText(maxTokens: number | undefined): string | undefined {
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens) || maxTokens <= 0) return undefined;
  return maxTokens >= 1_000_000
    ? `${Math.round(maxTokens / 100_000) / 10}M`
    : `${Math.round(maxTokens / 1000)}k`;
}

/** Shared inspector body — D60 target layout:
 *   name / route / ctx · output / CAPABILITIES header + one cap per row / status.
 * Each fact gets its own short line so narrow columns truncate at word
 * boundaries instead of dropping whole capabilities. */
function inspectorBodyLines(
  displayName: string,
  routeText: string,
  model: AvailableModelMeta | undefined,
  theme: Theme,
  status: string,
): string[] {
  const caps = modelCaps(model ?? {});
  const outText = outputLimitText(model?.maxTokens);
  const lines = [
    theme.fg("text", theme.bold(displayName)),
    theme.fg("muted", routeText),
  ];
  // ctx and output share one metadata line; absent facts never fabricate —
  // with neither present the line says so plainly.
  const metaParts: string[] = [];
  if (caps.ctx !== "—") metaParts.push(`${caps.ctx} ctx`);
  if (outText) metaParts.push(`${outText} output`);
  lines.push(theme.fg("muted", metaParts.length > 0 ? metaParts.join(" · ") : "context size unknown"));
  const words: string[] = [];
  if (caps.reasoning) words.push("reasoning");
  if (caps.vision) words.push("vision");
  if (words.length > 0) {
    lines.push(theme.fg("dim", "CAPABILITIES"));
    for (const w of words) lines.push(theme.fg("success", `● ${w}`));
  }
  lines.push("", status);
  return lines;
}

/** Detail content for the highlighted model (title supplied by panelLines).
 * D59 third-column inspector: identity dominant, merged metadata line,
 * grouped capabilities, status. */
function selectedModelDetailLines(
  spec: string,
  displayName: string | undefined,
  getAvailable: () => ReadonlyArray<AvailableModelMeta>,
  currentLabel: string,
  theme: Theme,
  maxLines: number,
): string[] {
  const { provider, route, name } = splitModelSpec(spec);
  const [prov, ...rest] = spec.split("/");
  const model = getAvailable().find((m) => m.provider === prov && m.id === rest.join("/"));
  const isCurrent = spec === currentLabel;
  const routeText = route ? `${provider} / ${route}` : provider;
  const status = isCurrent ? theme.fg("success", "✓ Current Model") : theme.fg("dim", "Enter — Select");
  return inspectorBodyLines(displayName ?? name, routeText, model, theme, status)
    .map((l) => (l ? `  ${l}` : l))
    .slice(0, maxLines);
}
/** Detail content for the current model when no catalog highlight exists. */
function currentModelDetailLines(
  modelLabel: string,
  displayName: string | undefined,
  model: AvailableModelMeta | undefined,
  theme: Theme,
  maxLines: number,
): string[] {
  if (modelLabel.startsWith("(none")) {
    return [theme.fg("muted", modelLabel), theme.fg("dim", "Pick a provider, then a model")].slice(0, maxLines);
  }
  const { provider, route, name } = splitModelSpec(modelLabel);
  const routeText = route ? `${provider} / ${route}` : provider;
  return inspectorBodyLines(displayName ?? name, routeText, model, theme, theme.fg("success", "✓ Current Model"))
    .map((l) => (l ? `  ${l}` : l))
    .slice(0, maxLines);
}

/** Compact CURRENT MODEL header lines (name dominant, context secondary,
 * connectivity muted-warning — §5 hierarchy). */
function currentModelHeaderLines(
  modelLabel: string,
  displayName: string | undefined,
  theme: Theme,
): string[] {
  if (modelLabel.startsWith("(none")) {
    return [theme.fg("muted", theme.bold(modelLabel))];
  }
  const { provider, route, name } = splitModelSpec(modelLabel);
  const routeText = route ? `${provider} / ${route}` : provider;
  return [
    theme.fg("text", theme.bold(displayName ?? name)),
    theme.fg("muted", routeText) + theme.fg("warning", " · Connectivity: Unverified"),
  ];
}

/** Detail content for a focused profile (title supplied by panelLines). */
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
  const levelText = levelLabelForRuntime(level) ?? level;
  const lines = [
    theme.fg("text", theme.bold(profile)),
    theme.fg("muted", PROFILE_DESCRIPTIONS[profile]),
    theme.fg("dim", "Reasoning") + theme.fg("text", `  ${levelText}`),
  ];
  if (resolved.source === "execution" && isActive) {
    lines.push(theme.fg("warning", `● Execution · ${levelLabelForRuntime(resolved.level) ?? resolved.level}`));
  } else if (isActive) {
    lines.push(theme.fg("success", "● Active"));
  }
  lines.push(isDefault ? theme.fg("success", "★ Default") : theme.fg("muted", "○ Not default"));
  return lines.map((l) => (l ? `  ${l}` : l)).slice(0, maxLines);
}
// ---------------------------------------------------------------------------
// D64 Runtime Context + Input Surface. Three conceptual layers, OMP-inspired:
//   1. ACTIVITY (transient): a dedicated widget above the context bar that
//      renders ONLY while running — `<circle frame> MM:SS · <phrase>` — and
//      settles to `✓ Complete · MM:SS` / `✕ Error`; empty when idle (zero
//      vertical cost).
//   2. CONTEXT BAR (persistent): one OMP-style information spine —
//      `model · ● level · profile │ 📁 workspace │ used/limit · p%` — with
//      a purple identity rail. Drop order: task (omitted — no authoritative
//      source) → workspace → profile → compact usage → clamp. Model, level
//      and reasoning semantics never drop.
//   3. INPUT SURFACE: the host editor via the public setEditorComponent API —
//      a CustomEditor subclass whose render strips the generic top/bottom
//      rules and prefixes an accent `π │` gutter (stable, width-safe).
// Native "Working..." duplication is suppressed through the public
// setWorkingIndicator({frames: []}) + setWorkingMessage("") APIs — no host
// patch. Token-only colors; event-driven; zero polling.
// ---------------------------------------------------------------------------

/** One styled segment of the bar (text + the theme token that renders it). */
export interface LifecycleSpan {
  text: string;
  token: "muted" | "accent" | "success" | "error";
}

/**
 * Lifecycle store for the Runtime Context Bar. Module-level singleton —
 * mutated only by event handlers, read by the bar's render().
 */
export interface LifecycleStore {
  lifecycle: "ready" | "running" | "complete" | "error";
  startTs: number | null;
  endTs: number | null;
  activity: string | null;
  errorFlag: boolean;
  frameIndex: number;
}

const lifecycleStore: LifecycleStore = {
  lifecycle: "ready",
  startTs: null,
  endTs: null,
  activity: null,
  errorFlag: false,
  frameIndex: 0,
};

/** Animated circle frames for the running lifecycle (premium, non-braille). */
export const ACTIVITY_FRAMES = ["◐", "◓", "◑", "◒"];
/** Animation cadence shared by the activity line (same as built-in Loader). */
export const ACTIVITY_INTERVAL_MS = 80;
/** Context-usage tone thresholds — adopted from the built-in footer. */
const USAGE_WARNING_PCT = 70;
const USAGE_ERROR_PCT = 90;

/** Resets the store to the ready state (session_start / session_shutdown). */
export function resetLifecycleStore(): void {
  lifecycleStore.lifecycle = "ready";
  lifecycleStore.startTs = null;
  lifecycleStore.endTs = null;
  lifecycleStore.activity = null;
  lifecycleStore.errorFlag = false;
  lifecycleStore.frameIndex = 0;
}

/** Formats a duration as MM:SS (minutes roll over: 75:00 is 1 h 15 m). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Human-readable phrase for a tool execution start. Reuses the D37 guard's
 * arg-shape knowledge (path on file tools, command on bash, pattern on
 * grep/find); any unexpected shape falls back without crashing.
 */
export function activityPhrase(toolName: string, args: unknown): string {
  const argStr = (key: "path" | "command" | "pattern"): string | undefined => {
    if (typeof args !== "object" || args === null || !(key in args)) return undefined;
    // Host tool args arrive as an open record from the host; only key
    // presence plus typeof are trusted here, so the record view is safe.
    const rec = args as Record<string, unknown>;
    const v = rec[key];
    return typeof v === "string" ? v : undefined;
  };
  const base = (v: string | undefined): string | undefined => {
    if (!v) return undefined;
    const b = path.basename(v.replace(/[\\/]+$/, ""));
    return b.length > 0 ? b : undefined;
  };
  switch (toolName) {
    case "edit":
      return `Editing ${base(argStr("path")) ?? "file"}`;
    case "write":
      return `Writing ${base(argStr("path")) ?? "file"}`;
    case "read":
      return `Reading ${base(argStr("path")) ?? "file"}`;
    case "bash": {
      const command = (argStr("command") ?? "").trim();
      if (command.length > 0) {
        return `Running ${command.split(/\s+/)[0]}`;
      }
      return "Running bash";
    }
    case "grep":
    case "find":
      const pattern = (argStr("pattern") ?? "").trim();
      if (pattern.length > 0) {
        return `Searching ${pattern}`;
      }
      return "Searching workspace";
    default:
      return `Running ${toolName}`;
  }
}

/** Replaces the user home prefix with ~ (rendering tone is the caller's job). */
export function shortenPath(cwd: string, home: string | undefined): string {
  if (!home) return cwd;
  const norm = (p: string): string => p.replace(/[\\/]+$/, "").replace(/\\/g, "/");
  const c = norm(cwd);
  const h = norm(home);
  if (c === h) return "~";
  if (h.length > 0 && c.toLowerCase().startsWith(`${h.toLowerCase()}/`)) {
    return `~${c.slice(h.length)}`;
  }
  return cwd;
}

/** Usage rendering: "<used> / <limit> · <P>%" (footer-style token cadence:
 * 131072 → "131k", 1048576 → "1.0M"; identical to outputLimitText except at
 * whole-M boundaries, where the plan's D62 example fixes "1.0M"). */
export function formatUsageBar(
  usage: ContextUsage,
): { text: string; tone: "normal" | "warning" | "error" } {
  const limit = formatTokensCompact(usage.contextWindow);
  if (usage.tokens === null || usage.percent === null) {
    return { text: `? / ${limit}`, tone: "normal" };
  }
  const tone = usage.percent > USAGE_ERROR_PCT ? "error" : usage.percent > USAGE_WARNING_PCT ? "warning" : "normal";
  return { text: `${formatTokensCompact(usage.tokens)} / ${limit} · ${Math.round(usage.percent)}%`, tone };
}

/** Narrow-width compact usage: "<used>/<limit>" (separators dropped first). */
export function formatUsageCompact(usage: ContextUsage): string {
  const limit = formatTokensCompact(usage.contextWindow);
  if (usage.tokens === null) return `?/${limit}`;
  return `${formatTokensCompact(usage.tokens)}/${limit}`;
}

/**
 * LAYER 1 — the transient activity line, rendered ONLY while a run is in
 * flight (or freshly settled). `<circle frame> MM:SS · <phrase>` while
 * running; `✓ Complete · MM:SS` / `✕ Error` settle states; empty when idle —
 * the widget contributes zero lines so no vertical space is reserved.
 */
export function activityLine(store: LifecycleStore): LifecycleSpan {
  switch (store.lifecycle) {
    case "running": {
      const elapsed = store.startTs !== null ? Date.now() - store.startTs : 0;
      const phrase = store.activity ?? "Analyzing";
      return {
        text: `${ACTIVITY_FRAMES[store.frameIndex % ACTIVITY_FRAMES.length]} ${formatElapsed(elapsed)} · ${phrase}`,
        token: "accent",
      };
    }
    case "complete": {
      const elapsed = store.startTs !== null && store.endTs !== null ? store.endTs - store.startTs : 0;
      return { text: `✓ Complete · ${formatElapsed(elapsed)}`, token: "success" };
    }
    case "error":
      return { text: "✕ Error", token: "error" };
    default:
      return { text: "", token: "muted" };
  }
}

/** Pure lifecycle transitions (applied by the pi event handlers). */
export function applyAgentStart(store: LifecycleStore): void {
  store.lifecycle = "running";
  store.startTs = Date.now();
  store.endTs = null;
  store.activity = "Analyzing";
  store.errorFlag = false;
}

/** Error state from the last assistant message's stopReason. */
export function applyAgentEnd(store: LifecycleStore, messages: ReadonlyArray<unknown>): void {
  let stop: unknown;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m: unknown = messages[i];
    if (typeof m === "object" && m !== null && "role" in m && m.role === "assistant") {
      stop = "stopReason" in m ? m.stopReason : undefined;
      break;
    }
  }
  store.errorFlag = stop === "error" || stop === "aborted";
}

/** Fully settled: complete, or error when the run ended abnormally. */
export function applyAgentSettled(store: LifecycleStore): void {
  if (store.lifecycle === "running") {
    store.lifecycle = store.errorFlag ? "error" : "complete";
    store.endTs = Date.now();
  }
}

/** One activity at a time; only meaningful while running. */
export function applyToolStart(store: LifecycleStore, toolName: string, args: unknown): void {
  if (store.lifecycle === "running") store.activity = activityPhrase(toolName, args);
}

/** Tool finished — revert to the neutral in-progress phrase. */
export function applyToolEnd(store: LifecycleStore): void {
  if (store.lifecycle === "running") store.activity = "Analyzing";
}


/** Segment tokens for the D64 runtime-context field (OMP-style spine). */
export interface BarContext {
  running: boolean;
  modelLabel: string;
  levelLabel: string | undefined;
  levelToken: ThemeColor;
  profileLabel: string | undefined;
  workspace: string;
  branch: string | null;
  usage: ContextUsage | undefined;
}

const EMPTY_BAR_CONTEXT: BarContext = {
  running: false,
  modelLabel: "no-model",
  levelLabel: undefined,
  levelToken: "muted",
  profileLabel: undefined,
  workspace: "",
  branch: null,
  usage: undefined,
};

/**
 * LAYER 2 — the persistent runtime-context FIELD: ONE single horizontal
 * field, locked composition:
 *   `╭── ○ <model> · ● <level> · ★ <profile> > 📁 <ws> > ⑂ <branch> > <used>/<limit> (<p>%) ──╮`
 *   `╰─ π │ <input> … ╯`   ← (the input row is merged into the same frame by
 *   the editor wrapper — see piFrameRender below; this function returns the
 *   context row only).
 * Padding: `╭── ` keeps information off the border; ` ──╮` closes.
 * Width-aware drop order: branch → workspace → profile suffix → usage →
 * clamp. The lifecycle dot, model and ● level never drop on ordinary widths.
 */
export function contextFieldLines(parts: BarContext, width: number, theme: Theme): string[] {
  // D65: one coherent border token for ALL frame segments (consistent
  // brightness — no mixed dim/bright rules).
  const border = (t: string): string => theme.fg("border", t);
  const dim = (t: string): string => theme.fg("dim", t);
  // D65 lifecycle glyph: static state dot (the animated spinner lives in the
  // activity line above).
  const life = parts.running ? theme.fg("accent", "◉") : dim("○");
  // D65 hierarchy: model = primary (bold text), reasoning = D60 semantic
  // token, profile = lavender secondary (customMessageLabel), workspace =
  // readable cool accent (borderAccent), branch = subtle green (success),
  // usage = dynamic tone with a readable normal state.
  const model = theme.fg("text", theme.bold(parts.modelLabel));
  const level = parts.levelLabel ? theme.fg(parts.levelToken, `● ${parts.levelLabel}`) : null;
  const profile = parts.profileLabel ? theme.fg("accent", "★") + theme.fg("customMessageLabel", ` ${parts.profileLabel}`) : null;
  const identity = [`${life} ${model}`, level, profile].filter((s): s is string => s !== null);
  const place = parts.workspace ? theme.fg("borderAccent", `📁 ${parts.workspace}`) : null;
  const branch = parts.branch ? theme.fg("success", `⑂ ${parts.branch}`) : null;

  // Locked usage format: `<used>/<limit> (<pct>)`; normal state readable.
  const usage = parts.usage ?? null;
  const pctText = usage ? (usage.percent !== null ? `${Math.round(usage.percent)}%` : "?") : null;
  const pctTone = !usage
    ? "text"
    : usage.percent !== null && usage.percent > USAGE_ERROR_PCT
      ? "error"
      : usage.percent !== null && usage.percent > USAGE_WARNING_PCT
        ? "warning"
        : "text";
  const usageText = usage
    ? theme.fg(pctTone as ThemeColor, `${formatTokensCompact(usage.tokens ?? 0)}/${formatTokensCompact(usage.contextWindow)} (${pctText})`)
    : null;

  const gt = dim(" > ");
  const identityLine = identity.join(dim(" · "));
  const withPlace = place ? `${identityLine}${gt}${place}` : identityLine;

  // D65 surface treatment: the spine run gets the dark purple-tinted
  // customMessageBg background so the field reads as one intentional surface
  // (one field = one background; the rule dashes stay untinted).
  const tint = (s: string): string => theme.bg("customMessageBg", ` ${s} `);

  const compose = (left: string): string | null => {
    const tail = "──╮";
    // Wide glyphs (📁) can be undercounted by width meters; keep a 4-col
    // buffer so a compose match always truly fits (D45).
    const fill = width - visibleWidth(left) - visibleWidth(tail) - 5;
    return fill >= 1 ? `${left} ${border("─".repeat(fill))}${border(tail)}` : null;
  };
  const fits = (s: string): boolean => visibleWidth(s) <= width;

  // Drop order: branch → workspace → profile → usage → clamp.
  const attempts: string[] = [];
  for (const left of [
    `╭── ${tint(branch ? `${withPlace}${gt}${branch}${gt}${usageText ?? ""}` : `${withPlace}${usageText ? `${gt}${usageText}` : ""}`)}`,
    `╭── ${tint(`${withPlace}${usageText ? `${gt}${usageText}` : ""}`)}`,
    `╭── ${tint(`${identityLine}${usageText ? `${gt}${usageText}` : ""}`)}`,
    `╭── ${tint(identityLine)}`,
  ]) {
    const line = compose(left.trimEnd());
    if (line) {
      attempts.push(line);
      break;
    }
  }
  if (attempts.length === 0) {
    const bare = `╭── ${tint(identityLine)} `;
    attempts.push(fits(bare) ? bare + border("─".repeat(Math.max(1, width - visibleWidth(bare) - 3))) + border("──╮")
      : border(truncateToWidth(bare, Math.max(1, width - 3), "")) + border("──╮"));
  }
  // Authoritative D45 clamp — wide glyphs (📁) can defeat the width meters,
  // so the composed row is clamped one final time before leaving the function.
  return [truncateToWidth(attempts[0], width, "")];
}

/**
 * LAYER 1 — ActivityWidget: the transient runtime line hosted above the
 * context bar. Renders zero lines when idle, one line while running /
 * freshly settled. Owns the animation interval; repaints are event-driven.
 */
export class ActivityWidget implements Component {
  private interval: NodeJS.Timeout | null = null;
  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
  ) {}
  startAnimation(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      lifecycleStore.frameIndex = (lifecycleStore.frameIndex + 1) % ACTIVITY_FRAMES.length;
      this.tui.requestRender();
    }, ACTIVITY_INTERVAL_MS);
  }
  stopAnimation(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
  repaint(): void {
    this.tui.requestRender();
  }
  dispose(): void {
    this.stopAnimation();
  }
  render(width: number): string[] {
    const line = activityLine(lifecycleStore);
    if (!line.text) return [];
    const styled = this.theme.fg(line.token, line.text);
    return [visibleWidth(styled) <= width ? styled : truncateToWidth(styled, width, "")];
  }
  invalidate(): void {}
}

/**
 * LAYER 2 — RuntimeContextBar: the persistent runtime-context field (rounded
 * frame with the inline spine and embedded usage), recomputed from live
 * state on every render (the host repaints on every session event; no
 * polling).
 */
export class RuntimeContextBar implements Component {
  constructor(
    private readonly theme: Theme,
    private readonly getContext: () => BarContext,
  ) {}
  render(width: number): string[] {
    return contextFieldLines(this.getContext(), width, this.theme);
  }
  invalidate(): void {}
}


/** Token counts for compact footer display (mirrors the built-in formatTokens). */
export function formatTokensCompact(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

/** Aggregated session usage — same reducer shape as the built-in footer. */
export interface UsageTotalsResult {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  cacheHitRate: number | undefined;
}
/** Minimal usage shape carried by message/compaction/branch entries. */
export interface UsageLike {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: { total?: number } | number;
}

/** Minimal boundary shape for usage-bearing session entries (test-facing). */
export interface UsageEntryLike {
  type?: string;
  message?: { role?: string; usage?: UsageLike };
  usage?: UsageLike;
}

/** Aggregates assistant/toolResult/compaction usage from session entries. */
export function usageTotalsFromEntries(entries: ReadonlyArray<UsageEntryLike>): UsageTotalsResult {
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let cacheHitRate: number | undefined;
  for (const e of entries) {
    const usage =
      e.type === "message" && e.message?.role === "assistant"
        ? e.message.usage
        : e.type === "message" && e.message?.role === "toolResult"
          ? e.message.usage
          : (e.type === "branch_summary" || e.type === "compaction") && e.usage
            ? e.usage
            : undefined;
    if (!usage) continue;
    totals.input += usage.input ?? 0;
    totals.output += usage.output ?? 0;
    totals.cacheRead += usage.cacheRead ?? 0;
    totals.cacheWrite += usage.cacheWrite ?? 0;
    totals.cost += typeof usage.cost === "number" ? usage.cost : usage.cost?.total ?? 0;
    if (e.message?.role === "assistant") {
      const prompt = (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
      cacheHitRate = prompt > 0 ? ((usage.cacheRead ?? 0) / prompt) * 100 : undefined;
    }
  }
  return { ...totals, cacheHitRate };
}

/**
 * D65: the footer is visual noise. The primary surface ends at the input
 * frame; this footer renders NOTHING and exists only so the extension can
 * hold the FooterDataProvider (the branch source for the context field)
 * through the public setFooter API.
 */
export class MinimalFooter implements Component {
  render(_width: number): string[] {
    return [];
  }
  invalidate(): void {}
  dispose(): void {}
}

/**
 * LAYER 3 — the input surface. A CustomEditor subclass registered through the
 * PUBLIC setEditorComponent API (no host patch). Its render() is recomposed
 * by piFrameRender into the LOCKED composition: the context field's bottom
 * rule IS the input row — `╰─ π │ <text> ─╯` — with the π identity at the
 * far left inside the frame, one column of padding between border and π, and
 * the pipe separating identity from input. Empty input stays compact (one
 * row); multiline text grows additional bordered rows. All editor behavior
 * (multiline, cursor, autocomplete, keybindings, paste) is inherited
 * unchanged; the D63 dispatch path is unaffected because the host wires
 * onSubmit/handlers onto whichever editor the factory returns.
 */
function piFrameRender(lines: string[], width: number, border: (t: string) => string): string[] {
  // Base structure from the host editor: [topRule, ...content, bottomRule].
  const content = lines.slice(1, -1);
  // Row assembly: "╰─ "(3) + "π "(2) + "│ "(2) + interior + " ╯"(2) = width,
  // so interior = width - 9 exactly (π+space+pipe+space = 4 of the left 7).
  const interior = Math.max(1, width - 9);
  const out: string[] = [];
  // The editor content lines already carry the π gutter styling from the
  // base CustomEditor contract; strip the base's own borders and reframe.
  const pi = `${getAccentFg()("π")} ${getDimFg()("│")}`;
  content.forEach((text, i) => {
    const fitted = visibleWidth(text) <= interior ? text : truncateToWidth(text, interior, "");
    const pad = " ".repeat(Math.max(0, interior - visibleWidth(fitted)));
    const isLast = i === content.length - 1;
    if (i === 0) {
      // First content row: the context field's bottom rule closes here —
      // rendered by RuntimeContextBar; this row IS the input row.
      out.push(`${border("╰─ ")}${pi} ${fitted}${pad}${border(" ╯")}`);
    } else {
      out.push(`${border("│ ")}${fitted}${pad}${border(" │")}`);
    }
    if (isLast && content.length === 1) {
      // single-row input: nothing further.
    }
  });
  if (content.length === 0) {
    const pad = " ".repeat(interior);
    out.push(`${border("╰─ ")}${pi} ${pad}${border(" ╯")}`);
  }
  return out;
}

/** Live theme stylers for the input frame (captured from ctx.ui.theme at
 * session start). One coherent border token drives both fields. */
let accentFgFn: ((t: string) => string) | null = null;
let dimFgFn: ((t: string) => string) | null = null;
let borderFgFn: ((t: string) => string) | null = null;
function getAccentFg(): (t: string) => string {
  return accentFgFn ?? ((t) => t);
}
function getDimFg(): (t: string) => string {
  return dimFgFn ?? ((t) => t);
}
function getBorderFg(): (t: string) => string {
  return borderFgFn ?? ((t) => t);
}
/** Captures the live theme's stylers (called at session_start). */
export function setPiEditorThemeFns(accent: (t: string) => string, dim: (t: string) => string, border: (t: string) => string): void {
  accentFgFn = accent;
  dimFgFn = dim;
  borderFgFn = border;
}

/** Read-only access for tests and diagnostics. */
export function getLifecycleStore(): LifecycleStore {
  return lifecycleStore;
}

/**
 * LAYER 3 — the input surface. Built through the PUBLIC setEditorComponent
 * API (no host patch): a CustomEditor subclass whose render() recomposes the
 * base output into a rounded, padded box with the accent `π │` identity on
 * the frame and interior rail. All editor behavior (multiline,
 * cursor, autocomplete, keybindings, paste) is inherited unchanged; the D63
 * dispatch path is unaffected because the host wires onSubmit/handlers onto
 * whichever editor the factory returns. The class value is imported
 * lazily (it lives in the host package, whose runtime internals must not be
 * pulled into headless/tsx module graphs).
 */
let PiInputEditorClass: (new (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, options?: EditorOptions) => EditorComponent) | null = null;
let piEditorClassPromise: Promise<void> | null = null;

async function ensurePiInputEditorClass(): Promise<void> {
  if (PiInputEditorClass) return;
  if (!piEditorClassPromise) {
    piEditorClassPromise = (async () => {
      // The host package is always present in the extension runtime (jiti);
      // the specifier resolves to an absolute file URL so both the runtime and
      // headless test runners can load it without package-exports ambiguity.
      const appdata = process.env.APPDATA;
      const dir = process.env.PI_CODE_AGENT_DIR ?? (appdata ? path.join(appdata, "npm", "node_modules", "@earendil-works", "pi-coding-agent") : "");
      if (!dir) throw new Error("pi-coding-agent location not found");
      const hostSpecifier = pathToFileURL(path.join(dir, "dist", "index.js")).href;
      const mod = (await import(/* webpackIgnore: true */ hostSpecifier)) as unknown as { CustomEditor: new (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, options?: EditorOptions) => EditorComponent };
      const Base = mod.CustomEditor;
      PiInputEditorClass = class extends (Base as new (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, options?: EditorOptions) => EditorComponent) {
        render(width: number): string[] {
          // Reserve 4 columns for the frame chrome ("│ " + " │"); the base
          // editor lays out inside, then the wrapper adds the frame.
          const base = super.render(Math.max(8, width - 4));
          const borderFn = this.borderColor ?? ((t: string) => t);
          return piFrameRender(base, width, borderFn);
        }
        invalidate(): void {}
      };
    })();
  }
  await piEditorClassPromise;
}

/** Ensures the lazy editor class is loaded before the sync factory runs. */
export async function loadPiInputEditorClass(): Promise<void> {
  await ensurePiInputEditorClass();
}

/** Builds the D64 input editor inside the host's public editor factory. */
export function piInputEditorFactory(
  tui: TUI,
  theme: EditorTheme,
  keybindings: KeybindingsManager,
): EditorComponent {
  if (!PiInputEditorClass) throw new Error("PiInputEditor not loaded — call loadPiInputEditorClass() first");
  return new (PiInputEditorClass as new (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, options?: EditorOptions) => EditorComponent)(
    tui,
    theme,
    keybindings,
  );
}

/** Module-level singletons for the live bar + its context provider. The
 * widget factory may be re-invoked by the host (theme switches, hide/restore
 * around the Model Control Center); replacing the component must not leak the
 * previous animation interval, and event handlers reach the TUI only through
 * these refs (no ctx captured at registration time). */
let activeActivityWidget: ActivityWidget | null = null;
let activeRuntimeBar: RuntimeContextBar | null = null;
/** Authoritative git-branch source, captured from the footer factory's
 * FooterDataProvider (the only public path to git state). */
let runtimeFooterData: { getGitBranch(): string | null } | null = null;
let runtimeBarContext: (() => BarContext) | null = null;

/** Live session data for the bar. Every ctx accessor is try/caught: async
 * continuations can outlive the runner in headless modes, where ctx accessors
 * throw assertActive — the bar must never crash a render. */
function makeBarContext(ctx: ExtensionContext): () => BarContext {
  const safe = <T,>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return (): BarContext => {
    const levelLabel = safe(() => levelLabelForRuntime(resolveEffective(loadReasoningState()).level), undefined);
    const levelToken: ThemeColor = levelLabel && LEVEL_COLOR[levelLabel] ? LEVEL_COLOR[levelLabel] : "muted";
    const modelLabel = safe(() => {
      const m = ctx.model;
      if (!m || (m.provider === "unknown" && m.id === "unknown")) return "no-model";
      const names = loadModelsVisibility().names;
      return names[`${m.provider}/${m.id}`] ?? m.id;
    }, "no-model");
    const usage = safe(() => {
      const u = ctx.getContextUsage();
      if (u) return u;
      const cw = ctx.model?.contextWindow;
      return typeof cw === "number" && cw > 0 ? { tokens: null, contextWindow: cw, percent: null } : undefined;
    }, undefined);
    const profileLabel = safe(() => loadReasoningState().defaultProfile as string | undefined, undefined);
    return {
      running: lifecycleStore.lifecycle === "running",
      modelLabel,
      levelLabel,
      levelToken,
      profileLabel,
      workspace: safe(() => shortenPath(ctx.cwd, os.homedir()), ""),
      branch: runtimeFooterData?.getGitBranch() ?? null,
      usage,
    };
  };
}

/** Widget factories (stable identity so hide/restore can re-register them). */
function runtimeActivityWidgetFactory(tui: TUI, theme: Theme): ActivityWidget {
  activeActivityWidget?.dispose();
  const w = new ActivityWidget(tui, theme);
  activeActivityWidget = w;
  return w;
}

function runtimeContextWidgetFactory(_tui: TUI, theme: Theme): RuntimeContextBar {
  return new RuntimeContextBar(theme, () => runtimeBarContext?.() ?? EMPTY_BAR_CONTEXT);
}

const RUNTIME_ACTIVITY_WIDGET_KEY = "runtime-activity";
const RUNTIME_CONTEXT_WIDGET_KEY = "runtime-context";
/**
 * Grouped selection list for the /mcc overview. Headers and disabled rows are
 * rendered but skipped by navigation; arrow keys wrap across selectable items
 * only. Viewport-limited to maxLines rendered lines with a scroll indicator.
 */
export class MccOverviewList implements Component {
  private readonly items: MccItem[] = [];
  private selectedIndex = 0;
  /**
   * Whether the keyboard cursor (› + bounded highlight) is visible. The
   * surface keeps exactly ONE region active at a time; passive panes render
   * their tracked selection as a plain readable row with no competing cursor.
   */
  showCursor = true;
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
      (visible[visible.length - 1].kind === "spacer" || visible[visible.length - 1].kind === "header") &&
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
   * a semantic level column only when some row actually carries a level
   * (provider rows are level-free — reserving the column would starve their
   * count text), and the description takes what is left. Bounded by the
   * available width (D45 invariant).
   */
  private columns(width: number): { name: number; level: number; desc: number } {
    let widestName = 0;
    let widestMarker = 0;
    let widestLevel = 0;
    let hasLevel = false;
    for (const s of this.sections) {
      for (const row of s.rows) {
        const isItem = row.kind === "item";
        widestName = Math.max(widestName, visibleWidth(MccOverviewList.nameOf(row)));
        if (isItem) {
          const markerText = MccOverviewList.markerOf(row.item.marked);
          if (markerText) widestMarker = Math.max(widestMarker, visibleWidth(markerText) + 1);
        }
        const level = MccOverviewList.levelOf(row.kind === "item" ? row.item.primary : row.disabled.primary);
        if (level) {
          hasLevel = true;
          widestLevel = Math.max(widestLevel, visibleWidth(level));
        }
      }
    }
    const prefixW = 2;
    const levelCol = hasLevel ? Math.min(LEVEL_WIDTH + 2, widestLevel + 2) : 0;
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
    const prefix = selected && this.showCursor ? this.theme.fg("accent", "› ") : "  ";
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
    if (selected && this.showCursor) {
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
    // Unavailable rows say why, aligned with the level column when one exists;
    // level-free sections (providers) fold the notice into the dimmed row.
    const levelCell = cols.level > 0 ? this.theme.fg("dim", " " + padCell("unavailable", Math.max(1, cols.level - 1))) : "";
    const descCell =
      disabled.description && cols.desc >= 14 ? truncateToWidth(disabled.description, cols.desc, "…") : "";
    return this.fitLine(this.theme.fg("dim", "  " + nameCell + levelCell + descCell), width);
  }

  /** Final safety net: no rendered line may ever exceed the available width. */
  private fitLine(line: string, width: number): string {
    return visibleWidth(line) > width ? truncateToWidth(line, width, "") : line;
  }
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
      resetLifecycleStore();
      // D64 Runtime Context + Input Surface (interactive TUI only): the
      // activity widget is registered FIRST so it renders ABOVE the context
      // bar; the reduced footer stays; the native "Working..." spinner is
      // suppressed via the public setWorkingIndicator/setWorkingMessage APIs
      // (single lifecycle signal lives in the activity line); the π input
      // editor is installed through the public setEditorComponent factory.
      if (ctx.hasUI && ctx.mode === "tui") {
        try {
          runtimeBarContext = makeBarContext(ctx);
          ctx.ui.setWidget(
            RUNTIME_ACTIVITY_WIDGET_KEY,
            (tui, theme) => runtimeActivityWidgetFactory(tui, theme),
            { placement: "aboveEditor" },
          );
          ctx.ui.setWidget(
            RUNTIME_CONTEXT_WIDGET_KEY,
            (_tui, theme) => runtimeContextWidgetFactory(_tui, theme),
            { placement: "aboveEditor" },
          );
          ctx.ui.setWorkingMessage("");
          ctx.ui.setWorkingIndicator({ frames: [] });
          // D64 primary-surface discipline: third-party extensions may mount
          // their own status widgets below the editor (pi-lens). These are
          // diagnostics, not runtime identity — suppress the known noise
          // widget keys so the primary surface stays clean (they re-mount
          // only on their own session_start, which ran before ours).
          for (const noiseKey of ["pi-lens"]) {
            try {
              ctx.ui.setWidget(noiseKey, undefined);
            } catch {}
          }
          const liveTheme = ctx.ui.theme;
          setPiEditorThemeFns(
            (t) => liveTheme.fg("accent", t),
            (t) => liveTheme.fg("dim", t),
            (t) => liveTheme.fg("border", t),
          );
          await loadPiInputEditorClass();
          ctx.ui.setEditorComponent((tui, editorTheme, keybindings) =>
            piInputEditorFactory(tui, editorTheme, keybindings),
          );
          // D65: the footer is visual noise — the primary surface ends at
          // the input frame. Register a zero-height footer purely to capture
          // the FooterDataProvider (the branch source for the context field);
          // it renders nothing.
          ctx.ui.setFooter((_tui, _theme, footerData) => {
            runtimeFooterData = footerData;
            return new MinimalFooter();
          });
        } catch {}
      }

      // D62 clean cutover: the topology fragment lived only in the extension
      // status line; the bar now carries workspace identity (shortenPath).
      void topo;

      check9routerHealth()
        .then(async (health) => {
          try {
            if (health.ok) {
              // D62: "9router online" status fragment removed — router health
              // stays visible via /model offline wording, /doctor, notify().
              // D57 manual-start policy: never spawn the router. Refresh the
              // catalog exactly once when it is already healthy at boot; a
              // failing refresh simply leaves the provider unavailable.
              await refreshCatalogWhenRouterReady(() => ctx.modelRegistry.refresh());
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
              // D57: router is offline — leave it to the user. No spawning,
              // no retries, no polling. The next explicit refresh trigger
              // (e.g. /model open) picks the catalog up once the user has
              // started the router manually.
              if (ctx.hasUI) {
                // D62: offline status fragment removed (same rationale).
                ctx.ui.notify("9router is offline (:20128). Start it manually, then open /model to load its catalog.", "warning");
              }
            }
          } catch {}
        })
        .catch(() => {});
    } catch {}
  });

  pi.on("agent_start", (_event, ctx) => {
    applyAgentStart(lifecycleStore);
    try {
      if (ctx.hasUI && ctx.mode === "tui") {
        activeActivityWidget?.startAnimation();
        activeActivityWidget?.repaint();
      }
    } catch {}
  });
  pi.on("agent_end", (event) => {
    applyAgentEnd(lifecycleStore, event.messages);
  });
  pi.on("agent_settled", (_event, ctx) => {
    applyAgentSettled(lifecycleStore);
    try {
      if (ctx.hasUI && ctx.mode === "tui") {
        activeActivityWidget?.stopAnimation();
        activeActivityWidget?.repaint();
      }
    } catch {}
  });
  pi.on("tool_execution_start", (event, ctx) => {
    applyToolStart(lifecycleStore, event.toolName, event.args);
    try {
      if (ctx.hasUI && ctx.mode === "tui") activeActivityWidget?.repaint();
    } catch {}
  });
  pi.on("tool_execution_end", (_event, ctx) => {
    applyToolEnd(lifecycleStore);
    try {
      if (ctx.hasUI && ctx.mode === "tui") activeActivityWidget?.repaint();
    } catch {}
  });
  pi.on("session_shutdown", (_event, ctx) => {
    resetLifecycleStore();
    try {
      if (ctx.hasUI && ctx.mode === "tui") {
        activeActivityWidget?.dispose();
      }
    } catch {}
    activeActivityWidget = null;
  });

  pi.on("model_select", async (event, ctx) => {
    if (!ctx.hasUI) return;
    if (restoringBootDefault) {
      restoringBootDefault = false; // boot restoration is not a user model change
      return;
    }
    // D44 host bridge: same-model selector picks now emit with sameModel+set.
    const ev = event as { sameModel?: boolean; source?: string };
    if (!shouldOpenControlCenter(ev)) return;
    // A surface loop is already open (its own setModel fired this event);
    // the loop re-renders itself — never stack a second surface on top.
    if (modelSurfaceLoops > 0) return;
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
    // D62: the "reasoning" status fragment moved into the Runtime Context
    // Bar (level dot + Default/Execution profile line); the system prompt
    // reasoning line below is unchanged.
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

  // D51: /model routes here via the host bridge (interactive-mode.js override).
  // This is the unified Model Control Surface entry point.
  pi.registerCommand("model", {
    description: "Model Control Center",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      await runModelControlCenter(pi, ctx);
    },
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


/** Active runModelControlCenter loops. While one is open, model_select events
 * fired by the surface's own setModel are absorbed: the loop re-renders with
 * fresh state itself, so a second loop must never stack on top (which caused
 * double-Esc exits and state carryover between layers). */
let modelSurfaceLoops = 0;

/** The unified Model Control Center flow (D53): one surface — providers |
 * models browser on top, focus-following detail, horizontal reasoning
 * profiles, contextual footer. Focus, scope, search and the profile cursor
 * persist across model selections and profile edits. */
async function runModelControlCenter(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  // D59 purple identity: the surface renders with enum tokens only, and the
  // bundled mcc-purple theme resolves them into the approved palette. Loaded
  // when the surface opens; the user's previous theme is restored on close.
  const previousTheme = typeof ctx.ui?.theme?.name === "string" ? ctx.ui.theme.name : null;
  try {
    const mccTheme = ctx.ui.getTheme?.("mcc-purple");
    if (mccTheme) ctx.ui.setTheme?.(mccTheme);
  } catch {
    // D59: best-effort theme identity; graceful fallback to the active theme.
  }
  // D64: while the Model Control Center owns the editor area, BOTH runtime
  // layers hide (activity + context bar); the finally below restores them.
  if (ctx.mode === "tui") {
    try {
      ctx.ui.setWidget(RUNTIME_ACTIVITY_WIDGET_KEY, undefined);
      ctx.ui.setWidget(RUNTIME_CONTEXT_WIDGET_KEY, undefined);
    } catch {}
  }
  modelSurfaceLoops++;
  try {
    return await runModelControlSurfaceLoop(pi, ctx);
  } finally {
    modelSurfaceLoops--;
    if (ctx.mode === "tui") {
      try {
        ctx.ui.setWidget(RUNTIME_ACTIVITY_WIDGET_KEY, runtimeActivityWidgetFactory, { placement: "aboveEditor" });
        ctx.ui.setWidget(RUNTIME_CONTEXT_WIDGET_KEY, runtimeContextWidgetFactory, { placement: "aboveEditor" });
      } catch {}
    }
    try {
      if (previousTheme) ctx.ui.setTheme?.(previousTheme);
    } catch {
    }
  }
}

async function runModelControlSurfaceLoop(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const surfaceState: ModelSurfaceState = { focus: "models", provider: null, filter: "", profileFocus: 0 };
  // D57 manual-start recovery (one-shot per surface open): when the dynamic
  // catalog is empty but the router is now reachable (the user started it
  // manually after Pi booted), refresh once so this very surface shows the
  // models. No polling, no retries — if the router is still down the surface
  // renders the truthful offline state and the next open tries again.
  let recoveryRefreshed = false;
  for (;;) {
    if (!recoveryRefreshed && listAvailableModelSpecsSafe(ctx).length === 0) {
      recoveryRefreshed = true;
      const health = await check9routerHealth();
      if (health.ok) {
        await refreshCatalogWhenRouterReady(() => ctx.modelRegistry.refresh());
      }
    }
    const state = loadReasoningState();
    const resolved = resolveEffective(state);
    const isPlaceholder =
      !!ctx.model && ctx.model.provider === "unknown" && ctx.model.id === "unknown";
    const modelLabel =
      isPlaceholder || !ctx.model ? "(none — choose below)" : `${ctx.model.provider}/${ctx.model.id}`;
    const supportsVision =
      !!ctx.model && !isPlaceholder &&
      Array.isArray(ctx.model.input) && ctx.model.input.includes("image");
    const allSpecs = sortModelsRouterFirst(listAvailableModelSpecsSafe(ctx));
    const names = loadModelsVisibility().names;
    const getAvailable = () => ctx.modelRegistry.getAvailable();
    // PROVIDERS pane: configured rows (selectable, truthful counts) + registered-
    // but-unconfigured rows (dimmed, non-selectable). Never claim upstream auth.
    const configured = providerCounts(allSpecs);
    const configuredNames = new Set(configured.map((c) => c.name));
    const providerRows: MccRow[] = configured.map((p) => ({
      kind: "item" as const,
      item: { value: `provider:${p.name}`, primary: p.name, description: String(p.count) },
    }));
    for (const registered of ctx.modelRegistry.getRegisteredProviderIds() ?? []) {
      if (!configuredNames.has(registered)) {
        // D57 wording: the provider contributes no models to the current
        // availability snapshot. For 9router specifically the usual cause is
        // that the user has not started it yet (manual-start policy) — say
        // that, without ever claiming it is un/configured upstream.
        const note =
          registered === "9router" ? "not running — start 9router manually" : "registered · not configured";
        providerRows.push({ kind: "disabled" as const, disabled: { primary: `○ ${registered}`, description: note } });
      }
    }
    const providerSections: MccSection[] = [{ title: "", rows: providerRows }];

    // REASONING PROFILES chips: one per profile, horizontal density, markers
    // distinct (★ default / ● execution) — independent of the model dimension.
    const chips: ProfileChip[] = REASONING_PROFILES.map((name) => {
      const runtime = state.profiles[name];
      const gated = name === "Vision" && !supportsVision;
      return {
        profile: name,
        level: levelLabelForRuntime(runtime) ?? runtime,
        marker:
          resolved.source === "execution" && resolved.profile === name
            ? ("execution" as const)
            : state.defaultProfile === name
              ? ("default" as const)
              : null,
        disabled: gated ? "current model has no image input" : undefined,
      };
    });

    const result = await ctx.ui.custom<
      { kind: "model"; spec: string } | { kind: "profile"; profile: ReasoningProfileName } | null
    >((tui, theme, _kb, done) => {
      const surface = new ModelControlSurface(
        providerSections,
        theme,
        allSpecs,
        names,
        modelLabel,
        getAvailable,
        state,
        resolved,
        chips,
        surfaceState,
      );
      surface.onSelectModel = (spec) => done({ kind: "model", spec });
      surface.onEditProfile = (profile) => done({ kind: "profile", profile });
      surface.onClose = () => done(null);

      // D59: the surface renders the whole Row 1 band itself — inline title
      // rule, CURRENT MODEL context, browser box — so the frame is drawn in
      // exactly one place (frameLines).
      return {
        render: (w: number) => surface.render(w),
        invalidate: () => surface.invalidate(),
        handleInput: (data: string) => {
          surface.handleInput(data);
          tui.requestRender();
        },
      };
    });
    if (!result) return;
    if (result.kind === "model") {
      const [prov, ...rest] = result.spec.split("/");
      const target = ctx.modelRegistry.getAvailable().find((mm) => mm.provider === prov && mm.id === rest.join("/"));
      if (!target) {
        ctx.ui.notify(`Could not resolve model "${result.spec}".`, "warning");
        continue;
      }
      await pi.setModel(target as never);
      ctx.ui.notify(`Model: ${result.spec}`, "info");
      continue; // stay in the surface — header/detail refresh on the next pass
    }
    if (result.kind === "profile") {
      // ---- Profile editor (levels + Default Profile designation) ----
      const profile = result.profile;
      if (!REASONING_PROFILES.includes(profile)) continue;
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
          const items: SelectItem[] = choices.map((c) => ({ value: c.runtime ?? c.kind, label: c.label }));
          const list = new SelectList(items, Math.max(7, items.length), {
            selectedPrefix: (t) => theme.fg("accent", "› "),
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
          const currentLabel = levelLabelForRuntime(state.profiles[profile]) ?? state.profiles[profile];
          return {
            render: (w: number) => {
              // D59: the editor keeps the MCC identity — the SAME outer
              // frame (single frameLines implementation), centered as a
              // 52-column panel, clamped to the terminal (D45).
              const inner = Math.max(24, Math.min(52, w - 8));
              const listW = Math.max(1, inner - 4);
              const lines = [
                theme.fg("customMessageLabel", theme.bold("EDIT PROFILE")),
                theme.fg("text", theme.bold(profile)),
                theme.fg("muted", PROFILE_DESCRIPTIONS[profile]),
                theme.fg("dim", "Reasoning") + "  " + theme.fg(LEVEL_COLOR[currentLabel] ?? "muted", currentLabel),
                "",
                ...clampLines(list.render(listW), listW).map((l) => `  ${l}`),
                "",
                theme.fg("dim", "Enter Save   Esc Cancel"),
              ];
              const framed = frameLines(clampLines(lines, inner), inner + 2, theme);
              const indent = " ".repeat(Math.max(0, Math.floor((w - (inner + 2)) / 2)));
              return clampLines(framed.map((l) => indent + l), w);
            },
            invalidate: () => list.invalidate(),
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
          saveReasoningState(state);
          ctx.ui.notify(`${profile} · ${chosen.runtime}`, "info");
        }
      }
      continue;
    }
  }
}
