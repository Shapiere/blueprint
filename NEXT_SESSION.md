# Next Session

## Purpose

Handoff: what the next session must do first. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); this file owns the ordered action list only.

## First Actions (in order)

1. **Verify repository state.** Confirm the remote (`https://github.com/Shapiere/blueprint.git`) matches the local `main` branch; confirm no secret material is tracked.
2. **Resolve open question 2.** Whether other machines or agents consume this repository — requires user input; record in `docs/DECISIONS.md`.
3. **Execute remaining interactive validations** in a TUI session: pi-plan-mode enforcement, rpiv-ask-user-question prompting, pi-simplify pass, pi-lens feedback — then promote their registry rows to `active`.
4. **Begin Milestone 8 (Wave 3).** Execute the scoped items in [ROADMAP.md](ROADMAP.md): piolium (sandboxed), GitHub MCP, playwright decision execution, memory MCP, pi-background-tasks, trailofbits/vercel skill subsets. Validate each; update the registry (`capabilities/index.md`) as items promote.

## Left Unresolved Last Session

- Milestone 7 Wave 2: all executable items completed; verdict successful.
- Interactive-only validations pending (plan-mode enforcement, ask-user, simplify, pi-lens) — require a TUI session.
- Full cold-install on a fresh machine not executed (no fresh machine available).
- Interactive `/login` flow on a fresh machine untested.
- Open question 2 (other consumers) unresolved — requires user input.
- pi-web-access search inactive (API key required).

## Notes

- Milestone 8 (Wave 3) begins after the interactive validations are complete or explicitly deferred with a recorded reason; Wave 3 items are gated on Wave 2 stability.
- Registry (`capabilities/index.md`) is the single source of truth for capability status; update it alongside every integration or validation change.