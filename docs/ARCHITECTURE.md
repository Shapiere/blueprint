# Platform Architecture

## Purpose

Architecture reference for the Harness Pi AI Engineering Platform, adopted 2026-08-03 (Milestone 6, decision D15). This document owns the platform architecture: layers, repository structure, capability lifecycle, governance model, integration architecture, intelligence design, and evolution strategy. It was delivered as the Milestone 5.5 report and is now the governing architecture reference.

## Design Principles Applied

Repository First · Engineering over Hype · Simplicity · Practicality · Small Iterations · Maintainability · Never Overengineer · Quality over Quantity · Curate First, Build Second · Validate Before Integration · Long-Term Maintainability.

The architecture is deliberately **minimal**: it adds one reference document and one asset tree to the existing repository, and it makes no new tooling or infrastructure mandatory.

---

# Phase 1 — Platform Architecture

## Core Layers

```text
+---------------------------------------------------------------+
|  1. GOVERNANCE LAYER   (blueprint repository)                 |
|     Constitution · Decisions · Success Criteria · Ownership   |
|     Matrix · Capture Loop · Capability Lifecycle · Registry   |
|  Responsibilities: rules, memory, curation, quality gates     |
+---------------------------------------------------------------+
                          | constrains / records
                          v
+---------------------------------------------------------------+
|  2. RUNTIME LAYER      (Pi 0.83.0 + host)                     |
|     Pi CLI · 9router service · models.json · settings.json    |
|     permission gates · auth (secrets, never in repo)          |
|  Responsibilities: execution substrate, model routing, tools  |
+---------------------------------------------------------------+
                          | hosts (on demand)
                          v
+---------------------------------------------------------------+
|  3. CAPABILITY LAYER   (in-process + out-of-process)          |
|     Extensions (tools/commands) · Skills (progressive         |
|     disclosure) · MCP servers (lazy, proxy tool) ·            |
|     Prompt templates · Automation scripts                     |
|  Responsibilities: capability supply with context economy     |
+---------------------------------------------------------------+
                          | composes
                          v
+---------------------------------------------------------------+
|  4. INTELLIGENCE LAYER (workflow + methodology)               |
|     Orchestration (parallel agents, model tiers) ·            |
|     Methodology skills (plan/debug/review/TDD) ·              |
|     Memory strategy (AGENTS.md / sessions / registry) ·       |
|     Research workflows                                        |
|  Responsibilities: engineering reasoning — the "AI Software   |
|  Engineer" behavior, not a pile of tools                      |
+---------------------------------------------------------------+
                          ^ gates every transition
                          |
+---------------------------------------------------------------+
|  5. VALIDATION LAYER   (evidence)                             |
|     Smoke-test gates · Success criteria C1–C5 · Permission    |
|     policy · cold-install test · capture-loop audit           |
|  Responsibilities: nothing enters the platform unverified     |
+---------------------------------------------------------------+
```

## Layer Responsibilities & Relationships

- **Governance → Runtime:** policy (secrets, trust, permission posture), decisions on models/config.
- **Runtime → Capability:** Pi loads capabilities on demand (skills index in system prompt, MCP lazy start, extensions registered).
- **Capability → Intelligence:** methodology skills and orchestration workflows *compose* capabilities into engineering behavior.
- **Validation ↔ all:** the integration gate sits between Capability and Runtime; periodic validation (last-verified, success criteria) audits every layer.

## Data & Context Flow

1. User request → Runtime (Pi).
2. Context assembly: system prompt (skills index, tool schemas, project memory from `AGENTS.md`) — progressive disclosure keeps it lean.
3. Capability resolution: model selects tool/skill/MCP proxy on demand; MCP servers start lazily.
4. Execution → results returned; heavy outputs stay out of context (bounded logs, script-variable intermediates).
5. Capture loop: any platform/setup change flows back to Governance (inventory, changelog, decisions) in the same session.

## Capability & Decision Flow

- Capability flow: Discovery → Benchmark → Evaluation → Adaptation → Integration → Validation → Maintenance → Deprecation (Phase 3).
- Decision flow: capability decisions → `DECISIONS.md`; runtime decisions → model + workflows; architectural decisions → constitution amendments (gated).

