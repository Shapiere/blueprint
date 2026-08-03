---
description: Architecture review of a repository or subsystem
argument-hint: "[path-or-focus]"
---
Architecture review of ${1:-the current repository}:

Assess, with evidence (read the code/tree; quote file paths):
1. **Layering** — boundaries, dependency direction, violations (cycles, leaky abstractions).
2. **Coupling & cohesion** — modules with many cross-dependencies; single-responsibility scoreboard.
3. **Data flow** — where state lives, how it moves, persistence seams.
4. **Extensibility** — how the design accommodates new features; where it resists.
5. **Dependency profile** — heavyweight/redundant deps (manifest-verifiable only).
6. **Testability** — seams for mocking, test strategy viability.
7. **Risks** — severity-tagged list with evidence.

Output: one-paragraph architecture assessment, then findings grouped critical / important / minor with file-path evidence and a trade-off note per finding (never pure opinion — each recommendation carries its cost).