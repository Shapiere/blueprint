---
description: Engineering memory protocol — what to store, where, and why
argument-hint: "[topic-to-remember-or-retrieve]"
---
Engineering memory task: ${@:-review current engineering memory state}

Principles:
- **The repository is the primary source of truth.** Nothing that matters is stored only in memory.
- **Store engineering knowledge only** — architectural decisions, engineering decisions, validated capabilities, project evolution, repository history, recurring patterns. Never personal conversations.

What goes where:
1. **Repository (permanent, primary):** decisions → `docs/DECISIONS.md`; capabilities → `capabilities/index.md`; setup → `docs/SETUP.md`; project state → `PROJECT_STATE.md`; evolution → `CHANGELOG.md`. All via the capture loop.
2. **Project memory:** `AGENTS.md` in each working repository for durable conventions.
3. **Session-scale scratch (memory MCP):** transient engineering facts worth recalling within/across sessions but not yet promoted: work-in-progress context, unresolved hypotheses, candidate ideas. Entities/relations/observations only; promote to the repository when they become decisions or validated facts.

Rules:
- **Write:** when a fact becomes a decision or validated result, promote it to the repository in the same session (capture loop); the memory store is never the authoritative copy.
- **Read:** retrieve from the repository first; use the memory store only for not-yet-promoted context.
- **Retention:** purge observations that were promoted or disproven; never store credentials (secrets policy).

Output: for retrieval — the fact and where it lives (or "not stored; repository is the source"); for storage — what was written where and the promotion path if applicable.