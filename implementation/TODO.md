# TODO

## Purpose

Concrete actionable tasks. Priorities and milestone context live in [ROADMAP.md](../ROADMAP.md); this file owns the task list only.

## Milestone 2 — Validation (complete 2026-08-02)

- [x] Execute the cold-install test — partial: fresh-config simulation passed (`FRESH_OK`, steps 4–5); full fresh-machine execution carried forward (no fresh machine available).
- [x] Document the 9router local service startup method — done: npm global `9router@0.5.45`, manual start via `9router` CLI, no autostart registration (see `docs/SETUP.md`).
- [x] Verify fresh-machine `/login` flow — partial: stored-credential path verified via simulation; interactive UI flow carried forward.
- [x] Run one full capture-loop cycle on a real setup change — done: M2 validation findings captured same-session (SETUP.md + CHANGELOG.md + DECISIONS.md); diff audited against the ownership matrix.
- [x] Refresh all `last-verified` dates in `docs/SETUP.md` — done: re-verified against the live environment 2026-08-02.
- [x] Confirm remote repository visibility — done: public (GitHub API, unauthenticated access); recorded in `docs/DECISIONS.md` D11.

## Milestone 6 — Wave 1 Integration (complete 2026-08-03)

- [x] Install and validate rpiv-todo — PASS (task create + list).
- [x] Install and validate pi-permission-system — PASS (path protection: `.env` denied, normal reads unaffected).
- [x] Install and validate pi-plan-mode — PASS (load); enforcement interactive-only.
- [x] Install and validate pi-fff — PASS (fffind behavioral).
- [x] Add sequential-thinking + context7 MCP servers — PASS (both invoked via proxy).
- [x] Register anthropics doc skills (docx/pdf/pptx/xlsx) — PASS (discovery); functional conversion pending tools.
- [x] First MCP exercise — chrome-devtools PASS (29 tools; adapter validated).
- [x] Bootstrap registry and architecture — done (constitution v1.2, `docs/ARCHITECTURE.md`, `capabilities/`).
- [x] Record layer decisions (subagent, browser, permission policy) — D17.

## Milestone 7 — Wave 2 (complete 2026-08-03)

- [x] Full permission gates — done: bash policy + external-directory guard; `rm -rf *` deny validated.
- [x] Superpowers methodology port — done: TDD, systematic-debugging, writing/executing-plans registered by reference (D19).
- [x] Review suite consolidation — done: four-dimension Codex-derived review template deployed.
- [x] dynamic-workflows core + retire pi-subagents — done: launch validated (D20).
- [x] rpiv-ask-user-question, pi-simplify — installed (interactive validation pending).
- [x] frontend-design + skill-creator skills — registered, discovery validated.
- [x] Pending validations: pdf functional PASS (pypdf), licenses verified MIT (D21).

## Milestone 8 — Engineering Intelligence Layer (complete 2026-08-03)

- [x] Intelligence architecture v1 — orchestration rules, context strategy, decision boundaries, self-eval framework in `docs/ARCHITECTURE.md`.
- [x] repository-intelligence skill — authored, registered, behaviorally validated (full repo analysis).
- [x] Intelligence templates — workflow, decide, plan-next, review-architecture, self-eval (deployed; decide + plan-next behaviorally validated).
- [x] Browser decision review — keep chrome-devtools; playwright stays gated (D23); license verified Apache-2.0.

## Milestone 9 — Wave 3 + Intelligence v2 (complete 2026-08-03)

- [x] memory MCP integrated — validated (entity + observation via proxy).
- [x] Wave 3 deferrals recorded with triggers — GitHub MCP (PAT), piolium (container), pi-background-tasks (duplication), playwright (E2E gate) — D25.
- [x] repository-intelligence v2 — dependency relationships, module boundaries, testing maturity, security checklist, hotspots, maintainability, refactoring modules; validated.
- [x] Orchestration v2 — redundancy detection, loading budget, explainability, coordination, ordering rules.
- [x] debug, perf, metrics, memory protocol templates — authored and deployed.
- [x] Engineering memory strategy adopted (D27); metrics baseline recorded (D26).

## Carried Forward (requires interactive session, environment stability, or user input)

- [x] `/self-eval` behavioral run — done 2026-08-21 (five-dimension run against repository evidence, all PASS; registry updated).
- [x] `/metrics` automated run — done 2026-08-21 (full manifest computed from live evidence; registry updated).
- [x] Confirm open question 2 (other machines/agents consuming this repository) — resolved 2026-08-21: single primary environment (`docs/DECISIONS.md` D31).

(Remaining open items consolidated into the Continuous Evolution section below, 2026-08-21 — this section previously duplicated them.)

## Milestone 10 — Production Hardening (complete 2026-08-03)

- [x] Verification script adopted — `capabilities/scripts/verify.py` (stdlib-only; links, orphans, secrets, structure, registry, decisions) — caught D24 ordering defect on first run.
- [x] Hardening review — permissions host-side (documented), memory storage outside repo, secret scan enforced (D29).
- [x] Foundation certified — transition to Continuous Evolution (D30).

## Continuous Evolution (post-foundation maintenance)

- [x] `/self-eval` behavioral run — done 2026-08-21 (registry: `capabilities/index.md`).
- [x] `/metrics` automated run — done 2026-08-21 (trend vs D26 baseline: maturity 79→88%, coverage 89→94%).
- [x] power-tools type-check — done 2026-08-21: strict type-check PASS (TypeScript 7.0.2 vs global pi type declarations, zero-footprint; D29 trigger satisfied without a repo-local dev setup).
- [x] Confirm open question 2 (other machines/agents) — resolved 2026-08-21 (D31).
- [ ] Interactive validations: plan-mode enforcement, ask-user prompting, pi-simplify, pi-lens (TUI session).
- [ ] Trigger-based integrations when they fire: GitHub MCP (PAT), piolium (container), playwright (E2E need).
- [ ] Full cold-install on a fresh machine (restore steps 1–3, 6–9).
- [ ] Interactive `/login` flow on a fresh machine.
- [ ] pi-web-access search — activate with an API key.

## Backlog (candidates, require justification before adoption)

- [x] Evaluate additional Pi packages/extensions against success criteria 4 (context economy) and 5 (secrets) — done 2026-08-02: none adopted (`docs/DECISIONS.md` D13).
- [x] Add MCP servers only if a concrete workflow need is identified — evaluated 2026-08-02: no need demonstrated; none adopted (D13).
- [x] Add prompt templates or skills derived from real usage — evaluated 2026-08-02: existing templates cover documented workflows; none adopted (D13).
- [ ] Reconsider a config-sync script only if `docs/SETUP.md` drift becomes measurable (decision D3 allows revisiting) — condition not met; remains open.
