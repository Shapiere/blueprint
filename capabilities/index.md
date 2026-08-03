# Capability Registry

## Purpose

Single source of truth for platform capabilities: what is installed, at what version, in what lifecycle stage, with what validation evidence. Deployment paths live in `docs/SETUP.md`; this file owns status. One row per capability; status changes require the capture loop (CHANGELOG + registry in the same session).

**Last updated: 2026-08-03 (Milestone 7 — Wave 2)**

## Registry

| Capability | Source | Version/pin | Category | Status | Adaptation | Validation | Lifecycle stage | License | Last verified |
|---|---|---|---|---|---|---|---|---|---|
| power-tools | local extension | — | Extension | active | — | PASS 2026-08-02 (repo_tree, git_log) | Maintenance | — | 2026-08-02 |
| pi-web-access | npm | 0.17.1 | Extension | installed | — | pending (search requires API key) | Maintenance | MIT | 2026-08-03 |
| pi-mcp-adapter | npm | 2.17.0 | Extension (foundation) | active | — | PASS 2026-08-03 (MCP exercises) | Maintenance | MIT | 2026-08-03 |
| pi-lens | npm | 3.8.74 | Extension | installed | — | pending (editor-side, interactive) | Maintenance | MIT | 2026-08-03 |
| badlogic/pi-skills | git | latest | Skills (8) | active | via settings | PASS 2026-08-02 (discovery) | Maintenance | MIT (repo) | 2026-08-02 |
| chrome-devtools | MCP (npx) | latest | MCP server | active | — | PASS 2026-08-03 (first use) | Maintenance | Apache-2.0 (verified) | 2026-08-03 |
| commit / explain | local prompts | — | Prompt templates | active | — | PASS 2026-08-02 | Maintenance | — | 2026-08-02 |
| **review (consolidated)** | local prompt | — | Prompt template | active | Codex dimensions merged (D20) | PASS 2026-08-03 (deployed) | Maintenance | — | 2026-08-03 |
| img2threejs + 10 skills | claude/codex/pi dirs | — | Skills | active | — | PASS 2026-08-02 | Maintenance | — | 2026-08-02 |
| rpiv-todo | npm:@juicesharp/rpiv-todo | 2.3.1 | Extension | active | as-is | PASS 2026-08-03 | Maintenance | MIT | 2026-08-03 |
| pi-permission-system | npm:@gotgenes/pi-permission-system | 24.0.0 | Extension | active | path protection + bash + external-dir | PASS 2026-08-03 (deny tests, both waves) | Maintenance | MIT | 2026-08-03 |
| pi-plan-mode | npm:@narumitw/pi-plan-mode | 0.44.0 | Extension | active | as-is | PASS 2026-08-03 (load); enforcement interactive | Maintenance | UNVERIFIED | 2026-08-03 |
| pi-fff | npm:@ff-labs/pi-fff | 0.10.1 | Extension | active | as-is | PASS 2026-08-03 (fffind) | Maintenance | MIT | 2026-08-03 |
| sequential-thinking | MCP (npx) | latest | MCP server | active | as-is | PASS 2026-08-03 | Maintenance | MIT | 2026-08-03 |
| context7 | MCP (npx) | latest | MCP server | active | as-is | PASS 2026-08-03 | Maintenance | MIT | 2026-08-03 |
| anthropics doc skills | anthropics/skills | latest | Skills (4) | active | referenced (license) | PASS 2026-08-03 (discovery; **pdf functional PASS** with pypdf) | Maintenance | source-available (personal use) | 2026-08-03 |
| superpowers methodology skills | obra/superpowers | latest | Skills (4) | active | ported as-is (framework-free) | PASS 2026-08-03 (discovery) | Maintenance | MIT | 2026-08-03 |
| frontend-design, skill-creator | anthropics/skills | latest | Skills (2) | active | referenced | PASS 2026-08-03 (discovery) | Maintenance | Apache-2.0 | 2026-08-03 |
| pi-dynamic-workflows | npm:@quintinshaw/pi-dynamic-workflows | 3.5.0 | Extension | active | workflows (3) selected | PASS 2026-08-03 (launch + agent spawn; completion async) | Maintenance | MIT | 2026-08-03 |
| rpiv-ask-user-question | npm:@juicesharp/rpiv-ask-user-question | 2.3.1 | Extension | installed | as-is | load-validated; interactive | Maintenance | MIT | 2026-08-03 |
| pi-simplify | npm:pi-simplify | 0.2.3 | Extension | installed | as-is | load-validated; interactive | Maintenance | MIT | 2026-08-03 |
| pi-subagents | npm (removed) | — | Extension | **deprecated/retired** | — | retired 2026-08-03 (D17/D20; superseded by dynamic-workflows) | — | MIT | — |
| repository-intelligence | platform-owned skill | — | Skill (intelligence) | **active** | authored for the platform | PASS 2026-08-03 (behavioral: full repo analysis) | Maintenance | Apache-2.0 | 2026-08-03 |
| decide | platform-owned prompt | — | Prompt (decision engine) | **active** | authored | PASS 2026-08-03 (behavioral: browser decision) | Maintenance | — | 2026-08-03 |
| plan-next | platform-owned prompt | — | Prompt (planning) | **active** | authored | PASS 2026-08-03 (behavioral: repo state audit) | Maintenance | — | 2026-08-03 |
| workflow | platform-owned prompt | — | Prompt (orchestrator rules) | **active** | authored | load-validated 2026-08-03 (rules exercised by decide/plan-next runs) | Maintenance | — | 2026-08-03 |
| review-architecture | platform-owned prompt | — | Prompt (architecture review) | **active** | authored | load-validated 2026-08-03 | Maintenance | — | 2026-08-03 |
| self-eval | platform-owned prompt | — | Prompt (self-evaluation) | **installed** | authored | load-validated; behavioral run interrupted by environment (pending) | Maintenance | — | 2026-08-03 |

## Notes

- **Status semantics:** `active` = validated and promoted; `installed` = deployed, validation pending or interactive; `deprecated/retired` = removed from runtime, history retained.
- **anthropics skills** are referenced from `~/.pi/agent/vendor/` (docx/pptx/xlsx source-available doc skills, D16); Apache-2.0 skills (frontend-design, skill-creator) are also referenced, not vendored (reference-first rule, `capabilities/skills/NOTES.md`).
- **superpowers methodology skills** are framework-free (0 `@`-commands verified per SKILL.md) and registered by reference; the superpowers Pi extension was NOT adopted (D19) — methodology skills only.
- **Wave 3 candidates** (benchmarked, not yet integrated): piolium, GitHub MCP, playwright decision execution, memory MCP, pi-background-tasks, trailofbits skills subset, vercel-labs subset. See `../docs/ROADMAP.md` and `implementation/TODO.md`.
- Registry updates follow the capture loop: integration, validation, deprecation, or version changes all update this file, `CHANGELOG.md`, and `docs/SETUP.md` in the same session.