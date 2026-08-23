# Next Session

## Purpose

Handoff: what the next session must do first. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); this file owns the ordered action list only.

## First Actions (in order)

1. **Verify repository state.** Run `python capabilities/scripts/verify.py`; confirm the remote matches local `main`.
2. **Complete pending validations.** Interactive TUI validations only: plan-mode enforcement, ask-user prompting, pi-simplify, pi-lens — these require a TUI session. Run `/doctor` inside a live Pi session to confirm RAL v1 runtime health.
3. **Operate in Continuous Evolution.** No predefined milestones: adopt capabilities only via the lifecycle and their recorded triggers (GitHub MCP: PAT; piolium: container; playwright: E2E need). Run the verify script before every commit; refresh `last-verified`; keep the capture loop.

## Left Unresolved Last Session

- Interactive-only validations pending (plan-mode, ask-user, simplify, pi-lens) — require a TUI session.
- Full cold-install on a fresh machine not executed.
- Interactive `/login` flow on a fresh machine untested.
- Deferred capabilities pending their recorded triggers (GitHub MCP: PAT; piolium: container; playwright: E2E).
- pi-web-access search inactive (API key required).
- RAL v1 Phase 3 complete: per-turn capability scoping validated (8 profile goldens, fail-open, cross-contamination clean). Task-aware activation and MCP/tool scoping remain deferred.

## Notes

- The platform operates in Continuous Evolution (D30): no milestone gates; pending validations are carried in `implementation/TODO.md` and the registry, not as milestone blockers.
- Registry (`capabilities/index.md`) is the single source of truth for capability status; update it alongside every integration or validation change.