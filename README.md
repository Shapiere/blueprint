# Harness Pi Blueprint

## Purpose

This repository is the single source of truth for improving the Harness Pi setup: a practical, powerful, and maintainable AI coding assistant built on Pi.

It is a documentation-first engineering blueprint. It is not a codebase and not a random collection of notes.

## Quickstart

1. Read [AI_CONTEXT.md](AI_CONTEXT.md) — everything a fresh agent or contributor needs on first contact.
2. Read [docs/BOOTSTRAP_SPEC.md](docs/BOOTSTRAP_SPEC.md) — the constitution. It governs how this repository changes.
3. Read [docs/SETUP.md](docs/SETUP.md) — what is currently installed and how to rebuild it.
4. Read [PROJECT_STATE.md](PROJECT_STATE.md) — where the project stands right now.

## Repository Map

| Path | Responsibility |
|---|---|
| `AI_CONTEXT.md` | Agent onboarding: role, rules, pointers |
| `CONTRIBUTING.md` | How to change this repository safely |
| `CHANGELOG.md` | Chronological log of repository and setup changes |
| `PROJECT_STATE.md` | Current status snapshot |
| `ROADMAP.md` | Future milestones and priorities |
| `NEXT_SESSION.md` | Handoff instructions for the next session |
| `docs/BOOTSTRAP_SPEC.md` | Constitution (bootstrap specification v1.1) |
| `docs/VISION.md` | Long-term vision |
| `docs/DESIGN_PRINCIPLES.md` | Principle elaboration |
| `docs/SUCCESS_CRITERIA.md` | Measurable success criteria and status |
| `docs/DECISIONS.md` | Decision log |
| `docs/SETUP.md` | Setup inventory (rebuild instructions) |
| `implementation/TODO.md` | Concrete actionable tasks |

## Key Points

- The repository is the source of truth. Never rely on chat history.
- Every fact has exactly one owner file; other files reference, never restate (see the ownership matrix in `docs/BOOTSTRAP_SPEC.md`).
- Secrets are never committed. See the Secrets Policy in the constitution.
- Every setup change updates the inventory and the changelog in the same session.

## Notes

- Initialized 2026-08-02 as Milestone 1 of Bootstrap Specification v1.1.
- The audit that informed v1.1 lives at `G:/blueprint-plan` (outside this repository); its dispositions are recorded in `docs/DECISIONS.md`.

## Future Improvements

- See [ROADMAP.md](ROADMAP.md) for candidate milestones.
- See [implementation/TODO.md](implementation/TODO.md) for concrete tasks.
