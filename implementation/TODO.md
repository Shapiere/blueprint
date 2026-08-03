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

## Carried Forward (requires interactive session or environment stability)

- [ ] `/self-eval` behavioral run — environment-interrupted 2026-08-03 (two attempts).
- [ ] Interactive validations: plan-mode enforcement, ask-user prompting, pi-simplify, pi-lens (TUI session).
- [ ] Full cold-install on a fresh machine (restore steps 1–3, 6–9).
- [ ] Interactive `/login` flow on a fresh machine.
- [ ] Confirm open question 2 (other machines/agents consuming this repository) — requires user input.
- [ ] pi-web-access search — activate with an API key.

## Milestone 9 — Wave 3 + Intelligence v2 (next)

- [ ] piolium (sandboxed security audits, lite/balanced).
- [ ] GitHub MCP (PAT via env; PR/issue/code-search).
- [ ] Memory MCP (knowledge-graph, keyless).
- [ ] pi-background-tasks (bg_run family only).
- [ ] Intelligence v2 gaps: debugging integration, architecture review depth, performance profiling, prompt evals.
- [ ] Refresh remaining UNVERIFIED registry licenses.

## Backlog (candidates, require justification before adoption)

- [x] Evaluate additional Pi packages/extensions against success criteria 4 (context economy) and 5 (secrets) — done 2026-08-02: none adopted (`docs/DECISIONS.md` D13).
- [x] Add MCP servers only if a concrete workflow need is identified — evaluated 2026-08-02: no need demonstrated; none adopted (D13).
- [x] Add prompt templates or skills derived from real usage — evaluated 2026-08-02: existing templates cover documented workflows; none adopted (D13).
- [ ] Reconsider a config-sync script only if `docs/SETUP.md` drift becomes measurable (decision D3 allows revisiting) — condition not met; remains open.
