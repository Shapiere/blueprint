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
- `feat`: deepen permission policy with bash deny/ask rules and external-directory guard (Wave 2, validated)
- `feat`: port superpowers methodology skills — test-driven-development, systematic-debugging, writing-plans, executing-plans (D19)
- `docs`: consolidate the review workflow into the four-dimension Codex-derived methodology
- `feat`: adopt pi-dynamic-workflows core and retire pi-subagents (D20)
- `feat`: integrate rpiv-ask-user-question, pi-simplify, frontend-design and skill-creator skills
- `docs`: complete pending validations — pdf functional (pypdf), package licenses verified (MIT)
- `docs`: close milestone 7 — Wave 2 (verdict: successful; see completion report)
- `feat`: establish Engineering Intelligence Layer v1 — repository-intelligence skill, orchestrator rules, five intelligence prompt templates (D22)
- `feat`: validate intelligence layer behaviorally — repository-intelligence (repo analysis), plan-next (state audit), decide (browser decision; D23)
- `docs`: review browser decision with evidence — keep chrome-devtools; playwright stays gated (D23); license verified Apache-2.0
- `docs`: close milestone 8 — Engineering Intelligence Layer (verdict: successful; see completion report)
- `feat`: intelligence v2 — repository-intelligence v2 modules, orchestration v2 rules, debug/perf/metrics/memory protocol templates (D25/D27)
- `feat`: integrate memory MCP server — validated (entity + observation via proxy; D25)
- `docs`: record Wave 3 deferrals with triggers — GitHub MCP, piolium, pi-background-tasks, playwright gate (D25)
- `docs`: record engineering metrics baseline — maturity 79%, validation coverage 89% (D26)
- `docs`: adopt engineering memory strategy — repository primary, memory MCP as session scratch (D27)
- `docs`: close milestone 9 — Wave 3 + Intelligence v2 (verdict: successful; see completion report)
- `feat`: adopt verification script — `capabilities/scripts/verify.py` (stdlib-only; links, orphans, secrets, structure, registry, decisions; D28)
- `docs`: record hardening decisions — power-tools type-check trigger, permission config stays host-side, memory storage outside repo (D29)
- `docs`: certify foundation and transition to Continuous Evolution (D30)
- `docs`: close milestone 10 — Production Hardening & Real-World Readiness (verdict: certified; see completion report)

## 2026-08-21

- `docs`: resolve open question — repository consumption scope: single primary Harness Pi environment, no other machines or agents consume it as their source of truth ([docs/DECISIONS.md](docs/DECISIONS.md) D31)
- `docs`: complete `/self-eval` behavioral run — five-dimension evaluation against repository evidence, all dimensions PASS (registry: `capabilities/index.md`)
- `docs`: complete `/metrics` behavioral run — maturity 88% (29/33 active), validation coverage 94% (31/33 validated); trend up from the D26 baseline (79%/89%)
- `docs`: validate power-tools extension — strict type-check PASS (TypeScript 7.0.2 against the global pi installation's bundled type declarations, zero-footprint; D29 trigger satisfied without a repo-local dev setup)
- `docs`: verify prompt deployment sync — `capabilities/prompts/` ≡ `~/.pi/agent/prompts/` (12/12 identical)
- `docs`: consolidate TODO carried-forward items into the Continuous Evolution section (remove duplication)
- `fix`: correct 9router documented version in setup inventory — 0.5.45 → 0.5.55 (verified installed and active; matches npm latest; health check HTTP 200)
- `fix`: pin all four MCP servers to concrete verified versions — `chrome-devtools-mcp@1.7.0`, `@modelcontextprotocol/server-sequential-thinking@2026.7.4`, `@upstash/context7-mcp@4.0.3`, `@modelcontextprotocol/server-memory@2026.7.4` ([docs/DECISIONS.md](docs/DECISIONS.md) D32)
- `docs`: add missing memory MCP server note fragment (`capabilities/mcp/memory.md`) and update server counts and validation metadata in `docs/SETUP.md` and `capabilities/index.md`

## 2026-08-22

- `feat`: implement Runtime Abstraction Layer (RAL) v1 — `capabilities/extensions/runtime-orchestrator.ts`: `session_start` project topology detection (6 signatures), 9router health probe with auto-start, `before_agent_start` workspace context injection, `/doctor` diagnostic command (D33)
- `feat`: deploy runtime-orchestrator extension to `~/.pi/agent/extensions/runtime-orchestrator.ts` — type-check PASS (TS 7.0.2 strict); `/doctor` validated against live runtime (9router 202 models, 4 MCP servers, permission system, power-tools)
- `docs`: update `docs/ARCHITECTURE.md` with RAL v1 section (Phase 6 Runtime Abstraction Layer)
- `docs`: update `docs/SETUP.md` Extensions section with runtime-orchestrator deployment details
- `docs`: record architectural decision D33 (RAL v1 extension, phase-1 scope, deferred /sync and dynamic skill activation)
- `feat`: implement RAL v1 Phase 2 — `/sync` one-way asset deployment engine inside `runtime-orchestrator.ts` (D34): SHA256 content-hash drift detection, dry-run preview by default (`/sync`), execution mode (`/sync --apply --force`), conflict protection for locally modified runtime files, strict allowlist scope (prompts, extensions, repository-intelligence skill), protected file isolation (auth/models/settings/mcp/sessions)
- `feat`: integrate sync status indicator into `/doctor` — pending drift count reported alongside router/MCP/permission diagnostics
- `docs`: update `docs/ARCHITECTURE.md` RAL section with Phase 2 sync scope and conflict model; update `docs/SETUP.md`; record decision D34 in [docs/DECISIONS.md](docs/DECISIONS.md)

## Notes

- Entries must be added in the same session as the change they describe (capture loop).