---

# Phase 2 — Repository Structure

## Principle

Assets that are **ours** (adapted skills, prompts, scripts, extensions, workflow definitions) are versioned in the repository and deployed to the runtime; **configuration that embeds secrets or drifts** (settings.json, auth.json, models.json) stays described only (decision D3). One new top-level folder; one new governance document.

## Target Structure (proposal for constitution v1.2 — NOT yet in effect)

```text
README.md                  purpose, quickstart
AI_CONTEXT.md              agent onboarding (unchanged)
CONTRIBUTING.md            + capability governance rules (Phase 4)
CHANGELOG.md               history (unchanged)
PROJECT_STATE.md           status (unchanged)
ROADMAP.md                 milestones (unchanged)
NEXT_SESSION.md            handoff (unchanged)
.gitignore                 secrets policy (unchanged)
docs/
  BOOTSTRAP_SPEC.md        constitution (amended to v1.2: adds the two
                           structure entries below + ownership rows)
  ARCHITECTURE.md          NEW — this report; single architecture reference
  VISION.md, DESIGN_PRINCIPLES.md, SUCCESS_CRITERIA.md,
  DECISIONS.md, SETUP.md   (unchanged)
capabilities/              NEW — platform asset tree (M6+)
  index.md                 capability registry: name, source, version,
                           category, status (adopted/adapted/pending/
                           deprecated), owner, license, last-verified,
                           validation result
  skills/                  owned copies of adapted skills (one dir each)
  prompts/                 prompt templates (source of deployed copies)
  workflows/               workflow definitions and orchestration config
  scripts/                 automation (ast-grep codemods, sync helpers)
  mcp/                     mcp.json fragments + per-server notes (no secrets)
  extensions/              home-grown extensions (power-tools and successors)
  agents/                  subagent type definitions (when adopted)
implementation/
  TODO.md                  (unchanged)
```

## Directory Responsibility Rules

- `docs/ARCHITECTURE.md` — owns the architecture (this report); the only new governance document. Lifecycle and governance details live here rather than in new files (quality over quantity).
- `capabilities/index.md` — owns the capability registry (single source for what is deployed, at what version, with what validation).
- `capabilities/*` — assets are versioned here, deployed by the copy-to-own-tree pattern (skills) or `pi install` with pinned refs (extensions); runtime paths stay in `docs/SETUP.md` (never duplicated).
- No other new folders without a decision entry.

---

# Phase 3 — Capability Lifecycle

| Stage | Entry criteria | Exit criteria |
|---|---|---|
| **1. Discovery** | Gap identified in gap analysis (lifecycle-category review) | Candidate list with primary sources, verified (M4 pattern) |
| **2. Benchmark** | Candidate verified | Score + classification (ADOPT/ADAPT/INSPIRE/REJECT) with evidence (M5 pattern) |
| **3. Evaluation** | Benchmark complete | `DECISIONS.md` entry: decision, alternatives, rationale, license note |
| **4. Adaptation** | ADAPT decision | Adapted artifact in `capabilities/`, harness-specific bits stripped, license header, no secrets |
| **5. Integration** | Adapted artifact ready | Deployed to runtime (settings/mcp.json/`pi install`, pinned) |
| **6. Validation** | Deployed | Smoke test PASS; success-criterion check (C4 context, C5 secrets); `SETUP.md` + registry updated same session (capture loop) |
| **7. Maintenance** | Validated | `last-verified` refreshed; updates via `pi update --extensions`; owner recorded in registry |
| **8. Deprecation** | Fails validation / superseded / unused for a documented period | Removed from runtime + registry; `DECISIONS.md` + `CHANGELOG.md` entries; rationale recorded |

Rules: no stage may be skipped; a capability is **pending** in the registry until validation passes; deprecation requires a decision entry, never silent removal.

---

# Phase 4 — Governance Model

