# Contributing

## Purpose

Rules for changing this repository safely. This guide is agent-facing: it exists so that any AI agent or contributor can modify the repository without breaking its structure or philosophy. If you only want to understand the project, read [AI_CONTEXT.md](AI_CONTEXT.md) instead.

## Before You Change Anything

1. Read [AI_CONTEXT.md](AI_CONTEXT.md).
2. Read the constitution: [docs/BOOTSTRAP_SPEC.md](docs/BOOTSTRAP_SPEC.md).
3. Check [PROJECT_STATE.md](PROJECT_STATE.md) and [implementation/TODO.md](implementation/TODO.md) for in-flight work.

## How to Change This Repository

- **Follow the constitution.** Its rules outrank any preference expressed elsewhere.
- **Respect ownership.** Every fact has one owner file (ownership matrix in the constitution). Update the owner; reference elsewhere.
- **Never duplicate.** If a fact already exists, reference it instead of restating it.
- **Never invent configuration.** Unknown setup facts are marked **Pending** in `docs/SETUP.md`.
- **Never commit secrets.** API keys, auth files, OAuth tokens, `.env*` values are excluded by `.gitignore` and policy. If you are about to stage a secret, stop.
- **Run the capture loop.** Setup changes (packages, skills, extensions, templates, MCP servers, settings) require:
  - `docs/SETUP.md` update (+ `last-verified` refresh),
  - `CHANGELOG.md` entry,
  - `docs/DECISIONS.md` entry for notable choices.
- **Milestone endings** additionally update `PROJECT_STATE.md` and `NEXT_SESSION.md`.

## Before Committing

- Verify the structure matches the constitution.
- Verify no duplicated facts were introduced.
- Verify no secret material is staged (`git status`, `git diff --cached`).
- Use a meaningful message with a conventional prefix, e.g. `feat:`, `docs:`, `fix:`, `chore:`.
- Push to the remote after committing; the repository must never be ahead of the remote without a reason.

## Amending the Constitution

Changes to `docs/BOOTSTRAP_SPEC.md` require a CHANGELOG entry, a DECISIONS entry, and a version bump per the constitution's Amendment Process. Do not edit it casually.

## Integrating Capabilities

All capability integration follows the lifecycle and governance model in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): benchmark, decision entry, adaptation, integration, validation (smoke test), and registry update in the same session. The registry (`capabilities/index.md`) is the single source of truth for capability status. Never promote an unvalidated capability to active.
