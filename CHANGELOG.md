# Changelog

## Purpose

Chronological log of repository and setup changes. This file owns the history; current state lives in `PROJECT_STATE.md`.

## Format

`YYYY-MM-DD` — `type`: summary (details in linked files where useful)

## 2026-08-02

- `feat`: initialize repository foundation (Milestone 1)
- `docs`: adopt Bootstrap Specification v1.1 as the repository constitution ([docs/BOOTSTRAP_SPEC.md](docs/BOOTSTRAP_SPEC.md))
- `docs`: add setup inventory for the Pi environment ([docs/SETUP.md](docs/SETUP.md), last verified 2026-08-02)
- `docs`: add secrets policy and `.gitignore` (audit C2)
- `docs`: record audit dispositions ([docs/DECISIONS.md](docs/DECISIONS.md))
- `docs`: add vision, design principles, success criteria, roadmap, contributing guide
- `docs`: apply milestone 1 audit revisions (broken-link fix, map deduplication, status pointers, ownership leaks, task traceability)
- `docs`: close milestone 1 (audit verdict: approve with minor revisions; revisions applied and verified)
- `docs`: document 9router service startup method (npm global `9router@0.5.45`, manual start via `9router` CLI; no autostart registration — verified 2026-08-02)
- `docs`: validate restore procedure steps 4–5 via fresh-config simulation (`FRESH_OK`, 2026-08-02)
- `docs`: determine remote repository visibility — public (GitHub API)
- `docs`: re-evaluate success criteria with evidence (C1 partially validated; C2/C3/C5 re-validated)
- `docs`: close milestone 2 — validation (verdict: complete with remaining validation items)
- `docs`: add operations and troubleshooting sections to setup inventory (start sequence, health check, updates, auth-shape incident recovery)
- `docs`: document `models.json` provider entry shape (redacted verified example)
- `docs`: record milestone 3 candidate evaluations — no setup additions adopted ([docs/DECISIONS.md](docs/DECISIONS.md) D13, D14)
- `docs`: close milestone 3 — depth (verdict: complete with minor improvements)
- `docs`: adopt platform architecture — constitution v1.2, `docs/ARCHITECTURE.md`, `capabilities/` registry and asset tree ([docs/DECISIONS.md](docs/DECISIONS.md) D15)
- `feat`: integrate Wave 1 capabilities — rpiv-todo, pi-permission-system (path protection), pi-plan-mode, pi-fff, sequential-thinking + context7 MCP, anthropics doc skills (validated 2026-08-03; registry: `capabilities/index.md`)
- `feat`: version platform assets — power-tools extension and prompt templates now sourced from `capabilities/`
- `docs`: record Wave 1 decisions — license-driven skill referencing, subagent/browser-layer decisions (D16, D17)
- `docs`: close milestone 6 — Wave 1 integration (verdict: successful; see completion report)

## Notes

- Entries must be added in the same session as the change they describe (capture loop).
