---
name: repository-intelligence
description: Analyze a repository and produce an engineering understanding (architecture, frameworks, languages, package managers, test strategy, CI/CD, documentation quality, maturity, risks, tech-debt indicators, hotspots, refactoring opportunities) before implementation begins. Use when starting work on an unfamiliar or complex repository, or before planning significant changes.
license: Apache-2.0
---

# Repository Intelligence (v2)

## Purpose

Produce a structured engineering understanding of a repository before any implementation. Evidence-driven; never infer facts you cannot verify from the repository.

## Protocol

1. **Surface structure** — use `repo_tree` (depth 3) and `git_log` (recent commits, branch). Read `package.json` / lockfile / manifest equivalents (Cargo.toml, pyproject.toml, go.mod, pom.xml, *.csproj) to identify languages, frameworks, and package manager.
2. **Frameworks & architecture** — identify entry points, module boundaries, layering, and design style from the tree and key files. State architecture *observed*, not assumed: if unwritten, say "single-directory / undetermined".
3. **Dependency relationships** — from manifests: direct vs dev vs transitive (transitive only if a lockfile exists), version pinning, obvious staleness or known-heavy dependencies — manifest-verifiable only.
4. **Module boundaries** — map directories to responsibilities; note where boundaries are unclear, cross-cutting, or cyclic (evidence from imports/requires in key files).
5. **Tests** — locate test dirs (`__tests__`, `tests/`, `spec/`), runner config, and how tests are invoked. **Testing maturity** (1–5): 1 = none; 2 = some, no runner config; 3 = runner + unit tests; 4 = + integration; 5 = + CI-enforced coverage/quality gates. Evidence for the rating.
6. **CI/CD** — locate `.github/workflows`, `.gitlab-ci.yml`, Jenkinsfile, etc. Report what runs (lint, test, build, deploy) and what is NOT automated.
7. **Security posture checklist** — evidence-based: secrets-looking files tracked (report as risk; never print contents), lockfile present (supply-chain hygiene), dependency pinning, privileged code paths, unvalidated inputs in entry points (only where visible).
8. **Documentation quality** — presence of README, CONTRIBUTING, docs/; update recency vs. code churn (via `git_log`).
9. **Engineering hotspots** — files with high churn × size (from `git_log` and tree sizes): the files most touched and most risky.
10. **Maintainability indicators** — large single files, mixed languages without boundary docs, missing tests on hot paths, dead-looking code (unreferenced exports, verifiable via grep).
11. **Refactoring opportunities** — evidence-linked: duplicated structures, god modules, unclear boundaries — each with the evidence path and a risk note.

## Output Format

```
## Engineering Understanding — <repo path>
- Languages / frameworks / package manager
- Architecture (observed)
- Dependency profile (incl. relationships, pinning)
- Module boundaries (map + concerns)
- Testing maturity (1–5 + evidence)
- CI/CD
- Security posture (checklist results)
- Documentation quality
- Engineering hotspots (churn × size)
- Maintainability indicators
- Refactoring opportunities (evidence-linked)
- Maturity (commit history, release bumps, activity)
- Risks (severity-tagged)
- Recommended focus for next engineering steps (evidence-linked)
```

Conclude with a severity-ordered risk list. If a fact cannot be verified, mark it **unknown** — do not guess.