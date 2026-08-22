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

### D11 — Remote repository visibility determined: public

- Date: 2026-08-02
- Context: Milestone 2 open question; the secrets policy's strictness depends on who can read the repository.
- Decision: Recorded here as resolved. The repository is **public**: an unauthenticated GitHub API request (`GET https://api.github.com/repos/Shapiere/blueprint`) returned repository metadata (a private repo would return `Not Found`).
- Alternatives: Assume visibility — rejected: verification was one request away.
- Rationale: Public visibility makes the secrets policy mandatory, not advisory; it remains in force unchanged.

### D12 — Cold-install validation approach (simulation over fabrication)

- Date: 2026-08-02
- Context: Milestone 2 requires executing the cold-install procedure, but no fresh machine is available. Results must never be fabricated.
- Decision: Perform the strongest practical validation: (a) a fresh-config simulation — a temporary agent directory containing the documented `models.json`, minimal `settings.json`, and the documented placeholder auth (`sk_9router`), run with `PI_CODING_AGENT_DIR`; (b) a checklist review of every remaining restore step against the live machine.
- Alternatives: (a) Destructive reinstall of pi on this machine — rejected: risks the working setup without adding evidence; (b) declare the criterion unvalidated without attempting — rejected: real evidence was obtainable.
- Result: Simulation passed (`FRESH_OK`, 2026-08-02): restore steps 4–5 verified end-to-end, including that the local router accepts the placeholder key. Steps 1–3 and 6–9 verified by checklist. Full fresh-machine execution and the interactive `/login` flow remain carried forward in `implementation/TODO.md`.
- Rationale: Honest partial validation with documented evidence beats either fabrication or blanket deferral.

### D13 — Milestone 3 candidate evaluations: no setup additions adopted

- Date: 2026-08-02
- Context: ROADMAP Milestone 3 candidates — additional packages/extensions, more MCP servers, new templates/skills — each require justification before adoption. No concrete workflow need was demonstrated for any of them.
- Decision: Evaluate each candidate against success criteria 4 (context economy) and 5 (secrets) and the demonstrated workflow; adopt none.
- Evaluations: (1) Packages/extensions — the installed set already covers identified needs (web access, subagents, MCP adapter, LSP feedback); remaining gallery candidates (todo overlays, security-audit suites, background-task managers, large skill packs) either duplicate capability, add credential burden, or inflate always-loaded context. (2) MCP servers — `chrome-devtools` covers browser workflows; filesystem/github/playwright candidates duplicate built-in tools or require new credentials. (3) Templates/skills — the existing three (`commit`, `review`, `explain`) cover the documented workflows; no real-usage gap was demonstrated.
- Alternatives: Adopt the most popular candidates (e.g., `rpiv-todo`, `piolium`) — rejected: no demonstrated need; contradicts practicality and criterion 4.
- Rationale: "Reject complexity without measurable value." The milestone's depth work is the evaluation itself, recorded here for future sessions to reference instead of re-running.

### D14 — Depth documentation folded into SETUP.md (no new files)

- Date: 2026-08-02
- Context: Milestone 3 depth analysis found operational and recovery knowledge undocumented: daily start sequence, health check, update commands, the `auth.json` `type`-field incident recovery, and a weak restore step 4 ("exact file: on the source machine").
- Decision: Extend `docs/SETUP.md` with an Operations section, a Troubleshooting table, a verified redacted `models.json` example, and a host path-resolution note. No new documents.
- Alternatives: New `docs/OPERATIONS.md` — rejected: would require an ownership-matrix amendment (constitution change) for content that fits SETUP.md's charter ("what is installed and how to run/rebuild it"), and risks duplication.
- Rationale: Depth without new structure; the ownership matrix stays untouched and the capture loop stays the single update path.

### D15 — Platform architecture adopted (constitution v1.2)

