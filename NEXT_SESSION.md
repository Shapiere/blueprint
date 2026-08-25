# Next Session

## Purpose

Handoff: what the next session must do first. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); this file owns the ordered action list only.

## First Actions (in order)

1. **Verify repository state.** Run `python capabilities/scripts/verify.py`; confirm remote matches local `main`.
2. **Operate in Continuous Evolution.** Adopt capabilities only via lifecycle triggers; verify.py before every commit; keep the capture loop.
3. **D42 Phase 1 shipped (2026-08-25).** `/model` post-selection flow = unified control center; visibility trust state live; boot-default restoration on; reasoning v3. Do not reintroduce getAll()-based surfaces or `/mcc`.
4. **D44 (2026-08-25):** unified `/model` via host bridge — after any `pi update`, re-run `node capabilities/scripts/pi-model-bridge.mjs apply`; `/doctor` reports bridge state.
5. **D43 (2026-08-25):** Pi skips `model_select` for same-model picks (host, verified to 0.84.3) — reasoning-only access is Alt+M or bare `/reasoning`; upstream ask recorded in DECISIONS D43.

## Left Unresolved / Deferred

- **Phase 2 (admin-derived CONNECTED/ENABLED)** — blocked on user choosing an access pattern (none / open-local / cookie) per D42 audit §18; consent file `~/.pi/agent/harness-router.json` designed but unused.
- Execution-profile status chip can persist up to its 30-min window after a workflow ends (documented v1 semantics).
- Sub-agent inheritance of execution profiles is delivered via injected prompts; direct prompt-level observation requires instrumentation.
- Interactive-only validations (plan-mode, ask-user, simplify, pi-lens); cold-install; `/login` on fresh machine.
- Deferred capabilities pending triggers (GitHub MCP PAT; piolium container; playwright E2E; pi-web-access API key).

## Notes

- Continuous Evolution (D30): no milestone gates; registry is capability source of truth; capture loop mandatory.
