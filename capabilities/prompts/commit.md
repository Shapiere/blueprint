---
description: Write a conventional commit message from staged changes
argument-hint: "[type]"
---
Look at `git diff --cached --stat` and `git diff --cached`. Write one conventional commit message:

- Format: `<type>(<scope>): <imperative summary>` (types: feat, fix, refactor, docs, test, chore, perf, style)
- Summary under 72 chars, imperative mood ("add", not "added")
- Body: 2-5 bullet points explaining what and why, no filler

Type hint from user: ${1:-infer from the diff}. Output only the commit message.