- Date: 2026-08-03
- Context: Milestone 5.5 delivered the AI Engineering Platform architecture; Milestone 6 begins actual platform implementation.
- Decision: Adopt `docs/ARCHITECTURE.md` as the governing architecture reference (layers, capability lifecycle, governance, integration architecture) and `capabilities/` as the platform asset tree with `capabilities/index.md` as the capability registry. Constitution amended to v1.2 (structure + ownership matrix).
- Alternatives: Defer structure change until Wave 2 — rejected: the registry and asset homes are prerequisites for Wave 1 integration itself.
- Rationale: Architecture before implementation; the registry is the single source of truth for capability status.

### D16 — External skills: reference, don't vendor (license gate)

- Date: 2026-08-03
- Context: anthropics doc skills (docx/pdf/pptx/xlsx) are source-available/proprietary; this repository is public (D11). Placing the clone in `~/.pi/agent/skills/` accidentally auto-loaded all 17 anthropics skills (incident 2026-08-03).
- Decision: The anthropics clone lives in `~/.pi/agent/vendor/anthropics`; only the four Wave 1 doc skills are registered via settings `skills`. External skill collections are referenced by path, never vendored into this repository, unless the license permits redistribution into a public repo and the skill is adapted.
- Alternatives: Vendor the four skills — rejected: redistribution of source-available material into a public repository.
- Rationale: License compliance and curated context (success criterion 4). Rules recorded in `capabilities/skills/NOTES.md`.

### D17 — Wave 2 layer decisions recorded early

- Date: 2026-08-03
- Context: The architecture requires the subagent-layer and browser-server conflicts to be decided before both sides coexist; Milestone 6 records the decisions, Wave 2 executes them.
- Decision: (a) Subagent layer — `pi-dynamic-workflows` wins the orchestration role; installed `pi-subagents` is retired when dynamic-workflows is integrated (Wave 2). (b) Browser server — playwright-mcp is the preferred E2E server per official token-economy guidance; the swap from chrome-devtools is evaluated during Wave 2 after a concrete E2E need is demonstrated. (c) Permission policy — full allow/ask/deny gates, bash policy, and external-directory guard are configured in Wave 2; Wave 1 keeps path protection only.
- Alternatives: Integrate both subagent layers — rejected: duplication cost exceeds benefit (benchmark).
- Rationale: Conflict resolution before coexistence; decisions recorded here, execution gated to Wave 2.

### D18 — Permission policy deepened (Wave 2)

- Date: 2026-08-03
- Context: D17 required full gates in Wave 2. Headless determinism matters (the validation battery runs `pi -p`).
- Decision: Policy = tools `allow` by default; path protection unchanged (secrets deny); bash policy — deny `rm -rf *`/`rm -fr *`, ask `git push --force*`/`sudo *`; external-directory — `ask` outside `cwd` with allows for platform dirs (`~/.pi/agent/**`, `~/.config/mcp/**`, `~/.claude/**`, `~/.codex/**`).
- Alternatives: external-directory `allow`-by-default — rejected: leaves a guard hole; `ask` is the designed CWD guard for interactive sessions.
- Validation: `.env` deny re-tested; `rm -rf *` deny confirmed (model fell back to plain `rm`); normal reads and bash unaffected. PASS.

### D19 — Superpowers methodology ported by reference; framework extension not adopted

- Date: 2026-08-03
- Context: Wave 2 methodology integration; obra/superpowers ships methodology skills plus a first-party Pi extension.
- Decision: Port the four highest-value methodology skills — test-driven-development, systematic-debugging, writing-plans, executing-plans — by reference from `~/.pi/agent/vendor/superpowers` (each verified framework-free: 0 `@`-commands). The superpowers Pi extension (hooks/commands flow) is NOT adopted.
- Alternatives: Adopt the full framework extension — rejected: its session-start hook flow couples to the whole system and adds surface without a proven need.
- Rationale: The methodology is the value; the framework is optional complexity. "Adapt before Adopt."

### D20 — Workflow consolidation and retirement executed

