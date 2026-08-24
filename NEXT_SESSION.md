# Next Session

## Purpose

Handoff: what the next session must do first. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); this file owns the ordered action list only.

## First Actions (in order)

1. **Verify repository state.** Run `python capabilities/scripts/verify.py`; confirm the remote matches local `main`.
2. **Operate in Continuous Evolution.** No predefined milestones: adopt capabilities only via the lifecycle and their recorded triggers. Run the verify script before every commit; refresh `last-verified`; keep the capture loop.
3. **`/mcc` is validated and final as of D41 (2026-08-25)** — grouped structural overview, fuzzy router-first picker, unified v2 persistence, live TUI round-trip verified. Do not re-litigate the layout unless a regression appears.

## Left Unresolved Last Session

- Interactive-only validations pending (plan-mode, ask-user, simplify, pi-lens) — require a TUI session.
- Full cold-install on a fresh machine not executed; interactive `/login` flow untested.
- Deferred capabilities pending their recorded triggers (GitHub MCP: PAT; piolium: container; playwright: E2E).
- pi-web-access search inactive (API key required).

## Open Observations (evidence recorded, no action yet)

- Pi-core boot UX: on a fresh session the dynamic 9router catalog is empty until first registry access, so Pi shows "No models available" and the footer model reads `unknown` even though `settings.json` declares a valid default. RAL now warms `ctx.modelRegistry.refresh()` at `session_start` (D41), which does not re-resolve the session model (Pi-core behavior). Auto-applying the declared default would touch the silent-model-switch invariant — needs a user decision before any change.
- The live router catalog grew from ~203 to 1356 models (all providers visible through the bridge); `/doctor` still prints "~200 models" in its health line — cosmetic.

## Notes

- The platform operates in Continuous Evolution (D30): no milestone gates; pending validations are carried in `implementation/TODO.md` and the registry, not as milestone blockers.
- Registry (`capabilities/index.md`) is the single source of truth for capability status; update it alongside every integration or validation change.
