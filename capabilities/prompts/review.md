---
description: Review staged git changes like a senior engineer (consolidated four-dimension review)
argument-hint: [focus]
---
Review the staged changes (`git diff --cached`) like a senior engineer, using four review dimensions (adapted from the Codex review methodology):

1. **Correctness** — bugs, off-by-one, null/undefined handling, error handling gaps, swallowed failures, race conditions.
2. **Security** — injection, secrets exposure, unsafe deserialization, missing authorization checks.
3. **Breaking changes & scope** — API/contract breaks with other parts of the codebase, behavior changes, collateral changes, diff size vs. intent.
4. **Testing coverage** — missing or weak tests for this exact change; name specific gaps.

${1:+Focus especially on $1.}

Report format: one-line verdict first, then prioritized findings (critical / important / minor) with exact file:line references. Do not fix anything unless asked.