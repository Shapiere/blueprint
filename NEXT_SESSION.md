# Next Session

## Purpose

Handoff: what the next session must do first. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); this file owns the ordered action list only.

## First Actions (in order)

1. **Verify repository state.** Confirm the remote (`https://github.com/Shapiere/blueprint.git`) matches the local `main` branch; confirm no secret material is tracked (`git ls-files | grep -iE 'auth|\.env'` should return nothing relevant).
2. **Resolve open question 2.** Whether other machines or agents consume this repository cannot be determined from repository evidence — requires user input; record the answer in `docs/DECISIONS.md`.
3. **Execute remaining validation items** when a fresh machine is available: full cold-install per `docs/SETUP.md` (steps 1–3, 6–9) and the interactive `/login` flow.
4. **Begin Milestone 3 (Depth).** Once the items above are complete or explicitly deferred with a recorded reason, execute Milestone 3 exactly as defined in [ROADMAP.md](ROADMAP.md). Do not expand scope.

## Left Unresolved Last Session

- Milestone 2 validation: all executable items completed; verdict COMPLETE WITH REMAINING VALIDATION ITEMS.
- Full cold-install on a fresh machine not executed (no fresh machine available).
- Interactive `/login` flow on a fresh machine untested.
- Open question 2 (other consumers) unresolved — requires user input.

## Notes

- Milestone 3 (Depth) begins when the First Actions above are complete or explicitly deferred with a recorded reason.
