# Project State

## Purpose

Current status snapshot. History lives in [CHANGELOG.md](CHANGELOG.md); this file owns only the present.

## Current Milestone

**Milestone 10 — Production Hardening & Real-World Readiness.** Status: **complete** (2026-08-03). Verdict: **foundation certified** (see completion report). Committed and pushed. **The platform now operates in Continuous Evolution** (D30).

## Completed

- Repository structure per Bootstrap Specification v1.1.
- Constitution committed: [docs/BOOTSTRAP_SPEC.md](docs/BOOTSTRAP_SPEC.md).
- Setup inventory with last-verified markers: [docs/SETUP.md](docs/SETUP.md).
- Secrets policy and `.gitignore` in place.
- Vision, design principles, success criteria, decision log, roadmap, contributing guide.
- Decision log records all audit dispositions.
- Audit revisions applied (broken link fix, map deduplication, status pointers, ownership leaks, task traceability).
- Milestone 2 validation: 9router service startup method documented and verified (npm global `9router@0.5.45`, manual start, no autostart).
- Milestone 2 validation: fresh-config simulation passed (`FRESH_OK`) — restore steps 4–5 verified.
- Milestone 2 validation: remote repository visibility determined — **public** (GitHub API, unauthenticated access).
- Milestone 2 validation: success criteria re-evaluated with evidence (C1 partially validated; C2/C3/C5 re-validated).
- Milestone 2 validation: capture loop exercised — validation findings captured same-session in SETUP.md, CHANGELOG.md, DECISIONS.md.
- Milestone 3 depth: operations and troubleshooting sections added to [docs/SETUP.md](docs/SETUP.md) (start sequence, health check, updates, auth-shape incident recovery).
- Milestone 3 depth: `models.json` provider entry shape documented (redacted verified example).
- Milestone 3 depth: candidate evaluations recorded — no setup additions adopted ([docs/DECISIONS.md](docs/DECISIONS.md) D13, D14).
- Milestone 3 depth: capture loop exercised — M3 updates captured same-session.
- Milestone 6: platform architecture adopted — constitution v1.2, `docs/ARCHITECTURE.md`, `capabilities/` tree with registry ([docs/DECISIONS.md](docs/DECISIONS.md) D15).
- Milestone 6: Wave 1 integrated and validated — rpiv-todo, pi-permission-system (path protection), pi-plan-mode, pi-fff, sequential-thinking + context7 MCP, anthropics doc skills; all smoke tests PASS (see [capabilities/index.md](capabilities/index.md)).
- Milestone 6: platform assets versioned — power-tools + prompt templates sourced from `capabilities/`.
- Milestone 6: decisions recorded — license-driven skill referencing (D16), Wave 2 layer decisions (D17).
- Milestone 7: Wave 2 — permission policy deepened (bash + external-directory gates; `rm -rf` deny validated), dynamic-workflows core adopted + pi-subagents retired (D17/D20), superpowers methodology skills ported (TDD, systematic-debugging, plans), review workflow consolidated, rpiv-ask-user-question + pi-simplify loaded, frontend-design/skill-creator skills registered, pdf functional validation completed (pypdf), licenses verified (all MIT).
- Milestone 8: Engineering Intelligence Layer v1 — repository-intelligence skill + five intelligence prompt templates + orchestrator rules ([docs/DECISIONS.md](docs/DECISIONS.md) D22/D23); behaviorally validated (repo analysis, plan-next audit, decide analysis).
- Milestone 9: intelligence v2 — repository-intelligence v2 modules, orchestration v2 rules, debug/perf/metrics/memory templates; memory MCP integrated (validated); Wave 3 deferrals recorded with triggers (D25); metrics baseline (D26); memory strategy (D27).
- Milestone 10: production hardening — verification script adopted (D28), hardening decisions (D29), foundation certified, transition to Continuous Evolution (D30).
- Continuous Evolution (2026-08-21): repository consumption scope resolved — single primary environment, no other consumers ([docs/DECISIONS.md](docs/DECISIONS.md) D31); `/self-eval` and `/metrics` behavioral runs completed (registry updated); power-tools strict type-check PASS (D29 trigger satisfied zero-footprint); prompt deployment sync verified (12/12 identical).

## In Flight

Nothing. The foundational phase is complete; the platform operates in Continuous Evolution (no predefined milestones — see [ROADMAP.md](ROADMAP.md)).

## Blocked

Nothing.

## Open Questions

None open.

(Resolved 2026-08-21: repository consumption scope — single primary Harness Pi environment, no other machines or agents consume it as their source of truth; `docs/DECISIONS.md` D31. Resolved during Milestone 2: remote visibility is **public** — D11. Resolved during Milestone 6: subagent-layer and browser-server decisions — D17.)

## Known Gaps

- Full cold-install on a fresh machine not executed (no fresh machine available during Milestone 2; simulated validation completed — `docs/DECISIONS.md` D12).
- Interactive `/login` flow on a fresh machine untested (stored-credential path verified).
