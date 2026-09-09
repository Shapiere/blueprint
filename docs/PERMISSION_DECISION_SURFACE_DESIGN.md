# Permission Decision Surface — Design Decision + Implementation Plan
<!-- docs/PERMISSION_DECISION_SURFACE_DESIGN.md — self-referenced for verify.py orphan check -->

**Status:** DESIGN ONLY — approved before coding. No source, config, deploy, host patch, or 9router change in this task.  
**Project:** Harness Pi Blueprint — Continuous Evolution post-D65  
**Repo:** `G:\pisetup` — RAL `capabilities/extensions/runtime-orchestrator.ts`  
**Stack:** Pi host 0.83.0 + `@gotgenes/pi-permission-system@24.0.0`  
**Date:** 2026-09-07

---

## 1. Authoritative Audit Findings

- Host 0.83.0 has no native permission policy; public seams: `getPermissionsService()`, `registerAuthorizer(name, authorize)` + `authorizerChain`.
- `authorize(PromptPermissionDetails, PermissionQuery)` can replace stock `LocalUserAuthorizer` prompt rendered via `ctx.ui.custom(...,{overlay:false})` in editor slot. No host patch.
- Policy engine owned solely by `pi-permission-system` (`PermissionManager` / `GateRunner` / `applyPermissionGate` / `AuthorizerSelection` / `SessionRules` / `yolo` / delegation envelope). `runtime-orchestrator.ts` never owns policy.
- Gate runs **after** host `ToolExecutionComponent` has already rendered pending tool card → **two surfaces** cause clutter: `ToolExecutionComponent` + stock `PermissionPromptComponent`. Activity + `RuntimeContextField` remain visible; stock prompt replaces `PiInputEditor`.
- Verdicts: `allow | deny | defer` only. **No** `approved_for_session`. Real `SessionRules` / session-grant state exists — custom authorizer cannot safely synthesize `S` with current vocabulary.
- Fail-closed, headless/no-authority must not silently allow, async exactly-once per session.
- Authoritative payload fields: `requestId, toolName, toolCallId, command, path, target, surface, value, accessIntent, policyResult/matchedPattern, policyReason, origin, cwd, agentName, forwarding, sessionApproval, sessionLabel`. Raw `args` not fully exposed — only sanitized `command` preview.
- `risk` not authoritative native field.
- D65 surface is `Activity → Runtime Context Field → Input`; permission must not become permanent fourth panel.

---

## 2. Owner UX Problem

Stock permission looks like generic CLI dump:

```
huge command
Permission Required
(y) Yes  (s) Session  (n) No  (r) Reason
```

Feels noisy, not intentional. Owner wants clean/compact/trustworthy/interruptive/D65-consistent, without hiding security-relevant data.

---

## 3. Primary Design Principle

Permission is **high-importance decision**. Hierarchy:

**Decision → Scope/target → Action/command → optional policy context → controls**

Not `giant command → explanation → choices`.

---

## 4. Proposed Surface

Single terminal-native `ctx.ui.custom({overlay:false})` panel **replaces stock `PermissionPromptComponent` in editor slot**:

```
ACTIVITY
RUNTIME CONTEXT FIELD (`╭── model·●Level·★Profile │ 📁 ws │ usage ──╮`)
PERMISSION DECISION SURFACE  ← replaces PiInputEditor while active
```

On resolve → surface unmounts → `PiInputEditor` + saved `getText()` returns.

**Conceptual IA (refined, not blind copy):**

```
╭─ Permission Required ──────────────────────────╮
│  External directory access · (Subagent: review)│
│  G:\pi-report                                  │
│                                                │
│  Command  cd G:\… && node -e "…"               │
│  Policy   matched `externalDir:ask` · yolo off │
│                                                │
│  [Y] Allow  [S] Session  [N] Deny  [R] Reason  │
╰────────────────────────────────────────────────╯
```

Top rule carries `Permission Required` (bright `text` bold). Interior tint `customMessageBg` like D65, frame `text` coherent (`╭─╮`/`│`/`╰─╯` all `outerWidth`), one warning accent on title only, intentional whitespace, no dashboard.

---

## 5. Command Presentation

**Display projection ≠ authoritative data.** `command` is sanitized preview; `path/target/surface/value/accessIntent` authoritative. Never invent `args`.

- One-line compact preview: `truncateToWidth(command, interior-labelW, "…")` via `visibleWidth`; label per `toolName` (`Command`/`Path`/`Access`).
- `path|target` on its own bold `text` line before command.
- Full detail via expandable secondary `ctx.ui.custom` detail view (`Enter` on command row → shows full `command` + `cwd` + `policyReason` wrapped, `Esc` back) — no new API.
- Width-aware: interior `= outer-4`; priority `decision > target > tool/action > command preview > policy metadata` (policy line dropped first at narrow).

---

## 6. Decision Controls & `S` Semantics (v1 safe)

Stock semantics preserved: `Y=allow once, S=session, N=deny, R=deny+reason`.

