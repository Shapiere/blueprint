# Design Principles

## Purpose

Elaboration of the principles stated compactly in the constitution ([BOOTSTRAP_SPEC.md](BOOTSTRAP_SPEC.md)). This file owns the "why" and the examples; the constitution owns the operating rules.

## Think Before Writing

Understand the objective before creating documentation. Every document answers: who reads it, what decision does it support, and what would break without it.

## Repository First

The repository is the project's memory. Never rely on chat history: a future agent has only this repository. If knowledge is not documented, it is temporary.

Example: the bootstrap specification itself lives in the repository (`docs/BOOTSTRAP_SPEC.md`) so the constitution survives any conversation.

## Simplicity Wins

Prefer simple solutions over clever ones. A plain table beats a schema; one file beats three. Complexity is a liability that compounds across sessions.

## Practicality Over Perfection

Build systems that are useful today. Documentation that is 80% accurate and used beats documentation that is 100% accurate and ignored. Gaps are marked **Pending** rather than invented.

## Small Iterations

Improve incrementally; never redesign everything at once. Each session should leave the repository slightly better, with status files updated before stopping.

## Documentation Drives Development

Documentation guides implementation: goals are written before work, decisions are recorded when made. For this repository, the *live environment* is the ground truth for `docs/SETUP.md`; documentation describes reality and is refreshed by the capture loop, never the reverse.

## Quality Over Quantity

Fewer high-quality documents beat many unnecessary ones. Before adding a file, ask whether an existing owner file can absorb the fact.

## Never Overengineer

Reject any change whose complexity lacks measurable value. Non-goals in the constitution are enforced, not aspirational: no unnecessary folders, no duplicated information, no invented architecture.
