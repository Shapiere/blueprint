# Roadmap

## Purpose

Future milestones and priorities. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); concrete tasks live in [implementation/TODO.md](implementation/TODO.md).

## Milestone 1 — Foundation (closed — see [PROJECT_STATE.md](PROJECT_STATE.md))

Repository bootstrap per Bootstrap Specification v1.1.

## Milestone 2 — Validation (complete with remaining items — see [PROJECT_STATE.md](PROJECT_STATE.md))

Purpose: prove the foundation works before expanding it.

Candidate items:

1. Execute the cold-install test against `docs/SETUP.md` (success criterion 1).
2. Run one full capture-loop cycle on a real setup change.
3. Refresh `last-verified` dates in `docs/SETUP.md`.
4. Resolve open questions (remote visibility, single-user vs shared).

Additional Milestone 2 tasks in `implementation/TODO.md` (9router service startup method, fresh-machine `/login` flow) derive from `docs/SETUP.md` Pending items.

## Milestone 3 — Depth (candidate, not started)

Purpose: deepen the setup where it measurably helps.

Candidate items (each requires justification before adoption):

1. Additional Pi packages or extensions from the catalog.
2. More MCP servers.
3. New prompt templates or skills derived from real use.

## Prioritization Rules

- Milestone 2 comes before Milestone 3: validation before expansion.
- No milestone begins until the previous one's status files are updated.
- Items without measurable value are rejected (constitution: Never Overengineer).
