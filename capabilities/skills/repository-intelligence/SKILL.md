---
name: repository-intelligence
description: Analyze a repository and produce an engineering understanding (architecture, frameworks, languages, package managers, test strategy, CI/CD, documentation quality, maturity, risks, tech-debt indicators) before implementation begins. Use when starting work on an unfamiliar or complex repository, or before planning significant changes.
license: Apache-2.0
---

# Repository Intelligence

## Purpose

Produce a structured engineering understanding of a repository before any implementation. Evidence-driven; never infer facts you cannot verify from the repository.

## Protocol

1. **Surface structure** — use `repo_tree` (depth 3) and `git_log` (recent commits, branch). Read `package.json` / lockfile / manifest equivalents (Cargo.toml, pyproject.toml, go.mod, pom.xml, *.csproj) to identify languages, frameworks, and package manager.
2. **Frameworks & architecture** — identify entry points, module boundaries, layering, and design style from the tree and key files. State architecture *observed*, not assumed: if unwritten, say "single-directory / undetermined".
3. **Tests** — locate test dirs (`__tests__`, `tests/`, `spec/`), runner config, and how tests are invoked. Classify strategy: unit / integration / none / unknown.
4. **CI/CD** — locate `.github/workflows`, `.gitlab-ci.yml`, Jenkinsfile, etc. Report what runs (lint, test, build, deploy).
5. **Dependencies** — count, age signals (locked versions), known-heavy or stale deps only if verifiable from the manifest.
6. **Documentation quality** — presence of README, CONTRIBUTING, docs/; update recency vs. code churn (via `git_log`).
7. **Risks & tech-debt indicators** — large single files, no tests, pinned deprecated deps, mixed languages without boundary docs, secret-looking files committed (report as risk; never print contents).

## Output Format

```
## Engineering Understanding — <repo path>
- Languages / frameworks / package manager
- Architecture (observed)
- Test strategy
- CI/CD
- Documentation quality
- Dependency profile
- Maturity (commit history, release bumps, activity)
- Risks (severity-tagged)
- Tech-debt indicators
- Recommended focus for next engineering steps (evidence-linked)
```

Conclude with a severity-ordered risk list. If a fact cannot be verified, mark it **unknown** — do not guess.