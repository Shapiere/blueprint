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

## Milestone 6 — Wave 1 Integration (complete — see [PROJECT_STATE.md](PROJECT_STATE.md))

Integrated and validated 2026-08-03: rpiv-todo, pi-permission-system (path protection), pi-plan-mode, pi-fff, sequential-thinking + context7 MCP, anthropics doc skills. Registry: `capabilities/index.md`. Layer decisions recorded: `docs/DECISIONS.md` D17.

## Milestone 7 — Wave 2 (next)

Scope (benchmarked, decisions recorded):

1. Full permission gates (allow/ask/deny, bash policy, external-directory guard).
2. Superpowers methodology port (TDD, systematic-debugging, writing/executing-plans).
3. Review suite consolidation (codex/gemini patterns into one review workflow).
4. dynamic-workflows core (parallel orchestration, /code-review, /deep-research, /codebase-audit) + retire pi-subagents per D17.
5. rpiv-ask-user-question, pi-simplify.
6. frontend-design + skill-creator skills (anthropics).

## Milestone 8 — Wave 3 (candidate)

piolium (sandboxed), GitHub MCP, playwright decision execution, memory MCP, background tasks, trailofbits/vercel skill subsets. Gated on Wave 2 stability.

## Next Milestone

Milestone 7 as scoped above. Propose Milestone 8 scope changes only through the roadmap review at the close of Milestone 7.

## Prioritization Rules

- Milestone 2 comes before Milestone 3: validation before expansion.
- No milestone begins until the previous one's status files are updated.
- Items without measurable value are rejected (constitution: Never Overengineer).
