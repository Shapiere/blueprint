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
8. **D50 (2026-08-25):** `/model` is the unified Model Control Surface — three-region layout, detail follows focus, truthful provider wording, browser retired. Preserve D50 surface tests (three-region, focus-precedence, divider).
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
