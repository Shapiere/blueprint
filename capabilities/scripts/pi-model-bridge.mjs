#!/usr/bin/env node
/**
 * pi-model-bridge — D44/D51 compatibility bridge for the unified /model flow.
 *
 * Two patches, both minimal and structure-checked:
 *
 * D44 (agent-session.js): Pi skips the extension `model_select` event when the
 *   selected model equals the current one. The bridge emits the SAME event with
 *   `sameModel: true` so re-confirming the current model still opens the
 *   control surface.
 *
 * D51 (interactive-mode.js): Pi hard-codes `/model` dispatch before extension
 *   command handling. The bridge inserts an extension-override check so that
 *   `/model` routes to the Harness Pi Model Control Surface instead of the
 *   native one-column picker, when the extension has registered a `model`
 *   command.
 *
 * Usage:
 *   node pi-model-bridge.mjs status
 *   node pi-model-bridge.mjs verify
 *   node pi-model-bridge.mjs apply
 *   node pi-model-bridge.mjs restore
 *
 * Safety:
 * - Version guard: only 0.83.* / 0.84.* with the exact expected source
 *   structure are patched; anything else refuses loudly.
 * - Idempotent: applying twice is a no-op.
 * - Reversible: `restore` returns the pristine files from the kept backups.
 * - Survives `pi update`: update replaces dist → run `apply` again; doctor
 *   reports bridge state either way.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SUPPORTED_PREFIXES = ["0.83.", "0.84."];

// ---- D44: agent-session.js same-model model_select emission ----
const D44_MARKER = "sameModel: true";
const D44_SIGNATURE = "if (modelsAreEqual(previousModel, nextModel))\n            return;";
const D44_PATCHED = `if (modelsAreEqual(previousModel, nextModel)) {
            await this._extensionRunner.emit({ type: "model_select", model: nextModel, previousModel, source, ${D44_MARKER} });
            return;
        }`;

// ---- D51: interactive-mode.js /model extension override ----
// D63 fix: the extension dispatch MUST sit inside the /model text guard.
// The original D51 blob dispatched _modelCmd.handler for EVERY submitted
// text (typing "testing" + Enter opened the Model Control Surface).
const D51_MARKER = "D51: extension /model override";
const D51_SIGNATURE = 'if (text === "/model" || text.startsWith("/model ")) {';
const D51_PATCHED = `// ${D51_MARKER}
            if (text === "/model" || text.startsWith("/model ")) {
            const _extRunner = this.session?.extensionRunner;
            if (_extRunner) {
                const _cmds = _extRunner.getRegisteredCommands?.() ?? [];
                const _modelCmd = _cmds.find((c) => c.name === "model");
                if (_modelCmd) {
                    this.editor.setText("");
                    const _extCtx = _extRunner.createCommandContext?.() ?? this.session;
                    await _modelCmd.handler(text.startsWith("/model ") ? text.slice(7).trim() : "", _extCtx);
                    return;
                }
            }
            }
            if (text === "/model" || text.startsWith("/model ")) {`;
// Pre-D63 blob (applied without the text guard) — migrated by apply().
const D51_LEGACY_PATCHED = `// ${D51_MARKER}
            const _extRunner = this.session?.extensionRunner;
            if (_extRunner) {
                const _cmds = _extRunner.getRegisteredCommands?.() ?? [];
                const _modelCmd = _cmds.find((c) => c.name === "model");
                if (_modelCmd) {
                    this.editor.setText("");
                    const _extCtx = _extRunner.createCommandContext?.() ?? this.session;
                    await _modelCmd.handler(text.startsWith("/model ") ? text.slice(7).trim() : "", _extCtx);
                    return;
                }
            }
            ${D51_SIGNATURE}`;

function locatePackage() {
  const override = process.env.PI_CODE_AGENT_DIR;
  if (override && fs.existsSync(override)) return override;
  const candidates = [];
  if (process.env.APPDATA)
    candidates.push(path.join(process.env.APPDATA, "npm", "node_modules", "@earendil-works", "pi-coding-agent"));
  try {
    const npmRoot = execFileSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["root", "-g"],
      { encoding: "utf-8", shell: process.platform === "win32" },
    ).trim();
    candidates.push(path.join(npmRoot, "@earendil-works", "pi-coding-agent"));
  } catch {
    // fall through to candidate list
  }
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "package.json"))) return c;
  }
  console.error("REFUSED: could not locate @earendil-works/pi-coding-agent (set PI_CODE_AGENT_DIR).");
  process.exit(1);
}

const pkgDir = locatePackage();
const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8"));
const targets = {
  d44: {
    file: path.join(pkgDir, "dist", "core", "agent-session.js"),
    signature: D44_SIGNATURE,
    patched: D44_PATCHED,
    marker: D44_MARKER,
    backup: path.join(pkgDir, "dist", "core", "agent-session.js") + ".pi-bridge-orig",
  },
  d51: {
    file: path.join(pkgDir, "dist", "modes", "interactive", "interactive-mode.js"),
    signature: D51_SIGNATURE,
    patched: D51_PATCHED,
    marker: D51_MARKER,
    backup: path.join(pkgDir, "dist", "modes", "interactive", "interactive-mode.js") + ".pi-bridge-orig",
  },
};

function readTarget(t) {
  return fs.readFileSync(t.file, "utf-8");
}

function sha(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function status() {
  console.log(`pi-coding-agent : ${pkgJson.version} @ ${pkgDir}`);
  for (const [name, t] of Object.entries(targets)) {
    const src = readTarget(t);
    const applied = src.includes(t.patched);
    const backupOk = fs.existsSync(t.backup);
    console.log(`  ${name.padEnd(6)} : ${applied ? "APPLIED" : "not applied"}  backup: ${backupOk ? "yes" : "no"}`);
  }
}

function apply() {
  if (!SUPPORTED_PREFIXES.some((p) => pkgJson.version.startsWith(p))) {
    console.error(`REFUSED: pi-coding-agent ${pkgJson.version} is outside the supported range (${SUPPORTED_PREFIXES.join(", ")}…).`);
    process.exit(1);
  }
  let changed = false;
  for (const [name, t] of Object.entries(targets)) {
    let src = readTarget(t);
    // Validate structure first.
    if (!src.includes(t.signature) && !src.includes(t.patched)) {
      console.error(`REFUSED: ${name} expected host structure not found in ${path.basename(t.file)}.`);
      process.exit(1);
    }
    // D63 migration: replace the legacy unguarded D51 blob before applying.
    if (name === "d51" && src.includes(D51_LEGACY_PATCHED) && !src.includes(D51_PATCHED)) {
      src = src.replace(D51_LEGACY_PATCHED, t.signature);
      fs.writeFileSync(t.file, src, "utf-8");
      console.log(`${name}: legacy unguarded blob migrated.`);
      changed = true;
    }
    if (src.includes(t.patched)) {
      console.log(`${name}: already applied.`);
      continue;
    }
    if (!fs.existsSync(t.backup)) fs.writeFileSync(t.backup, src, "utf-8");
    src = src.replace(t.signature, t.patched);
    fs.writeFileSync(t.file, src, "utf-8");
    console.log(`${name}: applied.`);
    changed = true;
  }
  if (!changed) console.log("Nothing to do.");
  status();
}

function restore() {
  let restored = false;
  for (const t of Object.values(targets)) {
    if (fs.existsSync(t.backup)) {
      fs.writeFileSync(t.file, fs.readFileSync(t.backup, "utf-8"));
      console.log(`Restored: ${path.basename(t.file)}`);
      restored = true;
    }
  }
  if (!restored) console.log("No backups found — nothing to restore.");
  status();
}

function verify() {
  const supported = SUPPORTED_PREFIXES.some((p) => pkgJson.version.startsWith(p));
  let ok = supported;
  for (const [name, t] of Object.entries(targets)) {
    const src = readTarget(t);
    const structural = src.includes(t.signature) || src.includes(t.patched);
    console.log(`${name.padEnd(6)} : ${structural ? "recognized" : "UNRECOGNIZED"}`);
    if (!structural) ok = false;
  }
  console.log(`version    : ${pkgJson.version} ${supported ? "(supported)" : "(UNSUPPORTED)"}`);
  if (!ok) process.exit(1);
}

const cmd = process.argv[2] ?? "status";
if (cmd === "status") status();
else if (cmd === "verify") verify();
else if (cmd === "apply") apply();
else if (cmd === "restore") restore();
else {
  console.error("Unknown command. Use: status | verify | apply | restore");
  process.exit(1);
}
