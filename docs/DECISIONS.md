# Decisions

## Purpose

Decision log. Every entry uses the template below. This file owns the history of *why*; [CHANGELOG.md](../CHANGELOG.md) owns the history of *what changed*.

**Template:**

```text
### D<number> — <title>

- Date: YYYY-MM-DD
- Context: <situation and constraints>
- Decision: <what was chosen>
- Alternatives: <options considered and why they lost>
- Rationale: <the reason this decision serves the mission>
```

---

### D1 — Constitution committed to the repository (audit C1)

- Date: 2026-08-02
- Context: The audit found the bootstrap specification existed only in chat history, contradicting the repository-first rule. Future agents would have no constitution.
- Decision: The specification is committed as `docs/BOOTSTRAP_SPEC.md` (v1.1) and referenced from `AI_CONTEXT.md`.
- Alternatives: Distill into `AI_CONTEXT.md` only — rejected: loses the full operating rules; a summary cannot govern.
- Rationale: Repository-first is only enforceable when the rules are inside the repository.

### D2 — Secrets policy adopted (audit C2)

- Date: 2026-08-02
- Context: The environment holds live credentials (`~/.pi/agent/auth.json`); the definition of done requires pushing to a remote.
- Decision: `.gitignore` excludes auth/oauth/models/.env files; the constitution gains a Secrets Policy; `docs/SETUP.md` stores placeholders and re-entry instructions only.
- Alternatives: Snapshot configuration including secrets — rejected: credential leak on push.
- Rationale: A single bad commit would make the remote a credential dump; exclusion by policy and by tooling is the simplest defense.

### D3 — Setup inventory adopted as "describe, not snapshot" (audit C3)

- Date: 2026-08-02
- Context: The repository's mission is improving the Pi setup, but the original structure had no artifact describing the setup itself.
- Decision: `docs/SETUP.md` documents the environment (prereqs, provider, models, settings, packages, extensions, skills, templates, MCP) with `last-verified` dates and a restore procedure. Unknown facts are marked **Pending**.
- Alternatives: (a) Copy config files into the repository — rejected: config files drift, embed secrets, and duplicate the live source; (b) a sync script — rejected: adds tooling without proven value (Milestone 2 may revisit).
- Rationale: Description plus placeholders is reproducible without becoming a second source of truth for the configuration itself.

### D4 — Repository structure retained (audit M1)

- Date: 2026-08-02
- Context: The audit flagged tension between "no unnecessary folders" and the mandated `docs/` + `implementation/` split.
- Decision: Keep the split; the constitution now records the justification.
- Alternatives: Flatten `implementation/TODO.md` into `ROADMAP.md` — rejected: roadmap owns strategy, TODO owns actionable tasks; merging would blur ownership.
- Rationale: Two folders, each with a distinct owner file, is the minimum structure that keeps the ownership matrix clean.

### D5 — Documentation ownership matrix adopted (audit I1)

- Date: 2026-08-02
- Context: Five files naturally drift into "where are we now"; duplication was near-certain.
- Decision: The constitution includes a one-owner-per-fact matrix and the rule "reference, never restate."
- Alternatives: Accept duplication and reconcile at milestones — rejected: divergence is the failure mode this repository exists to prevent.
- Rationale: Ownership boundaries are the cheapest enforceable anti-duplication mechanism.

### D6 — Content contracts adopted (audit I2)

- Date: 2026-08-02
- Context: "Complete enough to serve as a solid foundation" was not a deterministic contract for unusual files.
- Decision: The constitution defines minimum content for `AI_CONTEXT.md`, `SUCCESS_CRITERIA.md`, `DECISIONS.md`, `PROJECT_STATE.md`, and `NEXT_SESSION.md`.
- Rationale: Deterministic bootstrap requires deterministic content requirements.

### D7 — Capture loop adopted (audit I3)

- Date: 2026-08-02
- Context: Setup changes happen far more often than milestone boundaries; status-only updates would let the repository go stale.
- Decision: Every setup change updates `docs/SETUP.md` and `CHANGELOG.md` in the same session; notable choices also update this log.
- Rationale: The repository's value is reflecting reality; staleness turns it into a liability.

### D8 — Anti-drift conventions adopted (audit I4)

- Date: 2026-08-02
- Context: For a configuration repository, the live environment is the ground truth and documentation can drift from it.
- Decision: `last-verified` dates on every `docs/SETUP.md` section; the cold-install test is a success criterion and Milestone 2 item.
- Rationale: Dates make drift visible; the cold-install test converts the inventory from prose into proof.

### D9 — Minor findings disposition (audit M2–M5)

- Date: 2026-08-02
- Context: Minor findings reviewed for maintainability value without added complexity.
- Decision: M2 adopted — `CONTRIBUTING.md` is explicitly agent-facing. M3 adopted — constitution gains an Amendment Process. M4 adopted — product referenced as "Pi". M5 adopted — no CI/linting added.
- Rationale: Each is a one-line or one-section change with no complexity cost; tooling (M5) remains rejected per the Never Overengineer principle.

### D10 — Audit archive location

- Date: 2026-08-02
- Context: The full audit lives outside this repository (`G:/blueprint-plan`); future agents cannot read chat history.
- Decision: The audit is not copied into the repository; its dispositions are recorded here (D1–D9) and the audit location is noted in `AI_CONTEXT.md`.
- Alternatives: Copy the full audit in — rejected: adds a large artifact whose conclusions are fully captured in the decision log; the constitution forbids documentation without clear value.
- Rationale: The decisions are the durable part; the analysis is archived on disk for reference.
