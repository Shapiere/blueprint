# Success Criteria

## Purpose

Measurable criteria that make the repository's mission concrete. Each criterion has a status. Vision lives in [VISION.md](VISION.md); this file owns measurement only.

## Criteria

### 1. Cold-Install Reproducibility

A fresh Windows machine with only the documented prerequisites can rebuild the Pi environment from [SETUP.md](SETUP.md) alone, within 30 minutes.

- Status: **partially validated** (2026-08-02): fresh-config simulation passed (`FRESH_OK`), restoring steps 4–5 of the procedure. Full fresh-machine execution pending — see `implementation/TODO.md`.

### 2. Capture-Loop Freshness

Any setup change (package, skill, extension, template, MCP server, setting) is reflected in `docs/SETUP.md` and `CHANGELOG.md` within the same working session it was made.

- Status: **validated at Milestone 2** (2026-08-02): the Milestone 2 validation updates (SETUP.md, CHANGELOG.md, DECISIONS.md) were captured in the same session as the work they describe. **Re-validated at Milestone 3** (2026-08-02): M3 updates captured same-session. **Re-validated at Milestone 6** (2026-08-03): Wave 1 integration captured same-session (registry + SETUP + CHANGELOG + DECISIONS).

### 3. Single-Source Rule

No fact is restated in more than one file; the ownership matrix in the constitution is the authoritative map and the repository structure matches it.

- Status: **re-validated at Milestone 2** (2026-08-02): automated link/path/orphan scan clean; ownership matrix respected. **Re-validated at Milestone 3** (2026-08-02): scan clean. **Re-validated at Milestone 6** (2026-08-03): scan clean after Wave 1; ownership matrix extended (ARCHITECTURE.md, capabilities/index.md).

### 4. Context Economy

The assistant's always-loaded context stays lean: tools and skills load on demand (progressive disclosure) rather than all being injected. Proxy-style integrations (e.g., MCP adapter) are preferred over hundreds of direct tool definitions.

- Status: **baseline unchanged** (2026-08-02): no tool or integration changes during Milestone 2; the Milestone 1 baseline stands. **Re-confirmed at Milestone 3** (2026-08-02): candidate additions were evaluated and rejected on context-economy and secrets grounds (`docs/DECISIONS.md` D13). **Measured at Milestone 6** (2026-08-03): skill index grew from 11 to 19 entries (Wave 1: +4 doc skills, +4 pi-lens skills) — within budget; MCP exposed via the single proxy tool (3 servers, lazy start); curation incident corrected (D16).

### 5. Zero Secrets in History

No API key, auth file, OAuth token, or `.env` value ever appears in repository history.

- Status: **re-validated at Milestone 2** (2026-08-02): the fresh-config test used placeholder credentials only; repository history and working tree contain no secrets.

## Notes

- Criteria may be added only with a decision-log entry; criteria may be dropped only when they stop serving the mission.
- A criterion without a status is a bug: mark it **not yet validated** until measured.
