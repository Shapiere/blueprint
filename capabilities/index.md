# Capability Registry

## Purpose

Single source of truth for platform capabilities: what is installed, at what version, in what lifecycle stage, with what validation evidence. Deployment paths live in `docs/SETUP.md`; this file owns status. One row per capability; status changes require the capture loop (CHANGELOG + registry in the same session).

**Last updated: 2026-08-23 (Continuous Evolution — RAL Phase 5 complexity-aware orchestration added)**

## Registry

| Capability | Source | Version/pin | Category | Status | Adaptation | Validation | Lifecycle stage | License | Last verified |
|---|---|---|---|---|---|---|---|---|---|
| power-tools | local extension | — | Extension | active | — | PASS 2026-08-02 (repo_tree, git_log); strict type-check PASS 2026-08-21 (TS 7.0.2 vs global pi types, zero-footprint — D29 trigger satisfied) | Maintenance | — | 2026-08-21 |
| pi-web-access | npm | 0.17.1 | Extension | installed | — | pending (search requires API key) | Maintenance | MIT | 2026-08-03 |
| pi-mcp-adapter | npm | 2.17.0 | Extension (foundation) | active | — | PASS 2026-08-03 (MCP exercises) | Maintenance | MIT | 2026-08-03 |
| pi-lens | npm | 3.8.74 | Extension | installed | — | pending (editor-side, interactive) | Maintenance | MIT | 2026-08-03 |
| badlogic/pi-skills | git | latest | Skills (8) | active | via settings | PASS 2026-08-02 (discovery) | Maintenance | MIT (repo) | 2026-08-02 |
| chrome-devtools | MCP (npx) | 1.7.0 | MCP server | active | — | PASS 2026-08-03 (first use); re-verified 2026-08-21 (pinned 1.7.0 handshake + 29 tools) | Maintenance | Apache-2.0 (verified) | 2026-08-21 |
| commit / explain | local prompts | — | Prompt templates | active | — | PASS 2026-08-02 | Maintenance | — | 2026-08-02 |
| **review (consolidated)** | local prompt | — | Prompt template | active | Codex dimensions merged (D20) | PASS 2026-08-03 (deployed) | Maintenance | — | 2026-08-03 |
| img2threejs + 10 skills | claude/codex/pi dirs | — | Skills | active | — | PASS 2026-08-02 | Maintenance | — | 2026-08-02 |
| rpiv-todo | npm:@juicesharp/rpiv-todo | 2.3.1 | Extension | active | as-is | PASS 2026-08-03 | Maintenance | MIT | 2026-08-03 |
| pi-permission-system | npm:@gotgenes/pi-permission-system | 24.0.0 | Extension | active | path protection + bash + external-dir | PASS 2026-08-03 (deny tests, both waves) | Maintenance | MIT | 2026-08-03 |
| pi-plan-mode | npm:@narumitw/pi-plan-mode | 0.44.0 | Extension | active | as-is | PASS 2026-08-03 (load); enforcement interactive | Maintenance | UNVERIFIED | 2026-08-03 |
| pi-fff | npm:@ff-labs/pi-fff | 0.10.1 | Extension | active | as-is | PASS 2026-08-03 (fffind) | Maintenance | MIT | 2026-08-03 |
| sequential-thinking | MCP (npx) | 2026.7.4 | MCP server | active | as-is | PASS 2026-08-03; re-verified 2026-08-21 (pinned 2026.7.4 tool call PASS) | Maintenance | MIT | 2026-08-21 |
| context7 | MCP (npx) | 4.0.3 | MCP server | active | as-is | PASS 2026-08-03; re-verified 2026-08-21 (pinned 4.0.3 tool call PASS) | Maintenance | MIT | 2026-08-21 |
| anthropics doc skills | anthropics/skills | latest | Skills (4) | active | referenced (license) | PASS 2026-08-03 (discovery; **pdf functional PASS** with pypdf) | Maintenance | source-available (personal use) | 2026-08-03 |
| superpowers methodology skills | obra/superpowers | latest | Skills (4) | active | ported as-is (framework-free) | PASS 2026-08-03 (discovery) | Maintenance | MIT | 2026-08-03 |
| frontend-design, skill-creator | anthropics/skills | latest | Skills (2) | active | referenced | PASS 2026-08-03 (discovery) | Maintenance | Apache-2.0 | 2026-08-03 |
| pi-dynamic-workflows | npm:@quintinshaw/pi-dynamic-workflows | 3.5.0 | Extension | active | workflows (3) selected | PASS 2026-08-03 (launch + agent spawn; completion async) | Maintenance | MIT | 2026-08-03 |
| rpiv-ask-user-question | npm:@juicesharp/rpiv-ask-user-question | 2.3.1 | Extension | installed | as-is | load-validated; interactive | Maintenance | MIT | 2026-08-03 |
| pi-simplify | npm:pi-simplify | 0.2.3 | Extension | installed | as-is | load-validated; interactive | Maintenance | MIT | 2026-08-03 |
| pi-subagents | npm (removed) | — | Extension | **deprecated/retired** | — | retired 2026-08-03 (D17/D20; superseded by dynamic-workflows) | — | MIT | — |
| repository-intelligence | platform-owned skill | — | Skill (intelligence) | **active** | authored, v2 modules | PASS 2026-08-03 (behavioral: v1 + v2 analysis) | Maintenance | Apache-2.0 | 2026-08-03 |
| decide | platform-owned prompt | — | Prompt (decision engine) | **active** | authored | PASS 2026-08-03 (behavioral: browser decision) | Maintenance | — | 2026-08-03 |
| plan-next | platform-owned prompt | — | Prompt (planning) | **active** | authored | PASS 2026-08-03 (behavioral: repo state audit) | Maintenance | — | 2026-08-03 |
| workflow | platform-owned prompt | — | Prompt (orchestrator rules) | **active** | authored, v2 rules | PASS 2026-08-03 (rules exercised by decide/plan-next/repo-intel runs) | Maintenance | — | 2026-08-03 |
| review-architecture | platform-owned prompt | — | Prompt (architecture review) | **active** | authored | load-validated 2026-08-03 | Maintenance | — | 2026-08-03 |
| self-eval | platform-owned prompt | — | Prompt (self-evaluation) | **active** | authored | PASS 2026-08-21 (behavioral: five-dimension run against repository evidence, all dimensions PASS) | Maintenance | — | 2026-08-21 |
| memory (MCP server) | MCP (npx) | 2026.7.4 | MCP server | **active** | as-is | PASS 2026-08-03; re-verified 2026-08-21 (pinned 2026.7.4 tool call PASS) | Maintenance | MIT | 2026-08-21 |
| debug | platform-owned prompt | — | Prompt (debugging protocol) | **active** | authored | load-validated 2026-08-03 | Maintenance | — | 2026-08-03 |
| perf | platform-owned prompt | — | Prompt (performance protocol) | **active** | authored | load-validated 2026-08-03 | Maintenance | — | 2026-08-03 |
| metrics | platform-owned prompt | — | Prompt (metrics manifest) | **active** | authored | PASS 2026-08-21 (behavioral: full manifest computed from live evidence; trend vs D26 baseline) | Maintenance | — | 2026-08-21 |
| memory (protocol) | platform-owned prompt | — | Prompt (engineering memory) | **active** | authored | load-validated 2026-08-03 | Maintenance | — | 2026-08-03 |
| verify | platform-owned script | — | Automation | **active** | authored (stdlib-only) | PASS 2026-08-03 (caught D24 ordering defect; all checks green after fix) | Maintenance | — | 2026-08-03 |
| runtime-orchestrator | local extension | — | Extension (RAL) | **active** | authored (RAL Foundation + /sync + capability scoping + orchestration governance) | PASS 2026-08-22 (type-check TS 7.0.2; topology: 6 signatures; 9router health: 202 models; /doctor: all checks pass; /sync: dry-run/conflict/force/idempotency PASS; scoping: 8 profile golden tests, fail-open verified, cross-contamination clean, live Next.js profile 9 active / 12 available) | Maintenance | Apache-2.0 | 2026-08-22 |
| scopes.json (capability scope map) | local asset | — | Configuration | **active** | authored (D35) | PASS 2026-08-22 (consumed by runtime-orchestrator resolution; synced via allowlist) | Maintenance | Apache-2.0 | 2026-08-22 |
| runtime model catalog bridge | RAL Phase 4 (in extension) | — | Runtime integration | **active** | authored (D36) | PASS 2026-08-22 (mapping goldens: canonical passthrough, non-canonical omission, vision→input, zero-cost; malformed-entry skip + dedup; fail-open empty/null payloads; live catalog 203 mapped vs 85 static; models.json/auth.json hash-unchanged) | Maintenance | Apache-2.0 | 2026-08-22 |
| complexity-aware orchestration | RAL Phase 5 (in extension) | — | Runtime integration | **active** | authored (D37) | PASS 2026-08-23 (strategy caps DIRECT=1/LIGHT≤3/FULL≤8 enforced at workflow tool boundary; HEAVY approval via interactive select; model silent-switch guard; cafe-mockup regression fixture classifies ≤3 agents) | Maintenance | Apache-2.0 | 2026-08-23 |
| reasoning profiles (/reasoning) | RAL Phase 5 (in extension) | — | Runtime configuration | **active** | authored (D37) | PASS 2026-08-23 (Default/Plan/Review profiles independent of model tiers; persisted runtime-owned state; injected per-turn via system prompt) | Maintenance | Apache-2.0 | 2026-08-23 |

## Notes

- **Status semantics:** `active` = validated and promoted; `installed` = deployed, validation pending or interactive; `deprecated/retired` = removed from runtime, history retained.
- **anthropics skills** are referenced from `~/.pi/agent/vendor/` (docx/pptx/xlsx source-available doc skills, D16); Apache-2.0 skills (frontend-design, skill-creator) are also referenced, not vendored (reference-first rule, `capabilities/skills/NOTES.md`).
- **superpowers methodology skills** are framework-free (0 `@`-commands verified per SKILL.md) and registered by reference; the superpowers Pi extension was NOT adopted (D19) — methodology skills only.
- **Wave 3 candidates** (benchmarked, not yet integrated): piolium (deferred — sandbox host required, 0.0.x maturity; D25), GitHub MCP (deferred — PAT provisioning + Windows binary install; D25), pi-background-tasks (deferred — duplicates dynamic-workflows orchestration role, D20 consolidation; D25), playwright swap (gated on concrete E2E need, D23), trailofbits/vercel subsets (not yet justified). See `../docs/ROADMAP.md` and `implementation/TODO.md`.
- Registry updates follow the capture loop: integration, validation, deprecation, or version changes all update this file, `CHANGELOG.md`, and `docs/SETUP.md` in the same session.