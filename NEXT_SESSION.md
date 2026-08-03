# Next Session

## Purpose

Handoff: what the next session must do first. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); this file owns the ordered action list only.

## First Actions (in order)

1. **Verify repository state.** Confirm the remote matches local `main`; confirm no secret material tracked.
2. **Resolve open question 2.** Whether other machines or agents consume this repository — requires user input; record in `docs/DECISIONS.md`.
3. **Complete pending validations.** `/self-eval` behavioral run; interactive TUI validations (plan-mode enforcement, ask-user prompting, pi-simplify, pi-lens); `/metrics` automated run (baseline in D26).
4. **Begin Milestone 10 (Wave 4 + hardening).** Execute the scoped items in [ROADMAP.md](ROADMAP.md): experimental candidates, power-tools verification, conditional integrations when their triggers fire. Validate each; update the registry as items promote.

## Left Unresolved Last Session

- Milestone 9: all executable items completed; verdict successful. `/self-eval` and `/metrics` behavioral runs environment-degraded (metrics computed directly — D26).
- Interactive-only validations pending (plan-mode, ask-user, simplify, pi-lens) — require a TUI session.
- Full cold-install on a fresh machine not executed.
- Interactive `/login` flow on a fresh machine untested.
- Open question 2 (other consumers) unresolved — requires user input.
- Deferred Wave 3 items pending their recorded triggers (GitHub MCP: PAT; piolium: containerized host; background-tasks: none — duplication).
- pi-web-access search inactive (API key required).

## Notes

- Milestone 9 begins after the pending validations are done or explicitly deferred with a recorded reason.
- Registry (`capabilities/index.md`) is the single source of truth for capability status; update it alongside every integration or validation change.