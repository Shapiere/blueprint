# Capability Registry

## Purpose

Single source of truth for platform capabilities: what is installed, at what version, in what lifecycle stage, with what validation evidence. Deployment paths live in `docs/SETUP.md`; this file owns status. One row per capability; status changes require the capture loop (CHANGELOG + registry in the same session).

**Last updated: 2026-08-03 (Milestone 6 — Wave 1)**

## Registry

| Capability | Source | Version/pin | Category | Status | Adaptation | Validation | Lifecycle stage | License | Last verified |
|---|---|---|---|---|---|---|---|---|---|
| power-tools | local extension | — | Extension | active | — | PASS 2026-08-02 (repo_tree, git_log behavioral) | Maintenance | — | 2026-08-02 |
| pi-web-access | npm | 0.17.1 | Extension | installed | — | pending (search requires API key) | Maintenance | UNVERIFIED | 2026-08-02 |
| pi-subagents | npm | 0.40.0 | Extension | installed | — | pending (never exercised) | Maintenance | UNVERIFIED | 2026-08-02 |
| pi-mcp-adapter | npm | 2.17.0 | Extension (foundation) | active | — | PASS 2026-08-03 (first MCP use) | Maintenance | UNVERIFIED | 2026-08-03 |
| pi-lens | npm | 3.8.74 | Extension | installed | — | pending (editor-side feedback, headless-incompatible) | Maintenance | UNVERIFIED | 2026-08-02 |
| badlogic/pi-skills | git | latest | Skills (8) | active | registered via settings | PASS 2026-08-02 (discovery) | Maintenance | UNVERIFIED | 2026-08-02 |
| chrome-devtools | MCP (npx) | latest | MCP server | active | — | PASS 2026-08-03 (first use, 29 tools) | Maintenance | UNVERIFIED | 2026-08-03 |
| commit / review / explain | local prompts | — | Prompt templates | active | — | PASS 2026-08-02 | Maintenance | — | 2026-08-02 |
| img2threejs + 10 skills | claude/codex/pi dirs | — | Skills | active | — | PASS 2026-08-02 (discovery) | Maintenance | — | 2026-08-02 |
| **rpiv-todo** | npm:@juicesharp/rpiv-todo | 2.3.1 | Extension | **active** | as-is | PASS 2026-08-03 (task create + list) | Maintenance | UNVERIFIED | 2026-08-03 |
| **pi-permission-system** | npm:@gotgenes/pi-permission-system | 24.0.0 | Extension | **active** | path protection only (Wave 1 scope) | PASS 2026-08-03 (deny on `.env`; normal reads unaffected) | Maintenance | MIT (verified) | 2026-08-03 |
| **pi-plan-mode** | npm:@narumitw/pi-plan-mode | 0.44.0 | Extension | **active** | as-is | PASS 2026-08-03 (load); enforcement interactive-only | Maintenance | UNVERIFIED | 2026-08-03 |
| **pi-fff** | npm:@ff-labs/pi-fff | 0.10.1 | Extension | **active** | as-is | PASS 2026-08-03 (fffind behavioral) | Maintenance | MIT (verified) | 2026-08-03 |
| **sequential-thinking** | MCP (npx) | latest | MCP server | **active** | as-is | PASS 2026-08-03 (chain ran) | Maintenance | MIT (verified) | 2026-08-03 |
| **context7** | MCP (npx) | latest | MCP server | **active** | as-is | PASS 2026-08-03 (library resolved) | Maintenance | MIT (verified) | 2026-08-03 |
| **anthropics doc skills** (docx/pdf/pptx/xlsx) | anthropics/skills (referenced, not vendored) | latest | Skills (4) | **active** | referenced by path (license) | PASS 2026-08-03 (discovery); functional conversion pending tools | Maintenance | source-available (personal use) | 2026-08-03 |

## Notes

- **Status semantics:** `active` = validated and promoted; `installed` = deployed but not yet validated (never promoted without validation per lifecycle).
- **anthropics doc skills** are referenced from `~/.pi/agent/vendor/anthropics/skills/` and NOT vendored into this repository: the skills are source-available/proprietary and this repository is public (decision D16).
- **Wave 2 candidates** (benchmarked, not yet integrated): full permission gates, superpowers methodology port, review suite consolidation, dynamic-workflows core, rpiv-ask-user-question, pi-simplify, frontend-design/skill-creator skills, trailofbits skills subset, vercel-labs skills. See `docs/DECISIONS.md` D13/D17 and `implementation/TODO.md`.
- Registry updates follow the capture loop: integration, validation, deprecation, or version changes all update this file, `CHANGELOG.md`, and `docs/SETUP.md` in the same session.