- Date: 2026-08-03
- Context: D17 chose pi-dynamic-workflows over pi-subagents; review duplication existed between the review template and the uninstalled Codex review suite.
- Decision: (a) pi-subagents retired — removed, registry row marked deprecated/retired. (b) dynamic-workflows adopted — launch validated (survey → fan-out → synthesis; completion async by design). (c) review template consolidated into the four-dimension Codex-derived methodology (correctness, security, breaking/scope, testing) deployed as `capabilities/prompts/review.md`.
- Alternatives: Keep pi-subagents installed alongside dynamic-workflows — rejected: duplication without benefit.
- Rationale: One workflow engine, one review methodology, minimal overlap — the Phase 3 consolidation principle.

### D21 — Pending validations completed

- Date: 2026-08-03
- Context: Wave-1 items remained pending: pdf functional conversion and license verification.
- Decision: pdf skill functionally validated end-to-end (real text extracted via pypdf; host deps `pypdf`, `reportlab` added); all 7 relevant package licenses verified MIT (registry updated). Interactive-dependent validations (plan-mode enforcement, ask-user prompting, pi-simplify, pi-lens) are load-validated and marked interactive-by-design.
- Alternatives: Defer — rejected: the evidence was obtainable.
- Rationale: Validation-before-promotion; honest statuses where interactive-only.

### D22 — Engineering Intelligence Layer v1 established

- Date: 2026-08-03
- Context: Milestone 8 mandate — build the first version of the intelligence layer without a separate engine (architecture design rule: intelligence = workflow composition).
- Decision: Implemented as platform-owned artifacts: `capabilities/skills/repository-intelligence/` (repo analysis protocol) and five prompt templates (`workflow`, `decide`, `plan-next`, `review-architecture`, `self-eval`), plus the orchestration rules, context strategy, and self-evaluation framework recorded in `docs/ARCHITECTURE.md`.
- Behaviorally validated 2026-08-03: repository-intelligence (full repo analysis produced), plan-next (correctly audited the uncommitted state and flagged missing registry rows + premature validation claim), decide (evidence-based browser-decision analysis). self-eval: load-validated; behavioral run interrupted by environment — pending (its dimensions were partially exercised by the plan-next audit).
- Alternatives: Build a dedicated decision engine service — rejected: violates the design rule; adds infrastructure without measured value.
- Rationale: The layer assists judgment via validated, composable protocols — no new architecture.

### D23 — Browser decision review (challenge confirmed)

- Date: 2026-08-03
- Context: The `/decide` protocol re-evaluated D17's playwright preference against current evidence.
- Decision: Keep chrome-devtools. D17's gate ("concrete E2E need") is not met — this repository contains no application under test; D13 had already rejected playwright for the same reason; token-economy claims are contested by conflicting benchmarks. chrome-devtools license verified Apache-2.0 (registry updated). Playwright swap remains gated on a demonstrated E2E need.
- Alternatives: Swap now, or run both — rejected: cost without need, and duplication violates the consolidation principle (D20).
- Rationale: Challenge assumptions with evidence; a prior decision (D17 preference) is refined without a new dependency, and no change is needed to DECISIONS/decision rules — the gate already encoded this outcome.


### D24 — Intelligence layer self-evaluation (autonomous DECISIONS write)

- Date: 2026-08-03
- Context: First `/self-eval` run. The working tree contained the intelligence-layer v1 artifacts (five prompts + `repository-intelligence` skill, deployed to `~/.pi/agent/prompts/` 8/8 in sync) and an `ARCHITECTURE.md` Phase 6 edit claiming "implemented Milestone 8", but the capture loop was open: no registry rows, no CHANGELOG entry, no decision entry, `PROJECT_STATE.md` still "In Flight: Nothing".
- Decision: (a) Adopt the intelligence-layer v1 artifacts as platform assets (registry rows + CHANGELOG entry follow in the same session per the capture loop). (b) Resolve the Milestone-8 numbering conflict (ARCHITECTURE.md calls this "M8" while ROADMAP defined M8 as Wave 3) in favor of ROADMAP's numbering; register or remove the unregistered `firecrawl` reference in orchestration rule 3.
- Alternatives: (a) Leave the artifacts deployed but undocumented — rejected: silent deployment violates the capture loop and the registry single-source rule. (b) Renumber Wave 3 — rejected: ROADMAP owns milestone numbering; the architecture section is the newcomer.
- Rationale: The repository's value is reflecting reality; the capture loop and registry are its enforcement mechanisms, and this evaluation surfaced their first live gap.
- Resolution (2026-08-03, M8 close): both recommendations executed — ROADMAP now numbers the intelligence layer as Milestone 8 and Wave 3 as Milestone 9; orchestration rule 3 no longer references the unregistered `firecrawl` (see `docs/ARCHITECTURE.md`). This entry was written by the self-evaluation run itself, demonstrating the layer's assisted-governance behavior; it was renumbered to D24 on reconciliation.