- **Quality standards:** ADOPT requires benchmark overall ≥ 7.0; ADAPT requires a defined adaptation plan (keep/remove/rewrite/simplify/integrate). License policy: OSI licenses preferred; source-available documented and permitted for personal use (anthropics doc skills); CC BY-SA requires attribution (trailofbits).
- **Review process:** five gates per capability — evidence (verified sources), license, context economy (C4), secrets (C5), duplication (ownership matrix + registry conflict check). Reviewer: the integrating session's verification pass (smoke test + registry audit).
- **Acceptance criteria:** smoke test passes; registry row complete; `SETUP.md` section updated; `CHANGELOG.md` entry; success criteria unaffected or improved.
- **Versioning:** capabilities pinned at integration (npm version or git ref); registry records the pin; `pi update --extensions` reconciles unpinned refs; registry `last-verified` tracks currency.
- **Documentation requirements:** decision entry at adoption; registry row; inventory section; changelog entry — all in the same session (capture loop).
- **Capability ownership:** registry `owner` field (session/agent responsible for maintenance); user owns goals and final decisions.
- **Deprecation policy:** triggers (validation failure, supersession, documented non-use), removal procedure (runtime → registry → decisions → changelog), records retained.

---

# Phase 5 — Integration Architecture

| Asset type | Integration boundary | Dependency management | Compatibility rules | Validation checkpoint |
|---|---|---|---|---|
| **Skills** | Copy-to-own-tree → `capabilities/skills/` → settings `skills` | No runtime deps beyond documented scripts | Standard SKILL.md frontmatter; no harness-specific side files; license header | Skill loads; invocation smoke test |
| **MCP servers** | `capabilities/mcp/` fragment → `~/.config/mcp/mcp.json` | npx/uvx pinned or versioned command | stdio transport (adapter-safe); env-var keys only; Windows npx resolution | First-use tool call (lazy start) |
| **Extensions** | `pi install` (pinned) or local `capabilities/extensions/` | Minimal deps (benchmark D score); bundle or pin | Pi version floor (≥0.80.6 where required); Node ≥22.19; permission policy | Primary command/tool smoke test |
| **Automation scripts** | `capabilities/scripts/` → invoked via bash tool or extension wrapper | Self-contained; pinned tool versions (e.g., ast-grep) | No secrets; explicit paths (Windows drive-letter rule) | Script run on a test repo |
| **Prompt workflows** | `capabilities/prompts/` → `~/.pi/agent/prompts/` | None | Template argument syntax; ownership matrix | Template expands correctly |
| **External repositories** | Vendor into `capabilities/` (adapted assets) or git-source pin | Pinned ref; license recorded | Review before vendor; strip harness bits | Diff review + smoke test |

**Conflict resolution (pre-integration, mandatory):** subagent layer (pi-subagents vs dynamic-workflows), browser server (chrome-devtools vs playwright), Brave key placement (skill vs pi-web-access). Each requires a decision entry before both sides may coexist.

---

# Phase 6 — Platform Intelligence Architecture

Intelligence is designed as **workflow composition over the capability layer** — no separate "intelligence engine" is built; the platform becomes an AI Software Engineer by composing validated capabilities:

| Intelligence function | Architecture (capabilities + flow) |
|---|---|
| Repository understanding | repo_tree + fffind + `/codebase-audit` + worktree isolation; context kept lean via script-variable intermediates |
| Architecture review | `/codebase-audit` + piolium recon phases (partial); open gap until a dedicated capability passes the benchmark |
| Code review | Consolidated review suite (Codex dimensions + our template) → `/code-review` orchestration → verification-before-completion gate |
| Planning | todo overlay + plan mode (enforced read-only) + writing/executing-plans skills; structured questioning for requirements |
| Refactoring | ast-grep codemod scripts + TDD verification loop; stale-anchor edit awareness in power-tools |
| Debugging | systematic-debugging methodology; debugger integration deferred (open gap, no passing candidate) |
| Research | context7 (docs) + firecrawl (web) + `/deep-research` (orchestrated, journaled resume) |
| Technical decision making | DECISIONS discipline applied at code level via a prompt workflow (ADR-style entries in project repos) |
| Context management | Progressive disclosure + lazy MCP + sequential-thinking + bounded outputs; token-cache concept reserved for when context cost becomes measurable |
| Memory strategy | Layered: project (`AGENTS.md`) / session (sessions dir) / platform (registry + decisions) / long-term (memory MCP, Wave 3) |

