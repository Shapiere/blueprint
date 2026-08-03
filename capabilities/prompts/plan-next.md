---
description: Evidence-driven next-step planning from repository state
argument-hint: "[focus]"
---
Plan the next engineering step using only repository evidence.

1. Read `PROJECT_STATE.md` — current milestone, completed, in flight, blocked, open questions.
2. Read `ROADMAP.md` — milestone scopes and priorities.
3. Read `capabilities/index.md` — available capabilities and their validation status.
4. Read `NEXT_SESSION.md` — carried-forward actions.
5. Scan repository health: `git log`, `git status`, presence of tests/CI, open TODOs.

Output (evidence-linked, `file:fact` for each claim):
- **Current state** — active milestone and phase.
- **Next engineering step** — the single most valuable verifiable next action.
- **Blockers / prerequisites** — what must exist before it (e.g., unvalidated capability, interactive session, fresh-machine condition).
- **Priority estimate** — impact × urgency with one-line justification.
- **Risk** — what could invalidate the plan.

Never plan into the future beyond what the repository documents; state it as an estimate when you extrapolate.