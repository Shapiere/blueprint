---
description: Recommend the right engineering workflow for a task (decision rules)
argument-hint: "<task-description>"
---
Task: $@

Select the most appropriate workflow using the orchestration rules in `docs/ARCHITECTURE.md` (Engineering Intelligence Layer v1):

1. Plan / implement → plan mode → todo → TDD → verify
2. Debug → systematic-debugging → sequential thinking
3. Research → context7 / firecrawl → deep-research
4. Review (staged) → consolidated four-dimension review
5. Architecture / repo analysis → repository-intelligence → review-architecture
6. Audit / risk → codebase-audit or piolium (risk-gated)
7. Documentation → doc skills → changelog pattern

State, in order: (a) chosen workflow chain, (b) why it fits (evidence from the task), (c) any capability you explicitly will NOT use and why, (d) risk level (low/med/high) and what validation gates apply. Base every claim on the task text; never invent repository facts.