**Design rule:** every intelligence function maps to a *composition* of capabilities, each of which passed the lifecycle gates. If a function cannot be composed from validated capabilities, it is a gap — not a reason to build custom infrastructure.

## Engineering Intelligence Layer v1 (implemented Milestone 8, 2026-08-03)

The first version is implemented as composed capabilities plus platform-owned artifacts — no separate engine (design rule).

**Responsibilities:** repository understanding, workflow selection, technical decisions, planning, review (code/architecture/repository/docs), context assembly, periodic self-evaluation. **Decision boundaries:** the layer recommends and orchestrates; the human owns goals; the validation layer gates every action.

**Orchestration rules (task class → capability chain):**

1. Plan/implement → plan mode → todo overlay → TDD skill → verify.
2. Debug → systematic-debugging skill → sequential-thinking for weak-model reasoning.
3. Research → context7 (docs) → pi-web-access (web, once keyed) → /deep-research (orchestrated).
4. Review (staged) → consolidated four-dimension review (`/review`).
5. Architecture / repo analysis → repository-intelligence skill → `/review-architecture`.
6. Audit / repository risk → /codebase-audit or piolium (risk-gated).
7. Documentation → document-processing skills → docs-changelog pattern.

**When a capability should NOT be used:** the task is smaller than the capability's cost (no /deep-research for a rename); the capability is unvalidated (`installed` status); the action is privileged and not permitted by policy; context cost exceeds the task's value (criterion C4).

**Orchestration v2 rules (2026-08-03):** (a) redundancy detection — never load a second capability that duplicates a role already in the chain (one orchestration engine, one browser server, one background-task mechanism); (b) loading budget — prefer the chain with the fewest always-loaded capabilities; lazy/on-demand loading wins ties; (c) explainability — every selection states the rule that fired (implemented in `/workflow` v2); (d) coordination — parallel-friendly chains run independent stages concurrently (dynamic-workflows) only when results are order-independent; (e) ordering optimization — evidence-gathering stages precede decision stages; validation gates follow every mutating stage.

**Context flow:** AGENTS.md (project) → repo (skills index, names only) → load bodies on demand → registry/decisions for platform state; never load whole repositories; bounded outputs (script-variable intermediates).

**Self-evaluation framework (periodic):** run `/self-eval` at milestone close or when repository health indicators degrade; assess five dimensions — capability quality, workflow effectiveness, governance compliance, architecture compliance, repository health; record recommendations in `DECISIONS.md`.

**Intelligence artifacts (platform-owned):** `capabilities/skills/repository-intelligence/` · `capabilities/prompts/{workflow,decide,plan-next,review-architecture,self-eval,debug,perf,metrics,memory}.md`. Validation 2026-08-03: repository-intelligence (v1+v2), plan-next, decide behaviorally validated; self-eval behavioral run pending (environment-interrupted, dimensions covered by plan-next audit); debug/perf/metrics/memory load-validated — see `capabilities/index.md` and D22.

**Engineering Memory Strategy (v1, 2026-08-03):** layered — repository (permanent, primary: DECISIONS/registry/SETUP/CHANGELOG via the capture loop), project memory (`AGENTS.md` per working repo), session-scale scratch (memory MCP: transient facts, entities/relations/observations, never personal, never credentials). Promotion rule: facts become repository entries the same session they become decisions or validated results; the memory store is never the authoritative copy. Protocol: `/memory`.

**Engineering Quality Metrics (v1, 2026-08-03):** eight metrics with explicit purposes — repository health (scan results, git cleanliness), capability maturity (active/total), validation coverage (validated/registered), governance compliance (DECISIONS currency), documentation completeness (structure conformance), architecture compliance (structure vs matrix), tech-debt trend (carried items + UNVERIFIED licenses), intelligence coverage (validated intelligence artifacts). Computed by `/metrics`; trends from CHANGELOG/TODO history. Metrics drive recommendations only when they signal action.