### D25 — Wave 3 integration decisions (curation over quantity)

- Date: 2026-08-03
- Context: Milestone 9 scope listed four advanced capabilities; each required justification and validation before integration.
- Decision: (a) **memory MCP integrated and validated** — keyless, reference-quality, pairs with the engineering memory strategy (D27). (b) **GitHub MCP deferred** — requires PAT provisioning (user action) plus a Windows prebuilt-binary install; no demonstrated PR/issue workflow need yet. (c) **piolium deferred** — sandbox host requirement unmet on this machine and 0.0.x maturity; re-evaluate when a containerized environment exists. (d) **pi-background-tasks deferred** — duplicates the dynamic-workflows orchestration/background role; the consolidation principle (D20) and one-engine-per-role rule reject it. (e) **playwright swap remains gated** (D23).
- Alternatives: Integrate all four — rejected: two lack credentials/host prerequisites, one duplicates an existing engine, none demonstrated need.
- Rationale: Quality over quantity; every deferred item has a recorded trigger for re-evaluation (registry Notes).

### D26 — Engineering quality metrics baseline

- Date: 2026-08-03
- Context: The `/metrics` protocol's behavioral run was degraded by the environment (output lost); the manifest itself is the deliverable.
- Decision: Compute the eight metrics directly from repository evidence (no model needed): maturity 79% (22/28 active), validation coverage 89% (25/28 PASS-validated), 24 decision entries, 13 open carried items, 0 broken links/orphans (scan), 4 deferred candidates, 1 UNVERIFIED license remaining (pi-plan-mode). Baseline recorded in the M9 report; `/metrics` remains available for future automated computation.
- Alternatives: Re-run until the environment cooperates — rejected: the numbers are deterministic arithmetic on repository state.
- Rationale: Evidence over ceremony; the metric values are what matters, not the channel.

### D27 — Engineering memory strategy adopted

- Date: 2026-08-03
- Context: Milestone 9 requires a production-ready engineering memory strategy; the memory MCP server is now integrated (D25).
- Decision: Layered strategy — repository (permanent, primary: DECISIONS/registry/SETUP/CHANGELOG via capture loop), project memory (`AGENTS.md` per working repo), session-scale scratch (memory MCP: transient entities/relations/observations; never personal, never credentials). Promotion rule: facts become repository entries the same session they become decisions or validated results; the memory store is never authoritative. Protocol: `/memory` template.
- Alternatives: Use the memory MCP as the primary store — rejected: violates Repository First; the repository is the source of truth.
- Rationale: Memory assists, never replaces, the repository (recorded in `docs/ARCHITECTURE.md`).

### D28 — Verification script adopted (lightweight, no CI)

- Date: 2026-08-03
- Context: Milestone 10 production hardening requires automated verification without CI complexity.
- Decision: Adopt `capabilities/scripts/verify.py` (Python stdlib only, no network, no dependencies) — checks markdown links, orphans, secret patterns in tracked files, structure conformance, registry shape (10 columns, unique names), DECISIONS numbering, TODO section hygiene. Run before every commit (CONTRIBUTING). First run caught the D24 ordering defect; all checks green after the fix.
- Alternatives: Full CI pipeline — rejected: violates the platform's own non-goals (no CI, D9/M5); this host has no runner.
- Rationale: A 150-line deterministic script replaces ad-hoc milestone scans; robustness over feature growth.

### D29 — Production hardening decisions

