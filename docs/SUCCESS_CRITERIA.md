# Success Criteria

## Purpose

Measurable criteria that make the repository's mission concrete. Each criterion has a status. Vision lives in [VISION.md](VISION.md); this file owns measurement only.

## Criteria

### 1. Cold-Install Reproducibility

A fresh Windows machine with only the documented prerequisites can rebuild the Pi environment from [SETUP.md](SETUP.md) alone, within 30 minutes.

- Status: **not yet validated** (restore procedure written, execution pending — see `implementation/TODO.md`).

### 2. Capture-Loop Freshness

Any setup change (package, skill, extension, template, MCP server, setting) is reflected in `docs/SETUP.md` and `CHANGELOG.md` within the same working session it was made.

- Status: **adopted as policy** (constitution, Capture Loop section); compliance audited at each milestone.

### 3. Single-Source Rule

No fact is restated in more than one file; the ownership matrix in the constitution is the authoritative map and the repository structure matches it.

- Status: **validated at Milestone 1** (2026-08-02).

### 4. Context Economy

The assistant's always-loaded context stays lean: tools and skills load on demand (progressive disclosure) rather than all being injected. Proxy-style integrations (e.g., MCP adapter) are preferred over hundreds of direct tool definitions.

- Status: **baseline recorded** at Milestone 1: built-in tools + 2 custom tools; MCP exposed via a single proxy tool.

### 5. Zero Secrets in History

No API key, auth file, OAuth token, or `.env` value ever appears in repository history.

- Status: **validated at Milestone 1** (2026-08-02); re-checked before every push per the secrets policy.

## Notes

- Criteria may be added only with a decision-log entry; criteria may be dropped only when they stop serving the mission.
- A criterion without a status is a bug: mark it **not yet validated** until measured.