## Runtime Abstraction Layer v1 (implemented 2026-08-22, D33–D36)

The RAL bridges the Control Plane and the daily coding Runtime Plane. Implemented as a single platform-owned Pi extension (`capabilities/extensions/runtime-orchestrator.ts`) — no new daemon, no new framework, no new process manager.

**Responsibilities (Phases 1–4):**
- `session_start` hook: detect project topology from workspace manifest files; probe 9router health; attempt auto-start if offline; set status bar with project name + type.
- `before_agent_start` hook (every turn): inject minimal workspace context string (~30–50 tokens) AND perform per-turn capability scoping — rebuild the `<available_skills>` section of the system prompt so only skills relevant to the detected project profile remain visible (D35). Fail-open on any scoping failure.
- `/doctor` command: diagnostic scan of Pi runtime, 9router, MCP configuration, permission system, core extensions, sync status, and capability scoping state (Profile / Active / Available / Evidence / Governance).
- `/sync` command (D34): deterministic one-way asset deployment from Blueprint (`G:/pisetup`) to runtime (`~/.pi/agent/`). SHA256 drift detection; conflicts block silent overwrites unless `--force`; protected files never touched. Allowlist includes `capabilities/scopes.json` (deployed to `~/.pi/agent/scopes.json` for `/doctor` reads).
- Dynamic model catalog bridge (Phase 4, D36): registers provider `"9router"` via Pi-native `pi.registerProvider` with a `refreshModels` implementation that fetches `/v1/models` and maps entries deterministically — `/model` then reflects the live router catalog. `models.json` and `auth.json` are never read/written by this path; refresh errors are isolated by Pi's per-provider handling and preserve the previous usable catalog; offline context serves store-only.

**Capability scoping model (Phase 3, D35):** `capabilities/scopes.json` is a Blueprint-owned tag map (`core` floor + per-skill domain tags). Resolution is deterministic and in-memory: ACTIVE = CORE ∪ {skills whose tags ∩ project profile ≠ ∅}; everything else AVAILABLE (hidden from the default index but invocable via native `/skill:<name>`). The project provides evidence only — it can never authorize, install, or register capabilities. Scoping failure degrades fail-open to today's behavior (all visible).

**Model catalog mapping (Phase 4, D36):** router fields map directly (`id`, `context_length → contextWindow`, `max_completion_tokens → maxTokens`, `capabilities.reasoning`, `capabilities.vision → input image`); cost is constant zero (no pricing source); only canonical pi-ai thinkingFormats pass through into `compat.thinkingFormat` — non-canonical router formats are omitted rather than fabricated. Only provider id `"9router"` is registered; user-defined custom models belong in a separate provider id that RAL never touches.

**Project detection:** `package.json` → TypeScript/JS + framework (Next.js, React, Remix, Astro, Vue, Svelte, NestJS, Hono, Fastify, Express, Vite); `Cargo.toml` → Rust (Axum, Actix, Tokio); `pyproject.toml`/`requirements.txt` → Python (FastAPI, Django, Flask, PyTorch, TensorFlow); `go.mod` → Go (Gin, Fiber, Echo); `default.project.json` → Roblox Studio / Luau / Rojo; `.git/HEAD` → branch. Generic fallback otherwise.

**Sync scope (strict allowlist):** `capabilities/prompts/*.md`, `capabilities/extensions/*.ts`, `capabilities/skills/repository-intelligence/`, `capabilities/scopes.json`. Protected runtime files (`auth.json`, `models.json`, `settings.json`, `oauth.json`, `mcp.json`, `sessions/`) are never overwritten.

**What the RAL does NOT do:** task-aware activation (deferred), bidirectional sync, MCP enable/disable automation, capability registry modification, permission override, durable skill-file mutation, `models.json` writes, polling loops.

---

# Phase 7 — Evolution Strategy

