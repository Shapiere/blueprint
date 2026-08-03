---
description: Evidence-driven debugging protocol (reproduce, hypothesize, bisect, fix, verify)
argument-hint: "<symptom-or-bug>"
---
Debugging task: $@

Follow the systematic-debugging methodology with an evidence discipline:

1. **Reproduce** — get the failure to occur deterministically. Record the exact command, input, and environment. If it cannot be reproduced, document what was attempted and stop guessing.
2. **Hypothesize** — one hypothesis at a time, each grounded in evidence (error message, stack, observed state). Use sequential-thinking for weak-model reasoning when the failure is subtle.
3. **Bisect** — narrow the cause with the cheapest discriminating experiment (log, minimal repro, revert a suspect change via `git log`/`git blame`). Never change multiple variables at once.
4. **Fix minimally** — smallest change that addresses the identified cause; do not refactor opportunistically.
5. **Verify** — re-run the original repro, then run the relevant test suite; state evidence for the fix.

Output: root cause (with evidence), the bisection trail, the fix (diff summary), verification results, and any open risk (unverified edge cases). Never claim a fix without re-running the repro.