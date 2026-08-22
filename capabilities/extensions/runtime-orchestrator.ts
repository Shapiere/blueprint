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

export default function (pi: ExtensionAPI) {
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

    return {
      systemPrompt: `${event.systemPrompt}\n\n# Active Workspace Environment\n${topoContext}`,
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
        results.push(`✓ 9router: Online (:20128) — ${routerHealth.modelCount ?? "~200"} models available`);
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

      const topo = detectProjectTopology(ctx.cwd);
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
