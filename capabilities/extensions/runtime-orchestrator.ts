import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
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
  ctx.ui.setStatus("9router", "starting…");
  try {
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
        ctx.ui.setStatus("9router", "online");
        ctx.ui.notify("9router auto-started successfully (:20128)", "info");
        return true;
      }
    }
  } catch {}

  ctx.ui.setStatus("9router", "offline");
  ctx.ui.notify("9router is offline (:20128). Run '9router' in a terminal.", "warning");
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

export default function (pi: ExtensionAPI) {
  // Phase 4 (D36): bridge the live 9router catalog into Pi's /model selector via
  // the native dynamic-provider mechanism. Only the "9router" provider id is
  // touched; all other providers remain untouched. Fail-open: refresh errors are
  // handled by Pi's per-provider error isolation and keep the previous catalog.
  pi.registerProvider("9router", {
    name: "9router",
    baseUrl: ROUTER_ENDPOINT.replace(/\/v1\/models$/, ""),
    api: "openai-completions",
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
    const topo = detectProjectTopology(ctx.cwd);
    ctx.ui.setStatus("topology", `${topo.name} [${topo.type}${topo.framework ? `/${topo.framework}` : ""}]`);

    check9routerHealth().then(async (health) => {
      if (health.ok) {
        ctx.ui.setStatus("9router", "online");
      } else {
        await autoStart9router(ctx);
      }
    });
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
    return {
      systemPrompt: `${basePrompt}\n\n# Active Workspace Environment\n${topoContext}`,
    };
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
}
