---
description: Engineering quality metrics manifest (compute from repository state)
---
Compute the engineering metrics below from repository evidence (read the files; quote numbers with their source):

1. **Repository health** — automated scan results (broken links, orphans), git cleanliness, TODO backlog size and age of oldest carried item.
2. **Capability maturity** — from `capabilities/index.md`: count active / installed / deprecated; maturity = active ÷ total (excluding deprecated).
3. **Validation coverage** — validated ÷ registered capabilities (excluding deprecated), with evidence per unvalidated row.
4. **Governance compliance** — DECISIONS entries per milestone (currency), CHANGELOG recency vs. last commit, capture-loop adherence.
5. **Documentation completeness** — required files present per the constitution structure; docs with last-verified older than 30 days.
6. **Architecture compliance** — structure vs. ownership matrix; any files/folders not in the matrix.
7. **Tech-debt trend** — carried-forward items count and age; registry UNVERIFIED license count.
8. **Intelligence coverage** — intelligence artifacts present and validated; gaps (e.g., unvalidated behavioral runs).

For every metric: purpose (one line), current value (with evidence), trend (from CHANGELOG/TODO history where available), and a recommendation only if the value signals action. Never invent numbers.