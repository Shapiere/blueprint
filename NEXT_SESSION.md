# Next Session

## Purpose

Handoff: what the next session must do first. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); this file owns the ordered action list only.

## First Actions (in order)

1. **Verify repository state.** Run `python capabilities/scripts/verify.py`; confirm the remote matches local `main`.
2. **Resolve open question 2.** Whether other machines or agents consume this repository — requires user input; record in `docs/DECISIONS.md`.
3. **Complete pending validations.** `/self-eval` behavioral run; `/metrics` automated run; interactive TUI validations (plan-mode enforcement, ask-user prompting, pi-simplify, pi-lens); power-tools type-check via a repo-local dev setup (D29 trigger).
4. **Operate in Continuous Evolution.** No predefined milestones: adopt capabilities only via the lifecycle and their recorded triggers (GitHub MCP: PAT; piolium: container; playwright: E2E need). Run the verify script before every commit; refresh `last-verified`; keep the capture loop.

## Left Unresolved Last Session

- Milestone 10: foundation certified; transition to Continuous Evolution complete.
- `/self-eval` and `/metrics` behavioral runs environment-degraded (metrics computed directly — D26).
- Interactive-only validations pending (plan-mode, ask-user, simplify, pi-lens) — require a TUI session.
- Full cold-install on a fresh machine not executed.
- Interactive `/login` flow on a fresh machine untested.
- Open question 2 (other consumers) unresolved — requires user input.
- Deferred capabilities pending their recorded triggers (GitHub MCP: PAT; piolium: container; playwright: E2E).
- pi-web-access search inactive (API key required).

## Notes

- Milestone 9 begins after the pending validations are done or explicitly deferred with a recorded reason.
- Registry (`capabilities/index.md`) is the single source of truth for capability status; update it alongside every integration or validation change.