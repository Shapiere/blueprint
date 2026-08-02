# Next Session

## Purpose

Handoff: what the next session must do first. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); this file owns the ordered action list only.

## First Actions (in order)

1. **Verify repository state.** Confirm the remote (`https://github.com/Shapiere/blueprint.git`) matches the local `main` branch; confirm no secret material is tracked (`git ls-files | grep -iE 'auth|\.env'` should return nothing relevant).
2. **Confirm open questions.** Determine remote visibility (public/private) and whether other machines consume this repository; record the answers in `docs/DECISIONS.md`.
3. **Execute the cold-install test.** Follow the restore procedure in `docs/SETUP.md` on a fresh environment (or a checklist review against the live machine) and update success criterion 1 status in `docs/SUCCESS_CRITERIA.md`.
4. **Exercise the capture loop.** On the next real setup change (any package, skill, extension, template, MCP server, or setting), update `docs/SETUP.md` + `CHANGELOG.md` (+ `docs/DECISIONS.md` if notable) in the same session.
5. **Plan Milestone 2.** If validation items are done, draft the Milestone 2 scope in `ROADMAP.md` and move concrete tasks into `implementation/TODO.md`.

## Left Unresolved Last Session

- Cold-install test not executed.
- Remote visibility unknown.
- `docs/SETUP.md` restore procedure unvalidated (dates 2026-08-02).

## Notes

- Do not begin Milestone 2 until the First Actions above are complete or explicitly deferred with a recorded reason.
