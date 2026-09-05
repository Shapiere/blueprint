# Next Session

## Purpose

Handoff: what the next session must do first. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); this file owns the ordered action list only.

## First Actions (in order)

1. **Verify repository state.** Run `python capabilities/scripts/verify.py`; confirm remote matches local `main`.
2. **Operate in Continuous Evolution.** Adopt capabilities only via lifecycle triggers; verify.py before every commit; keep the capture loop.
3. **D42 Phase 1 shipped (2026-08-25).** `/model` post-selection flow = unified control center; visibility trust state live; boot-default restoration on; reasoning v3. Do not reintroduce getAll()-based surfaces or `/mcc`.
4. **D45 (2026-08-25):** `/model` is responsive — any new TUI row must respect `renderedWidth <= availableWidth` (dynamic columns + final clamp); run the overflow regression tests at widths 8–400 after UI changes.
5. **D46 (2026-08-25):** `/model` visuals refined — table rows, MODEL/REASONING blocks, width-aware chrome. Layout work must keep the abutment regression and overflow suites green.
6. **D47 (2026-08-25):** `/model` is a navigation + detail surface (NavDetailPane). Any UI work must keep NAV+DETAIL + overflow + abutment suites green.
7. **D48 (2026-08-25):** `/model` is scope/navigation-based — PROVIDERS nav, two-pane scoped browser, scope titles, truthful counts. New scope tests must stay green alongside NAV+DETAIL/overflow/abutment.
8. **D51 (2026-08-25):** `/model` opens the control surface directly (host bridge intercepts dispatch). After `pi update`, re-run the bridge script.
8. **D57 (2026-09-01):** 9router startup is MANUAL — Pi never spawns the router. Router healthy at boot → one catalog refresh + default restore; router down → "offline" status + "start 9router manually" notice, no retries/polling; user starts it mid-session → next `/model` open one-shot refreshes (gate: empty snapshot + health ok, once per open). Do NOT reintroduce autoStart. Offline rows say "not running — start 9router manually".
9. **D58/D59 (2026-09-03):** `/model` has an outer MCC frame with inline title, a boxed three-column browser (PROVIDERS | MODELS | SELECTED MODEL inspector; two-column below innerWidth 78, stacked below 56), an aligned two-line reasoning grid with semantic level colors, and an in-frame EDIT PROFILE editor. Bundled theme `mcc-purple.json` is applied on surface open and restored on close (via `ctx.ui.getTheme/setTheme`); it deploys to `~/.pi/agent/themes/` via `executeSync`. 49-check suite green.
10. **D60 (2026-09-04):** `/model` precision pass — the three-column box rows are full-width (`│ cell │ cell │ cell │` = innerWidth exactly; dividers sit ON their `┬`/`┴` junction columns); the Selected Model inspector renders against `selW − 2` only (never the terminal width) and truncates with ellipsis; inspector layout is name / route / `ctx · output` / CAPABILITIES header + one `● cap` row each / status; `LEVEL_COLOR` = Off `dim` / Low `success` / Medium `thinkingMedium` / High `thinkingHigh` / Ultra `thinkingXhigh` (Medium≠Ultra; purple = accent+Ultra only). New UI rows must keep the row-width identity and the D60 geometry/bounds/color tests green.
11. **D61 (2026-09-04):** `/model` browser dividers are purple-family (`border` #4a4262) and built through the ONE `browserRow(cells, widths)` helper — never emit raw unstyled `│` in template literals (renders terminal-default ≈ white) and never hand-pad rows; route any new box path through `browserRow`. D60/D61 geometry, bounds, and continuity tests must stay green.
12. **D62 (2026-09-04):** The primary surface has a Runtime Context Bar above the editor (lifecycle/model/level/profile/workspace/usage) and a one-line footer (branch + tokens + cost); the extension-status line is GONE by design and RAL no longer calls `setStatus` — do not reintroduce status fragments into the primary surface; diagnostics live in `/doctor`. The bar auto-hides while the Model Control Center is open. Any new bar segment must keep the drop order (workspace → line 2 → compact usage → clamp), the 8–400 width-safety sweep, and the D62 tests green.
13. **D65 (2026-09-04):** Visual polish locked — BOTH fields draw all rules with the single `border` token; the context spine carries a `customMessageBg` tint; content hierarchy: model bold text / ● D60 reasoning / ★ lavender profile / 📁 borderAccent workspace / ⑂ success branch / usage text (70/90 tones unchanged). The footer is a zero-height MinimalFooter — do not reintroduce token accounting into the primary UI; the branch still flows through the FooterDataProvider captured at setFooter time. Do not weaken the width-safety round-trip test when touching the tint.
14. **D64 (2026-09-04):** Main surface = three layers: ACTIVITY (transient, above), CONTEXT BAR (persistent OMP spine), INPUT (π-gutter editor via setEditorComponent). Keep them distinct: no lifecycle text in the bar, no activity merging, no new boxed editor. Native Working... stays suppressed via setWorkingIndicator({frames: []}); pi-lens widget hidden via its widget.visible=false config. New bar segments must keep the drop order and 8–400 sweep green.
14. **D63 (2026-09-04):** `/model` provenance fix — the D51 host-bridge blob dispatched the extension `model` command on EVERY submitted line (typing "testing" + Enter opened the MCC). After any `pi update`, re-run `node capabilities/scripts/pi-model-bridge.mjs apply` — the script now migrates the legacy unguarded blob automatically. `/model` must open ONLY from explicit `/model` input; programmatic model events never open it. The D62 report's "~20 s startup auto-open" was this same defect (input during the boot window), not a catalog/restore event.
4. **D44 (2026-08-25):** unified `/model` via host bridge — after any `pi update`, re-run `node capabilities/scripts/pi-model-bridge.mjs apply`; `/doctor` reports bridge state.
5. **D43 (2026-08-25):** Pi skips `model_select` for same-model picks (host, verified to 0.84.3) — reasoning-only access is Alt+M or bare `/reasoning`; upstream ask recorded in DECISIONS D43.

## Left Unresolved / Deferred

- **Phase 2 (admin-derived CONNECTED/ENABLED)** — stance resolved 2026-09-01 (D52): **skip**. Phase 1 transparent fallback stays locked (providers "Configured / available to Pi" + "Connectivity: Unverified"); consent file `~/.pi/agent/harness-router.json` stays designed-but-unused; revisit path = upstream read-only status token if the user ever reopens it.
- Execution-profile status chip can persist up to its 30-min window after a workflow ends (documented v1 semantics).
- Sub-agent inheritance of execution profiles is delivered via injected prompts; direct prompt-level observation requires instrumentation.
- Interactive-only validations (plan-mode, ask-user, simplify, pi-lens); cold-install; `/login` on fresh machine.
- Deferred capabilities pending triggers (GitHub MCP PAT; piolium container; playwright E2E; pi-web-access API key).

## Notes

- Continuous Evolution (D30): no milestone gates; registry is capability source of truth; capture loop mandatory.