Because `approved_for_session` not in authorizer vocabulary:

* **v1 `Y` → `allow`, `S` → `defer`** (not `allow`). Stock `pi-permission-system` then presents its native session-grant confirmation via `SessionRules`. UI shows `Session (policy)` dim annotation on `S` chip to set expectation. This is **not** double-approval — first is Harness decision, second is policy session confirmation.
* If double-prompt confusion measured, fallback v1.1: disable `S` chip with tooltip `Session grant managed by policy — use stock UI` and keep `Y/N/R` only.
* `R` → inline mini-`Editor` for reason → `deny` with reason string.
* **Never hack `SessionRules` or mutate internal state.**

---

## 7. Keyboard Interaction

**Direct hotkeys (primary) + focused row (discoverability):**

- `y/Y` → allow, `s/S` → session(defer), `n/N` → deny, `r/R` → reason, `Esc`/`Ctrl+C` → **deny** (`reason="cancelled"`, fail-closed, never `defer`).
- Row of 4 chips `[Y] Allow` … with single `›` focus (D54). `←→` moves focus, `Enter` activates. Hotkeys work regardless of focus.
- `doublePressToConfirm` respected (read from `PermissionManager.config`) — second press within 800ms required, shows `Press Y again` warning.
- Focus capture: `handleInput` consumes all, no leak to editor, exactly one `ctx.ui.custom` surface.

Hybrid gives expert speed + discoverability.

---

## 8. D65 Visual Integration

* `ACTIVITY → CONTEXT → PERMISSION` — permission replaces `PiInputEditor` via same `setEditorComponent`/`setWidget` boundary. No fourth panel, Activity not moved, Context not merged, footer stays `MinimalFooter`.
* Visual language: bright coherent `text` frame, restrained semantic color, strong hierarchy, no rainbow, feels like temporary decision state of same product.

---

## 9. Tool Card Problem

Host `ToolExecutionComponent` rendered **before** gate — no public API to compact/suppress without host patch.

**Decision: Option A for v1 — remain unchanged.** Permission surface's compact preview reduces perceived noise without mutating host. Future separate track can propose host `ToolExecutionComponent` compact mode via public styling if needed — not blocking v1.

---

## 10. Policy / Presentation Separation

Surface **only** routes `allow/deny/defer (+reason)`; never re-evaluates `policyResult`, never bypasses `GateRunner`/`fail-closed`/`yolo`/`delegationEnvelope`, never writes `SessionRules`, never invents authority.

---

## 11. Subagent Requests

`agentName` + `forwarding` → badge `· (Subagent: ${agentName})` on title line (`accent` dim), 1 line. `origin`/`cwd` in detail expand, not extra panel. Clearly distinct without vertical bloat.

---

## 12. Permission Data Display (authoritative only)

- Identity: `toolName` + `command` preview
- Action: `toolName` + `surface` label
- Path/target: `path || target` (bold `text`)
- Policy: `policyResult`/`matchedPattern` + `policyReason` (dim, 1 line)
- Agent: `agentName`/`forwarding` badge
- Session: `sessionApproval`/`sessionLabel` hint (dim)
- Cwd/origin: `cwd`/`origin` in detail only
- **Risk:** not native — v1 **no** risk badge. Optional derived `low/high` from `toolName+surface` (labeled `derived`, dim) can be added later, not authoritative.

---

## 13. Width Safety

`outer = availableWidth` from `render(w)`. All rows `visibleWidth==outer` via `border("╭"+"─".repeat(outer-2)+"╮")` / `border("│ "+content+" │")` / `border("╰"+"─".repeat(outer-2)+"╯")`. `truncateToWidth`/`visibleWidth` for ANSI/emoji. Responsive drop order as §5. No `.length`.

Narrow → policy line dropped first, then command truncated, then target truncated with `…`. Never a vertical wall.

---

## 14. Architectural Boundary (smallest clean)

* **Location:** new `capabilities/extensions/components/permission-surface.ts` — pure `PermissionDecisionSurface implements Component { render(w), handleInput }` — not bloating `runtime-orchestrator.ts`.
* **Wiring in `runtime-orchestrator.ts` (permissions:ready):**
  ```ts
  const svc = getPermissionsService();
  svc.registerAuthorizer("harness-decision-surface", async (details: PromptPermissionDetails, query: PermissionQuery) => {
    if (!query.hasAuthority) return { verdict: "deny" }; // fail-closed headless
    return new Promise<AuthorizerResult>(resolve => {
      ctx.ui.custom((tui, theme, _, done) => {
        const surf = new PermissionDecisionSurface(details, query, theme, (verdict, reason) => {
          done(null);
          if (verdict === "allow") resolve({ verdict: "allow" });
          else if (verdict === "deny") resolve({ verdict: "deny", reason });
          else resolve({ verdict: "defer" });
        });
        return { render: w => surf.render(w), handleInput: d => { surf.handleInput(d); tui.requestRender(); } };
      }, { overlay: false });
    });
  });
  // activation: settings.json { "permissions": { "authorizerChain": ["harness-decision-surface","localUserAuthorizer"] } }
  ```
