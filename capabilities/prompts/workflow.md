---
description: Recommend the right engineering workflow for a task (decision rules, v2)
argument-hint: "<task-description>"
---
Task: $@

Select the most appropriate workflow using the orchestration rules in `docs/ARCHITECTURE.md` (Engineering Intelligence Layer v1 + v2):

1. Plan / implement → plan mode → todo → TDD → verify
2. Debug → systematic-debugging + `/debug` protocol → sequential thinking
3. Research → context7 / pi-web-access → deep-research
4. Review (staged) → consolidated four-dimension review
5. Architecture / repo analysis → repository-intelligence → review-architecture
6. Audit / risk → codebase-audit or piolium (risk-gated)
7. Documentation → doc skills → changelog pattern
8. Performance → `/perf` protocol (measure, change, re-measure)
9. Metrics / health → `/metrics` manifest

State, in order: (a) chosen workflow chain, (b) why it fits (evidence from the task), (c) any capability you explicitly will NOT use and why (redundancy detection: if a capability duplicates a role already covered by the chain — e.g., a second orchestration engine or a second browser server — do not load it), (d) risk level (low/med/high) and which validation gates apply, (e) explainability note: the selection rule that fired. Base every claim on the task text; never invent repository facts.