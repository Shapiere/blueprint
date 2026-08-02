# Next Session

## Purpose

Handoff: what the next session must do first. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); this file owns the ordered action list only.

## First Actions (in order)

1. **Verify repository state.** Confirm the remote (`https://github.com/Shapiere/blueprint.git`) matches the local `main` branch; confirm no secret material is tracked.
2. **Resolve open question 2.** Whether other machines or agents consume this repository — requires user input; record in `docs/DECISIONS.md`.
3. **Execute remaining validation items** when a fresh machine is available: full cold-install per `docs/SETUP.md` and the interactive `/login` flow.
4. **Begin Milestone 7 (Wave 2).** Execute the scoped items in [ROADMAP.md](ROADMAP.md): full permission gates, superpowers port, review consolidation, dynamic-workflows core (+ retire pi-subagents per D17), rpiv-ask-user-question, pi-simplify, frontend-design/skill-creator skills. Validate each; update the registry (`capabilities/index.md`) as items promote.

## Left Unresolved Last Session

- Milestone 6 Wave 1: all integrated capabilities validated PASS; verdict successful.
- Full cold-install on a fresh machine not executed (no fresh machine available).
- Interactive `/login` flow on a fresh machine untested.
- Open question 2 (other consumers) unresolved — requires user input.
- Pre-existing unvalidated base: pi-lens (editor-side), pi-web-access search (key required), pi-subagents (retirement pending D17).

## Notes

- Milestone 7 (Wave 2) begins after the First Actions above are complete or explicitly deferred with a recorded reason.
- Registry (`capabilities/index.md`) is the single source of truth for capability status; update it alongside every integration or validation change.