- Date: 2026-08-03
- Context: Hardening review of the only code file and the safety surfaces.
- Decision: (a) power-tools.ts type-check deferred — runtime smoke evidence exists (tools validated behaviorally 08-02); static type-checking requires module resolution against the global pi packages, which is fragile outside a repo-local dev setup; revisit with a dev setup (TODO). (b) Permission configuration remains host-side (`~/.pi/agent/extensions/.../config.json`), described not stored in the repository (secrets policy, D2/D3). (c) Memory MCP storage confirmed outside the repository (no `memory.json` in the tree). (d) Secret scanning now enforced by the verify script (D28).
- Alternatives: Add a dev toolchain to the repository for type-checking — rejected: adds dependency surface without a current consumer need.
- Rationale: Honest evidence-based hardening; the two real risks (secrets, consistency) get automated guards, the cosmetic one (type-check) gets a trigger.
- Resolution (2026-08-21): item (a) closed — strict type-check executed zero-footprint (TypeScript 7.0.2 via ephemeral `npx`; module resolution mapped to the global pi installation's bundled type declarations; no repo-local dev setup added). PASS, no findings; the fragility concern did not materialize.

### D30 — Foundation certification and transition to Continuous Evolution

- Date: 2026-08-03
- Context: Milestone 10 concludes the foundational phase; the platform must transition from construction to evolution.
- Decision: Certified per the M10 engineering certification (report): architecture stable, governance mature, maintainability acceptable, overengineering under control. From this milestone on: no predefined construction milestones; changes enter via the capability lifecycle, capture loop, and trigger-based integrations, driven by real engineering needs. Stable core: architecture, governance, lifecycle, registry, ownership matrix. Evolving: capabilities, intelligence versions, prompts, templates. Experimental features: isolated until validated (Wave-4 rule). Versioning: constitution v1.x via amendment; capability pins in the registry.
- Alternatives: Continue milestone-driven construction — rejected: the platform is built; further construction would be feature growth without need.
- Rationale: The certification is evidence-based; evolution-by-need is the long-term sustainability posture.

### D31 — Repository consumption scope resolved: single primary environment

- Date: 2026-08-21
- Context: Open question (carried since Milestone 2 in `PROJECT_STATE.md` and `NEXT_SESSION.md`): whether other machines or agents consume this repository as their source of truth. It could not be determined from repository evidence and required user input. Consumption scope calibrates governance: multiple consumers would require stability guarantees, deprecation notice practices, and change coordination.
- Decision: Resolved per user input (2026-08-21): the repository is the single source of truth for **one primary Harness Pi environment**; no other machines or AI agents actively consume it as their source of truth. Governance remains single-consumer: no stability/deprecation contract beyond the capture loop; ownership matrix, registry schema, and lifecycle unchanged. Re-open trigger: a second machine or agent begins consuming the repository as its source of truth — then revisit change-notice and cold-install cadence practices.
- Alternatives: (a) Assume multi-consumer and add stability machinery (versioned contracts, deprecation windows) — rejected: complexity without a demonstrated need (Never Overengineer); (b) leave the question unresolved — rejected: governance calibration was blocked on it.
- Rationale: Governance scope is now recorded from authoritative input rather than assumption; the re-open trigger keeps the decision honest if reality changes.

### D32 — MCP server version pinning executed (architecture compliance)

- Date: 2026-08-21
- Context: An audit of the live runtime and repository assets during the Continuous Evolution capability assessment identified that all four configured MCP servers (`chrome-devtools`, `sequential-thinking`, `context7`, `memory`) were configured with unpinned commands (`@latest` or unversioned npx commands). This contradicted the governance rule in `docs/ARCHITECTURE.md` Phase 4 ("capabilities pinned at integration") and introduced supply-chain and reproducibility risks.
- Decision: Pin all four MCP servers to concrete, verified versions in both the live configuration (`~/.config/mcp/mcp.json`) and repository fragments (`capabilities/mcp/*.md`): (a) `chrome-devtools-mcp@1.7.0` (Apache-2.0, 29 tools discovered), (b) `@modelcontextprotocol/server-sequential-thinking@2026.7.4` (MIT, tool call verified), (c) `@upstash/context7-mcp@4.0.3` (MIT, library search tool call verified), (d) `@modelcontextprotocol/server-memory@2026.7.4` (MIT, entity creation tool call verified). Created missing server note `capabilities/mcp/memory.md` and updated `docs/SETUP.md` and `capabilities/index.md`.
- Alternatives: (a) Retain `@latest` pulls — rejected: leaves runtime vulnerable to breaking changes and upstream drift; (b) pin to historical cache versions without verification — rejected: latest stable releases were verified healthy and functioning via direct JSON-RPC stdio testing.
- Rationale: Closes the gap between architecture mandate and live reality; guarantees reproducible MCP behavior across sessions while preserving the single-proxy adapter architecture.

### D33 — Runtime Abstraction Layer v1 adopted (runtime-orchestrator extension)

- Date: 2026-08-22
- Context: The runtime simplification audit (2026-08-21) identified that the platform's biggest operational friction was the manual sync between the Blueprint Control Plane and the Pi runtime, plus zero automatic project context at session start. The audit proposed a Runtime Abstraction Layer (RAL) implemented as a minimal Pi extension, not a new daemon or framework.
- Decision: Implement RAL Phase 1 as `capabilities/extensions/runtime-orchestrator.ts`: (a) `session_start` hook for project topology detection and 9router supervision; (b) `before_agent_start` hook for minimal workspace context injection (~30–50 tokens); (c) `/doctor` command for runtime health diagnostics. Zero external dependencies (Node.js stdlib only). TypeScript strict type-check PASS (TS 7.0.2). Deployed to `~/.pi/agent/extensions/runtime-orchestrator.ts`. Phase 2 (`/sync` command) and dynamic skill activation are explicitly deferred.
- Alternatives: (a) Extend `power-tools.ts` with orchestrator behaviour — rejected: power-tools owns `repo_tree`/`git_log` tools; mixing runtime lifecycle orchestration into it conflates two distinct ownership contracts; (b) build a separate background daemon — rejected: the architecture audit rule "no new daemons"; (c) implement the full RAL at once — rejected: Phase 1 only delivers the minimum needed to prove the lifecycle hook pattern before adding sync/skill-activation complexity.
- Rationale: The extension lifecycle APIs (`session_start`, `before_agent_start`, `registerCommand`) are exactly the hooks needed. A single ~300-line TypeScript file with zero dependencies closes the biggest daily-ergonomics gap without touching the governance layer.

### D34 — RAL v1 Phase 2 adopted: /sync one-way asset deployment engine

- Date: 2026-08-22
- Context: While RAL Phase 1 solved startup ergonomics and project awareness, changing an asset in the Blueprint repository still required manual file copying into `~/.pi/agent/` to take effect in the runtime.
- Decision: Implement RAL Phase 2 one-way asset synchronization directly inside `capabilities/extensions/runtime-orchestrator.ts` via the `/sync` command and `executeSync()` engine: (a) strictly one-way (Blueprint → `~/.pi/agent`); (b) explicit allowlist scope (`capabilities/prompts/*.md`, `capabilities/extensions/*.ts`, `capabilities/skills/repository-intelligence`); (c) SHA256 content hash drift detection comparing source, runtime, and previous baseline (`sync-state.json`); (d) safe conflict handling (local runtime changes are preserved and flagged as conflicts unless `--force` is provided); (e) protected file isolation (`auth.json`, `models.json`, `settings.json`, `mcp.json`, `sessions/` are never overwritten); (f) dry-run preview by default, execution via `/sync --apply`. Integrated sync status checks into `/doctor`.
- Alternatives: (a) Standalone Python script (`sync.py`) — rejected: having `/sync` inside the Pi extension enables in-session 1-command reconciliation without leaving the editor, while reusing the same TypeScript codebase; (b) bidirectional sync — rejected: violates the Repository First principle (the runtime must never become an unvetted source of truth); (c) blind copying without drift detection — rejected: would silently destroy local experimental edits without warning.
- Rationale: Eliminates the last manual copy-paste bottleneck between Control Plane and Runtime Plane while strictly enforcing safety, inspectability, and Blueprint single-source governance.