* **Exactly-once:** `done` once → Promise once → `overlay:false` guarantees single editor slot.
* No framework, only `pi-tui` `visibleWidth`/`truncateToWidth`.

---

## 15. Reversibility

Stock `LocalUserAuthorizer` remains second chain entry. Disable via:

* `settings.json` → `"authorizerChain": ["localUserAuthorizer"]`, or
* `PI_DISABLE_HARNESS_PERMISSION_SURFACE=1` env guard (skip `registerAuthorizer`), or
* code guard

No host mutation; policy engine untouched.

---

## 16. Decision Record

### Proposed Decision
Replace stock `PermissionPromptComponent` with Harness `PermissionDecisionSurface` authorizer `harness-decision-surface` via `ctx.ui.custom({overlay:false})` in editor slot, with `pi-permission-system@v24` as sole policy authority.

### Scope
New `permission-surface.ts` component + wiring in `runtime-orchestrator.ts` to `getPermissionsService().registerAuthorizer` + `authorizerChain` config. Handles `Y/S/N/R/Esc`, `doublePressToConfirm`, focus capture, D45 width-safe, subagent badge, compact `command` preview with expand detail.

### Explicitly Out of Scope
Policy re-evaluation, `SessionRules` mutation, host `ToolExecutionComponent` compaction, `9router`/`/model`/reasoning/D57/D44/D51/D63, host patch, raw `args`, authoritative risk, permanent panel.

### User Experience
`ACTIVITY → CONTEXT → PERMISSION` interrupt: `Decision → Scope → Command (compact, expandable) → Policy (dim, 1 line) → [Y Allow | S Session(policy) | N Deny | R Reason]` — hotkeys + `›` row, `Esc` deny, one surface, `S` defers to stock session-grant.

### State Mapping
`Y→allow, S→defer→stock SessionRules, N→deny, R→deny+reason, Esc/CtrlC→deny, headless/noAuthority→deny, doublePress→2×Y/S`

### Architecture
`permissions:ready → getPermissionsService() → registerAuthorizer("harness-decision-surface", authorize(details, query)) → ctx.ui.custom` → `AuthorizerResult {verdict: allow|deny|defer}` → `GateRunner` → `SessionRules` unchanged.

### Fallback
`defer` on `S`/uncertain → stock `LocalUserAuthorizer`; `!hasAuthority` → `deny` fail-closed.

### Width Behavior
`outer = availableWidth`; `top==content==bottom==outer`; interior `outer-4`; `decision > target > tool > command > policy` drop; `visibleWidth`/`truncateToWidth`.

### Safety
No bypass, no re-evaluation, no authority invention, no `SessionRules` edit, `allow/deny/defer` only, fail-closed, delegation preserved.

### Reversibility
Remove `harness-decision-surface` from `authorizerChain` or set env guard → stock prompt returns.

### Risks
* `S→defer` double-prompt confusion — mitigated by dim `(policy)` label, fallback to disabled `S` if measured.
* `command` truncated at narrow — mitigated by expand detail.
* `ToolExecutionComponent` still tall above surface (v1 accepted).
* Subagent badge missed — mitigated by `● Subagent` accent.

### Validation Plan
*Unit:* render at `12..400` `visibleWidth==outer`, `╮`/`│`/`╯` same column, `Y/S/N/R/Esc` hotkeys, `doublePress`, single `›`, subagent badge, `S→defer` not `allow`, `headless→deny`, command truncation.
*Integration:* mock `getPermissionsService` + `registerAuthorizer` + `ctx.ui.custom` → verdicts, `SessionRules` unchanged, exactly-once, `overlay:false` replaces editor, saved input restored.
*Live TUI:* `bash rm -rf` (deny), `read G:\pi-report` (externalDir `Y` vs `S→stock`), subagent forwarded, `Esc` deny, narrow 40col, wide 160col, long `node -e` wrapping, `yolo` passthrough.

---

## 17. Implementation Plan (next step after approval)

1. Create `capabilities/extensions/components/permission-surface.ts` (pure component, no policy, `visibleWidth`/`truncateToWidth`, `Theme` `text`/`dim`/`warning`/`customMessageBg`).
2. Wire `getPermissionsService().registerAuthorizer` in `runtime-orchestrator.ts` behind `permissions:ready` + `hasUI` guard, with `PI_DISABLE_...` env.
3. Add `settings.json` `authorizerChain` documentation (not committed) + `docs/SETUP.md` note.
4. Add regression tests in `capabilities/extensions/tests/d42.test.ts`: render widths, `S→defer`, `headless→deny`, `Esc→deny`, single `›`, no `SessionRules` mutation.
5. Live TUI matrix: `y/n/s/r/esc`, subagent, narrow, long command, `doublePress`, `yolo`.
6. No host patch, no 9router change, verify `verify.py` + `tsc` + `97→~105` checks, deployed parity, then `CHANGELOG.md` + `capabilities/index.md` (capture loop).

