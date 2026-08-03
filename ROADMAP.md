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

## Milestone 7 — Wave 2: Permission & Methodology (complete — see [PROJECT_STATE.md](PROJECT_STATE.md))

Integrated and validated 2026-08-03: permission policy deepened (bash + external-directory gates), pi-dynamic-workflows core adopted + pi-subagents retired (D17/D20), four superpowers methodology skills ported (D19), review workflow consolidated, rpiv-ask-user-question + pi-simplify + frontend-design/skill-creator registered, pdf functional validation and license verification completed (D21). Registry: `capabilities/index.md`.

## Milestone 8 — Engineering Intelligence Layer (complete — see [PROJECT_STATE.md](PROJECT_STATE.md))

Engineering Intelligence Layer v1 established 2026-08-03: repository-intelligence skill, five intelligence prompt templates, orchestration rules, context strategy, self-evaluation framework (D22/D23); behaviorally validated (repo analysis, plan-next audit, decide analysis).

## Milestone 9 — Wave 3 + Intelligence v2 (next)

Scope:

1. Advance capabilities: piolium (sandboxed), GitHub MCP, memory MCP, background tasks; playwright swap only after a concrete E2E need (D23).
2. Intelligence v2: close gaps — debugging integration, architecture review depth, performance profiling, prompt evals (each through the lifecycle); behavioral validation of `/self-eval` (pending after environment interruption); tutorial sessions for plan-mode/ask-user/simplify/pi-lens.
3. Governance: refresh UNVERIFIED registry licenses; interactive validations; open question 2.

## Next Milestone

Milestone 10+: Wave 4 experimental (pi-hashline-edit-pro, lean-ctx, ast-grep codemod pattern), and long-term intelligence deepening. Propose scope changes through the roadmap review at the close of Milestone 9.

## Prioritization Rules

- Milestone 2 comes before Milestone 3: validation before expansion.
- No milestone begins until the previous one's status files are updated.
- Items without measurable value are rejected (constitution: Never Overengineer).
