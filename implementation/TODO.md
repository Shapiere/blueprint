# TODO

## Purpose

Concrete actionable tasks. Priorities and milestone context live in [ROADMAP.md](../ROADMAP.md); this file owns the task list only.

## Milestone 2 — Validation

- [ ] Execute the cold-install test against `docs/SETUP.md` (fresh environment or thorough checklist review); update success criterion 1 status.
- [ ] Document the 9router local service startup method (currently Pending in `docs/SETUP.md`).
- [ ] Verify fresh-machine `/login` flow for provider 9router.
- [ ] Run one full capture-loop cycle on a real setup change; audit the resulting diff against the ownership matrix.
- [ ] Refresh all `last-verified` dates in `docs/SETUP.md`.
- [ ] Confirm remote repository visibility (public/private); record in `docs/DECISIONS.md`.

## Backlog (candidates, require justification before adoption)

- [ ] Evaluate additional Pi packages/extensions against success criteria 4 (context economy) and 5 (secrets).
- [ ] Add MCP servers only if a concrete workflow need is identified.
- [ ] Add prompt templates or skills derived from real usage.
- [ ] Reconsider a config-sync script only if `docs/SETUP.md` drift becomes measurable (decision D3 allows revisiting).