- **Short-term (Milestone 6 — Wave 1 Integration & Registry Launch):** adopt constitution v1.2 (ARCHITECTURE.md + capabilities/ structure); launch registry; integrate Wave 1 (todo overlay, path protection, plan mode, pi-fff, sequential-thinking + context7 MCP, anthropics doc skills); smoke-test each; capture loop. Decide: subagent layer, browser server (these gate Wave 2, decided early in M6 research-free review).
- **Medium-term (Milestones 7–8 — Wave 2):** full permission gates; superpowers methodology port (TDD, systematic-debugging, plans); review suite consolidation; dynamic-workflows core (+/code-review, /deep-research, /codebase-audit); structured questioning; simplify pass. Intelligence layer enters daily use.
- **Long-term (Milestones 9+ — Wave 3 + intelligence deepening):** piolium (sandboxed), GitHub MCP, memory MCP, background tasks; then close open gaps by *new capability discovery* (debugging integration, architecture review, performance profiling, prompt evals) — each through the same lifecycle. Platform goal: a maintained AI Software Engineer whose every capability is curated, validated, and documented.

---

# Phase 8 — Risk Assessment

| Risk | Mitigation |
|---|---|
| Overengineering | Constitution gates; benchmark thresholds; no new layers/folders without a decision entry; this architecture adds 1 doc + 1 folder |
| Capability duplication | Registry + ownership matrix; mandatory pre-integration conflict checks (subagent, browser, Brave key) |
| Maintenance burden | Pinned versions; `last-verified` currency; deprecation policy; minimal-dependency benchmark scores |
| Dependency risks | Pin refs; license audit at adoption; `pi update --extensions` reconciliation documented |
| Scalability limits | Progressive disclosure; lazy MCP; proxy tools; script-variable intermediates; context-economy criterion C4 |
| Context bloat | C4 gate on every adoption; token-cache concept reserved for measurable cost; bounded logs |
| Repository complexity | Single new governance doc; one asset tree; registry as the only index |
| Extension security | Permission gates (Wave 2) + path protection (Wave 1); review-before-install; sandboxed piolium |
| Knowledge loss between sessions | Capture loop; registry; ARCHITECTURE.md; AI_CONTEXT onboarding |

---

# Phase 9 — Final Architecture Report

**1. Is the platform architecture ready for capability integration?**
**YES.** The architecture is layered with clear responsibilities, assets have defined homes, the capability lifecycle and governance model are complete, and validation gates exist at every transition. Integration can begin with Wave 1 without further design work.

**2. What architectural decisions are critical before implementation begins?**
(a) **Constitution v1.2 amendment** — add `docs/ARCHITECTURE.md` and `capabilities/` to the structure and ownership matrix (the only structural change; everything else fits existing files). (b) **Capability registry schema** — `capabilities/index.md` fields (name, source, version, category, status, owner, license, last-verified, validation). (c) **Subagent-layer decision** (pi-subagents vs dynamic-workflows) — gates Wave 2 orchestration. (d) **Browser-server decision** (chrome-devtools vs playwright) — gates E2E. (e) **Permission-policy defaults** — path protection first, full gates configured in Wave 2. Decisions (a)+(b) precede any integration; (c)–(e) are scheduled early in M6 without blocking Wave 1 items.

**3. What should become Milestone 6?**
**Milestone 6 — Wave 1 Integration & Registry Launch:** adopt the v1.2 structure (amendment process: DECISIONS + CHANGELOG + version bump); create the registry; integrate Wave 1 capabilities (todo overlay, path protection, plan mode, pi-fff, sequential-thinking + context7, anthropics doc skills); smoke-test each with evidence; record subagent and browser decisions; capture loop; commit and push. Nothing beyond Wave 1.

**4. What implementation order maximizes long-term maintainability?**
Governance first (amendment + registry) → foundations (todo, path protection, plan mode) → low-risk utilities (pi-fff, sequential-thinking + context7) → content capabilities (doc skills, methodology port) → orchestration (dynamic-workflows core + review consolidation, after the subagent decision) → advanced (piolium, GitHub MCP, memory MCP, background tasks). Order is dependency-driven: every layer's foundations validate before the next layer composes them; every integration is recorded the same session.

---

## Notes

- Adopted as `docs/ARCHITECTURE.md` under constitution v1.2. The original report is archived at `G:/blueprint-report/milestone5-5-architecture.md`.
