import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * power-tools: hand-rolled tools that fill gaps in the built-in set.
 * - repo_tree: one-call project overview (the model would otherwise burn
 *   several ls/find calls and still miss the shape of the repo)
 * - git_log: recent history + current branch
 *
 * Extensions run with full system permissions; keep this file reviewed.
 */

const IGNORED = new Set([
  ".git", "node_modules", "dist", "build", "out", "target", "coverage",
  ".venv", "venv", "__pycache__", ".next", ".cache", ".pytest_cache",
  ".mypy_cache", ".turbo", ".idea", ".vscode", "bin", "obj",
]);

const MAX_LINES = 500;
const MAX_ENTRIES_PER_DIR = 60;

interface WalkStats {
  dirs: number;
  files: number;
  bytes: number;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("power-tools", "ready");
  });

  pi.registerTool({
    name: "repo_tree",
    label: "Repo Tree",
    description:
      "Print a compact tree of the current project (skips .git, node_modules, build output) with file sizes. Use for a one-call repository overview.",
    parameters: Type.Object({
      depth: Type.Optional(
        Type.Integer({ description: "Max directory depth (1-6)", default: 3, minimum: 1, maximum: 6 })
      ),
      dir: Type.Optional(
        Type.String({ description: "Subdirectory to start from (default: project root)" })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const depth = params.depth ?? 3;
      const root = params.dir ? path.resolve(process.cwd(), params.dir) : process.cwd();
      const stats: WalkStats = { dirs: 0, files: 0, bytes: 0 };
      const lines: string[] = [];
      try {
        if (!fs.existsSync(root)) {
          return { content: [{ type: "text", text: `repo_tree: path not found: ${root}` }], details: {} };
        }
        walk(root, "", depth, lines, stats);
        lines.push("");
        lines.push(
          `${stats.dirs} dirs, ${stats.files} files, ${formatBytes(stats.bytes)}`
        );
        return { content: [{ type: "text", text: lines.join("\n") }], details: {} };
      } catch (error) {
        return {
          content: [{ type: "text", text: `repo_tree failed: ${error instanceof Error ? error.message : String(error)}` }],
          details: {},
        };
      }
    },
  });

  pi.registerTool({
    name: "git_log",
    label: "Git Log",
    description:
      "Show the current git branch and the most recent commits. Use to understand recent project history before making changes.",
    parameters: Type.Object({
      count: Type.Optional(
        Type.Integer({ description: "Number of commits (1-50)", default: 15, minimum: 1, maximum: 50 })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const count = params.count ?? 15;
      try {
        const branch = execFileSync("git", ["branch", "--show-current"], {
          encoding: "utf8", timeout: 10000, windowsHide: true,
        }).trim();
        const log = execFileSync("git", ["log", "--oneline", "--decorate", `-n${count}`], {
          encoding: "utf8", timeout: 10000, windowsHide: true,
        }).trim();
        return {
          content: [{ type: "text", text: `branch: ${branch || "(detached HEAD)"}\n${log}` }],
          details: {},
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `git_log failed: ${error instanceof Error ? error.message : String(error)}` }],
          details: {},
        };
      }
    },
  });

  pi.registerCommand("power-tools", {
    description: "Show which power-tools are registered",
    handler: async (_args, ctx) => {
      ctx.ui.notify("power-tools: repo_tree, git_log registered", "info");
    },
  });
}

function walk(dir: string, prefix: string, depthLeft: number, lines: string[], stats: WalkStats): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const visible = entries
    .filter((e) => !e.name.startsWith(".") && !IGNORED.has(e.name))
    .sort((a, b) =>
      a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1
    );
  if (visible.length > MAX_ENTRIES_PER_DIR) {
    const overflow = visible.splice(MAX_ENTRIES_PER_DIR);
    visible.push({ name: `… ${overflow.length} more entries omitted`, isDirectory: () => false } as fs.Dirent);
  }
  for (const entry of visible) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      stats.dirs += 1;
      lines.push(`${prefix}${entry.name}/`);
      if (depthLeft > 0 && lines.length < MAX_LINES) {
        walk(full, `${prefix}  `, depthLeft - 1, lines, stats);
      }
    } else {
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        /* unreadable file: size stays 0 */
      }
      stats.files += 1;
      stats.bytes += size;
      lines.push(`${prefix}${entry.name}  (${formatBytes(size)})`);
      if (lines.length >= MAX_LINES) {
        lines.push("… tree truncated");
        return;
      }
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i++) {
    value /= 1024;
    unit = units[i];
  }
  return `${value.toFixed(1)} ${unit}`;
}
