# Skills — Provenance and Management Notes

## Purpose

How skills enter this platform, where they live, and why.

## Rules

1. **Skills are assets of the platform** — registration, provenance, license, and validation are recorded in the registry (`capabilities/index.md`).
2. **Preferred pattern: reference, don't vendor** — external skill collections stay in `~/.pi/agent/vendor/` (or their source locations) and are registered via settings `skills` paths. Vendoring into this repository happens only when (a) the license permits redistribution into a public repository, and (b) the skill is adapted (not copied verbatim).
3. **License gate** — before any skill is registered: verify the license. Source-available/proprietary skills (e.g., anthropics doc skills) are usable personally but must never be vendored into this public repository (decision D16).
4. **Curated registration** — register skill directories explicitly; never place skill collections inside auto-discovered directories (`~/.pi/agent/skills/`) unless every skill in them is intended to load. The anthropics clone lives in `~/.pi/agent/vendor/anthropics` precisely to keep discovery curated (incident 2026-08-03: placing it in `~/.pi/agent/skills/` auto-loaded all 17 skills).
5. **Validation** — every new skill: discovery check (appears in the model's skill list) + at least one functional invocation before promotion to `active`.

## Current Skill Sources

| Source | Location | Skills registered |
|---|---|---|
| badlogic/pi-skills | `~/.pi/agent/git/github.com/badlogic/pi-skills` | brave-search, browser-tools, gccli, gdcli, gmcli, transcribe, vscode, youtube-transcript |
| anthropics/skills (referenced) | `~/.pi/agent/vendor/anthropics/skills` | docx, pdf, pptx, xlsx (Wave 1) |
| claude/codex dirs | `~/.claude/skills`, `~/.codex/skills` | img2threejs, frontend-design-review |
| packages | pi-subagents, pi-lens | pi-subagents, pi-lens-* (4) |

## Wave 2 Candidates (benchmarked, not yet registered)

frontend-design, webapp-testing, mcp-builder, skill-creator (anthropics — license-checked subset); TDD, systematic-debugging, writing/executing-plans (superpowers — port required); trailofbits security subset; vercel-labs frontend subset; codex/gemini review/docs patterns. See `implementation/TODO.md`.
