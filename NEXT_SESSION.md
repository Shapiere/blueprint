# Next Session

## Purpose

Handoff: what the next session must do first. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); this file owns the ordered action list only.

## First Actions (in order)

1. **Verify repository state.** Confirm the remote (`https://github.com/Shapiere/blueprint.git`) matches the local `main` branch; confirm no secret material is tracked (`git ls-files | grep -iE 'auth|\.env'` should return nothing relevant).
2. **Resolve open question 2.** Whether other machines or agents consume this repository cannot be determined from repository evidence — requires user input; record the answer in `docs/DECISIONS.md`.
3. **Execute remaining validation items** when a fresh machine is available: full cold-install per `docs/SETUP.md` (steps 1–3, 6–9) and the interactive `/login` flow.
4. **Propose the next milestone.** No Milestone 4 is defined. Propose a scope in [ROADMAP.md](ROADMAP.md) only when the carried-forward items are resolved or a concrete need emerges; until then the repository is in maintenance mode.

## Left Unresolved Last Session

- Milestone 3 depth: all executed items completed; verdict COMPLETE WITH MINOR IMPROVEMENTS.
- Full cold-install on a fresh machine not executed (no fresh machine available).
- Interactive `/login` flow on a fresh machine untested.
- Open question 2 (other consumers) unresolved — requires user input.
- No next milestone defined.

## Notes

- The repository is in maintenance mode: keep the capture loop running on any setup change; propose a Milestone 4 scope in `ROADMAP.md` when a concrete need emerges.
