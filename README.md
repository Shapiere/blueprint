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

See [AI_CONTEXT.md](AI_CONTEXT.md) for the full map of documents and their responsibilities.

## Key Points

- The repository is the source of truth. Never rely on chat history.
- Every fact has exactly one owner file; other files reference, never restate (see the ownership matrix in `docs/BOOTSTRAP_SPEC.md`).
- Secrets are never committed. See the Secrets Policy in the constitution.
- Every setup change updates the inventory and the changelog in the same session.

## Notes

- Initialized 2026-08-02 as Milestone 1 of Bootstrap Specification v1.1.

## Future Improvements

- See [ROADMAP.md](ROADMAP.md) for candidate milestones.
- See [implementation/TODO.md](implementation/TODO.md) for concrete tasks.
