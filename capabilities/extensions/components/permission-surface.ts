import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/**
 * Permission Decision Surface — presentation only, no policy.
 * Replaces stock PermissionPromptComponent in the editor slot (overlay:false).
 * One outer frame, D65 visual language, width-safe, exactly-once.
 */

export interface PermissionSurfaceDetails {
  requestId: string;
  toolName?: string;
  path?: string;
  command?: string;
  target?: string;
  surface?: string | null;
  value?: string | null;
  toolInputPreview?: string;
  message: string;
  sessionLabel?: string;
  agentName: string | null;
  forwarding?: { requesterAgentName: string | null; requesterSessionId: string | null } | null;
  sessionApproval?: { patterns: string[]; surface: string } | null;
  accessIntent?: { surface: string; path?: string; value?: string } | null;
  cwd?: string;
  policyReason?: string;
}

export type PermissionSurfaceVerdict =
  | { kind: "allow" }
  | { kind: "deny"; reason?: string }
  | { kind: "defer" };

export interface PermissionSurfaceOptions {
  doublePressToConfirm?: boolean;
}

type Step = "decision" | "reason" | "detail";
type ControlKey = "y" | "s" | "n" | "r";

const CONTROLS: Array<{ key: ControlKey; label: string; hint: string }> = [
  { key: "y", label: "Allow", hint: "[Y] Allow" },
  { key: "s", label: "Session", hint: "[S] Session · policy" },
  { key: "n", label: "Deny", hint: "[N] Deny" },
  { key: "r", label: "Reason", hint: "[R] Reason" },
];

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export function humanSummary(details: PermissionSurfaceDetails): string {
  if (details.message && details.message.length > 0) return details.message;
  if (details.toolName) return `${details.toolName} access`;
  if (details.surface) return `${details.surface} access`;
  return "Permission Required";
}

export function scopeTarget(details: PermissionSurfaceDetails): string | null {
  if (details.path) return details.path;
  if (details.target) return details.target;
  if (details.value) return details.value;
  if (details.accessIntent?.path) return details.accessIntent.path;
  if (details.accessIntent?.value) return details.accessIntent.value;
  return null;
}

export function commandPreview(details: PermissionSurfaceDetails): string | null {
  if (details.command) return details.command;
  if (details.toolInputPreview) return details.toolInputPreview;
  return null;
}

