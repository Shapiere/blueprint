#!/usr/bin/env node
/**
 * pi-model-bridge — D44 compatibility bridge for the unified /model flow.
 *
 * Pi (verified 0.83.0–0.84.x) skips the extension `model_select` event when the
 * selected model equals the current one (`_emitModelSelect` early-return), which
 * makes re-confirming the current model a dead end for Harness Pi's control
 * center. This script applies/removes a minimal, structure-checked patch that
 * emits the SAME event with `sameModel: true` in that case. Nothing else changes.
 *
 * Usage:
 *   node pi-model-bridge.mjs status
 *   node pi-model-bridge.mjs apply
 *   node pi-model-bridge.mjs restore
 *
 * Safety:
 * - Version guard: only 0.83.* / 0.84.* with the exact expected source
 *   structure are patched; anything else refuses loudly.
 * - Idempotent: applying twice is a no-op.
 * - Reversible: `restore` returns the pristine file from the kept backup.
 * - Survives `pi update`: update replaces dist → run `apply` again; doctor
 *   reports bridge state either way.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SUPPORTED_PREFIXES = ["0.83.", "0.84."];
const MARKER = "sameModel: true";
const SIGNATURE = "if (modelsAreEqual(previousModel, nextModel))\n            return;";
const PATCHED = `if (modelsAreEqual(previousModel, nextModel)) {
            await this._extensionRunner.emit({ type: "model_select", model: nextModel, previousModel, source, ${MARKER} });
            return;
        }`;

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
const target = path.join(pkgDir, "dist", "core", "agent-session.js");
const backup = target + ".pi-bridge-orig";

function readTarget() {
  return fs.readFileSync(target, "utf-8");
}

function sha(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function status() {
  const src = readTarget();
  const applied = src.includes(MARKER);
  console.log(`pi-coding-agent : ${pkgJson.version} @ ${pkgDir}`);
  console.log(`bridge          : ${applied ? "APPLIED" : "not applied"}`);
  console.log(`backup          : ${fs.existsSync(backup) ? sha(fs.readFileSync(backup, "utf-8")) : "(none)"}`);
  console.log(`target sha      : ${sha(src)}`);
}

function apply() {
  if (!SUPPORTED_PREFIXES.some((p) => pkgJson.version.startsWith(p))) {
    console.error(`REFUSED: pi-coding-agent ${pkgJson.version} is outside the supported range (${SUPPORTED_PREFIXES.join(", ")}…).`);
    process.exit(1);
  }
  let src = readTarget();
  if (src.includes(MARKER)) {
    console.log("Already applied — nothing to do.");
    return;
  }
  if (!src.includes(SIGNATURE)) {
    console.error("REFUSED: expected host structure not found (_emitModelSelect early-return signature changed).");
    process.exit(1);
  }
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, "utf-8");
  src = src.replace(SIGNATURE, PATCHED);
  fs.writeFileSync(target, src, "utf-8");
  console.log(`Applied. Backup: ${backup}`);
  status();
}

function restore() {
  if (!fs.existsSync(backup)) {
    console.error("No backup found — nothing to restore.");
    process.exit(1);
  }
  fs.writeFileSync(target, fs.readFileSync(backup, "utf-8"));
  console.log("Restored pristine host file from backup.");
  status();
}

const cmd = process.argv[2] ?? "status";
if (cmd === "status") status();
else if (cmd === "apply") apply();
else if (cmd === "restore") restore();
else {
  console.error("Unknown command. Use: status | apply | restore");
  process.exit(1);
}
