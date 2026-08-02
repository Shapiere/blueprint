# Vision

## Purpose

The long-term vision for this repository: where the project is heading and why it exists. Principles live in [DESIGN_PRINCIPLES.md](DESIGN_PRINCIPLES.md); measurable targets live in [SUCCESS_CRITERIA.md](SUCCESS_CRITERIA.md).

## Overview

A standard Harness Pi installation is a capable but generic coding assistant. This repository's mission is to transform that installation into a practical, powerful, and maintainable assistant tailored to real software engineering work.

The repository itself is the vehicle: a single source of truth that any AI agent can pick up and continue, without chat history, without tribal knowledge, without guesswork.

## Key Points

- **The setup is documented, not the tool.** Pi itself is upstream; this repository owns how Pi is configured, extended, and improved for this user.
- **Reproducible.** A fresh machine can be rebuilt from `docs/SETUP.md` alone.
- **Measurable.** Improvements are adopted only when they map to a success criterion.
- **Durable.** The repository remains useful and maintainable six months after any given session.

## Notes

- Scope deliberately excludes building a custom harness. If a need cannot be met by configuring or extending Pi, that need is documented as a gap before any alternative is considered.

## Future Improvements

- Validate the cold-install procedure (Milestone 2).
- Grow the extension and skill set only where it measurably improves workflow.
