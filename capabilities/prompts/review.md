---
description: Review staged git changes like a senior engineer
argument-hint: [focus]
---
Review the staged changes (`git diff --cached`${1:+ and focus especially on $1}). Check for:
- Bugs and logic errors, off-by-one, null/undefined handling
- Security issues (injection, secrets, unsafe deserialization)
- Error handling gaps and swallowed failures
- Performance problems in hot paths
- API/contract breaks with other parts of the codebase

Report findings as a prioritized list: critical / important / minor. Quote exact lines. Do not fix anything unless asked.
