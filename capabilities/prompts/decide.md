---
description: Structured engineering decision with evidence and trade-offs
argument-hint: "<decision-problem>"
---
Engineering decision: $1

Evaluate using the evidence-first discipline (DECISIONS-style):

1. **Context** — the situation and constraints, grounded in repository facts (read first; never assume).
2. **Options** — 2+ concrete alternatives with their engineering properties.
3. **Barriers / costs** — maintenance cost, complexity, integration effort, dependency cost.
4. **Risk/robustness** — failure modes and how each option behaves under stress.
5. **Scalability** — how each choice scales with repo/platform growth.
6. **ROI** — engineering value versus cost, quantified in qualitative terms.
7. **Recommendation** — one option with a reasoning paragraph covering every dimension above; explicitly reject the others with one line each.

Never make unsupported claims. If evidence is missing, state what would resolve the question and leave the recommendation as conditional.