export function policyLine(details: PermissionSurfaceDetails): string | null {
  const parts: string[] = [];
  if (details.accessIntent?.surface) parts.push(details.accessIntent.surface);
  if (details.policyReason) parts.push(details.policyReason);
  if (details.sessionApproval) parts.push("session grant available");
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export class PermissionDecisionSurface {
  private step: Step = "decision";
  private focusedIdx = 0;
  private reasonDraft = "";
  private resolved = false;
  private armedKey: ControlKey | null = null;
  private armedTimer: ReturnType<typeof setTimeout> | null = null;
  private detailScroll = 0;

  constructor(
    private readonly details: PermissionSurfaceDetails,
    private readonly theme: Theme,
    private readonly onDecision: (v: PermissionSurfaceVerdict) => void,
    private readonly opts: PermissionSurfaceOptions = {},
  ) {}

  getStep(): Step {
    return this.step;
  }
  getFocusedKey(): ControlKey {
    return CONTROLS[this.focusedIdx]?.key ?? "y";
  }
  getReasonDraft(): string {
    return this.reasonDraft;
  }
  isResolved(): boolean {
    return this.resolved;
  }

  private resolveOnce(v: PermissionSurfaceVerdict): void {
    if (this.resolved) return;
    this.resolved = true;
    clearTimeout(this.armedTimer as unknown as number);
    this.onDecision(v);
  }

  private armOrExecute(key: ControlKey, execute: () => void): void {
    if (!this.opts.doublePressToConfirm) {
      execute();
      return;
    }
    if (this.armedKey === key) {
      clearTimeout(this.armedTimer as unknown as number);
      this.armedKey = null;
      execute();
    } else {
      this.armedKey = key;
      clearTimeout(this.armedTimer as unknown as number);
      this.armedTimer = setTimeout(() => {
        this.armedKey = null;
      }, 800);
    }
  }

  private handleDecisionKey(key: ControlKey): void {
    if (this.step !== "decision") return;
    const action = () => {
      switch (key) {
        case "y":
          this.resolveOnce({ kind: "allow" });
          break;
        case "s":
          this.resolveOnce({ kind: "defer" });
          break;
        case "n":
          this.resolveOnce({ kind: "deny" });
          break;
        case "r":
          this.step = "reason";
          this.reasonDraft = "";
          break;
      }
    };
    this.armOrExecute(key, action);
  }

  handleInput(data: string): void {
    if (this.resolved) return;
    if (data === "\x03") {
      this.resolveOnce({ kind: "deny", reason: "cancelled" });
      return;
    }
    if (this.step === "reason") {
      if (data === "\x1b") {
        this.step = "decision";
        this.reasonDraft = "";
        return;
      }
      if (data === "\r" || data === "\n") {
        const reason = this.reasonDraft.trim() || "denied";
        this.resolveOnce({ kind: "deny", reason });
        return;
      }
      if (data === "\x7f" || data === "\b" || data === "\x1b[3~") {
        this.reasonDraft = this.reasonDraft.slice(0, -1);
        return;
      }
      if (data.length === 1 && data >= " " && data <= "~" && !data.startsWith("\x1b")) {
        this.reasonDraft += data;
        return;
      }
      return;
    }
    if (this.step === "detail") {
      if (data === "\x1b" || data === "\x1b[D" || data === "\x1b[C") {
        this.step = "decision";
        this.detailScroll = 0;
        return;
      }
      if (data === "\x1b[A") {
        this.detailScroll = Math.max(0, this.detailScroll - 1);
        return;
      }
      if (data === "\x1b[B") {
        this.detailScroll += 1;
        return;
      }
      return;
    }
    if (data === "\x1b") {
      this.resolveOnce({ kind: "deny", reason: "cancelled" });
      return;
    }
    if (data === "\x1b[D") {
      this.focusedIdx = (this.focusedIdx - 1 + CONTROLS.length) % CONTROLS.length;
      this.armedKey = null;
      clearTimeout(this.armedTimer as unknown as number);
      return;
    }
    if (data === "\x1b[C") {
      this.focusedIdx = (this.focusedIdx + 1) % CONTROLS.length;
      this.armedKey = null;
      clearTimeout(this.armedTimer as unknown as number);
      return;
    }
    if (data === "\r" || data === "\n") {
      const focused = CONTROLS[this.focusedIdx];
      if (focused) this.handleDecisionKey(focused.key);
      return;
    }
    if (data === "d" || data === "D") {
      if (commandPreview(this.details)) {
        this.step = "detail";
        this.detailScroll = 0;
      }
      return;
    }
    const lower = data.toLowerCase();
    if (lower === "y" || lower === "s" || lower === "n" || lower === "r") {
      const idx = CONTROLS.findIndex((c) => c.key === lower);
      if (idx >= 0) this.focusedIdx = idx;
      this.handleDecisionKey(lower as ControlKey);
      return;
    }
  }

  render(width: number): string[] {
    if (this.step === "reason") return this.renderReason(width);
    if (this.step === "detail") return this.renderDetail(width);
    return this.renderDecision(width);
  }

  private frameTop(width: number, title: string): string {
    const border = (t: string) => this.theme.fg("text", t);
    const titleText = this.theme.fg("text", this.theme.bold(title));
    const left = border("╭─ ") + titleText + border(" ");
    const tail = border("──╮");
    const fillLen = Math.max(0, width - visibleWidth(left) - visibleWidth(tail) - 1);
    const fill = border("─".repeat(fillLen));
    const line = `${left} ${fill}${tail}`;
    return visibleWidth(line) <= width ? line : truncateToWidth(line, width, "");
  }

  private frameBottom(width: number): string {
    const border = (t: string) => this.theme.fg("text", t);
    const line = border("╰" + "─".repeat(Math.max(0, width - 2)) + "╯");
    return visibleWidth(line) <= width ? line : truncateToWidth(line, width, "");
  }

  private frameRow(width: number, content: string): string {
    const border = (t: string) => this.theme.fg("text", t);
    const left = border("│ ");
    const right = border(" │");
    const interiorW = Math.max(0, width - visibleWidth(left) - visibleWidth(right));
    const fitted = visibleWidth(content) <= interiorW ? content : truncateToWidth(content, interiorW, "…");
    const pad = " ".repeat(Math.max(0, interiorW - visibleWidth(fitted)));
    const line = `${left}${fitted}${pad}${right}`;
    return visibleWidth(line) <= width ? line : truncateToWidth(line, width, "");
  }

  private emptyRow(width: number): string {
    return this.frameRow(width, "");
  }

  private renderDecision(width: number): string[] {
    const out: string[] = [];
    const subBadge = this.details.forwarding ? ` · (Subagent: ${this.details.forwarding.requesterAgentName ?? this.details.agentName ?? "subagent"})` : "";
    const title = `Permission Required${subBadge}`;
    out.push(this.frameTop(width, title));
    out.push(this.emptyRow(width));
    const summary = humanSummary(this.details);
    const summaryStyled = this.theme.fg("text", this.theme.bold(truncateToWidth(summary, Math.max(0, width - 6), "…")));
    const summaryLines = this.wrapText(summaryStyled, Math.max(0, width - 4));
    for (const l of summaryLines) out.push(this.frameRow(width, `  ${l}`));
    const target = scopeTarget(this.details);
    if (target) {
      const targetStyled = this.theme.fg("text", truncateToWidth(target, Math.max(0, width - 6), "…"));
      const targetLines = this.wrapText(targetStyled, Math.max(0, width - 6));
      for (const l of targetLines) out.push(this.frameRow(width, `  ${l}`));
    }
    out.push(this.emptyRow(width));
    const cmd = commandPreview(this.details);
    if (cmd) {
      const label = this.theme.fg("dim", "Command  ");
      const preview = truncateToWidth(cmd, Math.max(0, width - 14), "…");
      const cmdLine = `${label}${this.theme.fg("text", preview)}`;
      const hint = visibleWidth(cmd) > Math.max(0, width - 14) ? this.theme.fg("dim", "  (d for details)") : "";
      const combined = `${cmdLine}${hint}`;
      const cmdLines = this.wrapText(combined, Math.max(0, width - 4));
      for (const l of cmdLines) out.push(this.frameRow(width, `  ${l}`));
    } else if (this.details.toolName) {
      const toolLine = `${this.theme.fg("dim", "Tool     ")}${this.theme.fg("text", this.details.toolName)}`;
      out.push(this.frameRow(width, `  ${toolLine}`));
    }
    const pol = policyLine(this.details);
    if (pol && width >= 40) {
      const polStyled = this.theme.fg("dim", `Policy   ${truncateToWidth(pol, Math.max(0, width - 14), "…")}`);
      out.push(this.frameRow(width, `  ${polStyled}`));
    }
    out.push(this.emptyRow(width));
    const controlsLine = this.renderControls(width);
    out.push(this.frameRow(width, controlsLine));
    if (this.armedKey) {
      const hint = this.theme.fg("warning", `Press ${this.armedKey.toUpperCase()} again to confirm`);
      out.push(this.frameRow(width, `  ${hint}`));
    }
    out.push(this.frameBottom(width));
    return out.map((l) => (visibleWidth(l) <= width ? l : truncateToWidth(l, width, "")));
  }

  private renderControls(width: number): string {
    const parts: string[] = [];
    for (let i = 0; i < CONTROLS.length; i++) {
      const c = CONTROLS[i]!;
      const isFocused = i === this.focusedIdx;
      const isArmed = this.armedKey === c.key;
      let label = c.hint;
      if (isArmed) {
        label = this.theme.bg("selectedBg", this.theme.fg("warning", `› ${label} ‹`));
      } else if (isFocused) {
        label = this.theme.bg("selectedBg", this.theme.fg("text", `› ${label}`));
      } else {
        label = this.theme.fg("dim", `  ${label}`);
      }
      parts.push(label);
    }
    const interiorW = Math.max(0, width - 4);
    let combined = parts.join(this.theme.fg("dim", "   "));
    if (visibleWidth(stripAnsi(combined)) > interiorW) {
      combined = truncateToWidth(combined, interiorW, "…");
    }
    return combined;
  }

  private renderDetail(width: number): string[] {
    const out: string[] = [];
    out.push(this.frameTop(width, "Command Detail"));
    out.push(this.emptyRow(width));
    const cmd = commandPreview(this.details) ?? "(no command)";
    const cmdLines = this.wrapText(this.theme.fg("text", cmd), Math.max(0, width - 6));
    for (const l of cmdLines) out.push(this.frameRow(width, `  ${l}`));
    out.push(this.emptyRow(width));
    if (this.details.cwd) {
      out.push(this.frameRow(width, `  ${this.theme.fg("dim", "CWD      ")}${this.theme.fg("text", truncateToWidth(this.details.cwd, Math.max(0, width - 14), "…"))}`));
    }
    if (this.details.policyReason) {
      out.push(this.frameRow(width, `  ${this.theme.fg("dim", "Reason   ")}${this.theme.fg("text", truncateToWidth(this.details.policyReason, Math.max(0, width - 14), "…"))}`));
    }
    if (this.details.path) {
      out.push(this.frameRow(width, `  ${this.theme.fg("dim", "Path     ")}${this.theme.fg("text", truncateToWidth(this.details.path, Math.max(0, width - 14), "…"))}`));
    }
    if (this.details.target) {
      out.push(this.frameRow(width, `  ${this.theme.fg("dim", "Target   ")}${this.theme.fg("text", truncateToWidth(this.details.target, Math.max(0, width - 14), "…"))}`));
    }
    out.push(this.emptyRow(width));
    out.push(this.frameRow(width, `  ${this.theme.fg("dim", "Esc to return")}`));
    out.push(this.frameBottom(width));
    return out.map((l) => (visibleWidth(l) <= width ? l : truncateToWidth(l, width, "")));
  }

  private renderReason(width: number): string[] {
    const out: string[] = [];
    out.push(this.frameTop(width, "Deny — Provide Reason"));
    out.push(this.emptyRow(width));
    out.push(this.frameRow(width, `  ${this.theme.fg("dim", "Enter reason, Enter to submit, Esc to cancel")}`));
    out.push(this.emptyRow(width));
    const prompt = this.theme.fg("text", "Reason: ");
    const draftStyled = this.theme.fg("text", this.reasonDraft) + this.theme.bg("selectedBg", " ");
    const line = `${prompt}${draftStyled}`;
    const interiorW = Math.max(0, width - 6);
    const fitted = visibleWidth(line) <= interiorW ? line : truncateToWidth(line, interiorW, "…");
    out.push(this.frameRow(width, `  ${fitted}`));
    out.push(this.emptyRow(width));
    out.push(this.frameBottom(width));
    return out.map((l) => (visibleWidth(l) <= width ? l : truncateToWidth(l, width, "")));
  }

  private wrapText(text: string, maxW: number): string[] {
    if (maxW <= 0) return [""];
    if (visibleWidth(text) <= maxW) return [text];
    return [truncateToWidth(text, maxW, "…")];
  }

  invalidate(): void {}
}
