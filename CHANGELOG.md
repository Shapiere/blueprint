# Changelog

## Purpose

Chronological log of repository and setup changes. This file owns the history; current state lives in `PROJECT_STATE.md`.

## Format

`YYYY-MM-DD` — `type`: summary (details in linked files where useful)

## 2026-08-02

- `feat`: initialize repository foundation (Milestone 1)
- `docs`: adopt Bootstrap Specification v1.1 as the repository constitution ([docs/BOOTSTRAP_SPEC.md](docs/BOOTSTRAP_SPEC.md))
- `docs`: add setup inventory for the Pi environment ([docs/SETUP.md](docs/SETUP.md), last verified 2026-08-02)
- `docs`: add secrets policy and `.gitignore` (audit C2)
- `docs`: record audit dispositions ([docs/DECISIONS.md](docs/DECISIONS.md))
- `docs`: add vision, design principles, success criteria, roadmap, contributing guide
- `docs`: apply milestone 1 audit revisions (broken-link fix, map deduplication, status pointers, ownership leaks, task traceability)
- `docs`: close milestone 1 (audit verdict: approve with minor revisions; revisions applied and verified)
- `docs`: document 9router service startup method (npm global `9router@0.5.45`, manual start via `9router` CLI; no autostart registration — verified 2026-08-02)
- `docs`: validate restore procedure steps 4–5 via fresh-config simulation (`FRESH_OK`, 2026-08-02)
- `docs`: determine remote repository visibility — public (GitHub API)
- `docs`: re-evaluate success criteria with evidence (C1 partially validated; C2/C3/C5 re-validated)
- `docs`: close milestone 2 — validation (verdict: complete with remaining validation items)
- `docs`: add operations and troubleshooting sections to setup inventory (start sequence, health check, updates, auth-shape incident recovery)
- `docs`: document `models.json` provider entry shape (redacted verified example)
- `docs`: record milestone 3 candidate evaluations — no setup additions adopted ([docs/DECISIONS.md](docs/DECISIONS.md) D13, D14)
- `docs`: close milestone 3 — depth (verdict: complete with minor improvements)
- `docs`: adopt platform architecture — constitution v1.2, `docs/ARCHITECTURE.md`, `capabilities/` registry and asset tree ([docs/DECISIONS.md](docs/DECISIONS.md) D15)
- `feat`: integrate Wave 1 capabilities — rpiv-todo, pi-permission-system (path protection), pi-plan-mode, pi-fff, sequential-thinking + context7 MCP, anthropics doc skills (validated 2026-08-03; registry: `capabilities/index.md`)
- `feat`: version platform assets — power-tools extension and prompt templates now sourced from `capabilities/`
- `docs`: record Wave 1 decisions — license-driven skill referencing, subagent/browser-layer decisions (D16, D17)
- `docs`: close milestone 6 — Wave 1 integration (verdict: successful; see completion report)
- `feat`: deepen permission policy with bash deny/ask rules and external-directory guard (Wave 2, validated)
- `feat`: port superpowers methodology skills — test-driven-development, systematic-debugging, writing-plans, executing-plans (D19)
- `docs`: consolidate the review workflow into the four-dimension Codex-derived methodology
- `feat`: adopt pi-dynamic-workflows core and retire pi-subagents (D20)
- `feat`: integrate rpiv-ask-user-question, pi-simplify, frontend-design and skill-creator skills
- `docs`: complete pending validations — pdf functional (pypdf), package licenses verified (MIT)
- `docs`: close milestone 7 — Wave 2 (verdict: successful; see completion report)
- `feat`: establish Engineering Intelligence Layer v1 — repository-intelligence skill, orchestrator rules, five intelligence prompt templates (D22)
- `feat`: validate intelligence layer behaviorally — repository-intelligence (repo analysis), plan-next (state audit), decide (browser decision; D23)
- `docs`: review browser decision with evidence — keep chrome-devtools; playwright stays gated (D23); license verified Apache-2.0
- `docs`: close milestone 8 — Engineering Intelligence Layer (verdict: successful; see completion report)
- `feat`: intelligence v2 — repository-intelligence v2 modules, orchestration v2 rules, debug/perf/metrics/memory protocol templates (D25/D27)
- `feat`: integrate memory MCP server — validated (entity + observation via proxy; D25)
- `docs`: record Wave 3 deferrals with triggers — GitHub MCP, piolium, pi-background-tasks, playwright gate (D25)
- `docs`: record engineering metrics baseline — maturity 79%, validation coverage 89% (D26)
- `docs`: adopt engineering memory strategy — repository primary, memory MCP as session scratch (D27)
- `docs`: close milestone 9 — Wave 3 + Intelligence v2 (verdict: successful; see completion report)
- `feat`: adopt verification script — `capabilities/scripts/verify.py` (stdlib-only; links, orphans, secrets, structure, registry, decisions; D28)
- `docs`: record hardening decisions — power-tools type-check trigger, permission config stays host-side, memory storage outside repo (D29)
- `docs`: certify foundation and transition to Continuous Evolution (D30)
- `docs`: close milestone 10 — Production Hardening & Real-World Readiness (verdict: certified; see completion report)

## 2026-08-21

- `docs`: resolve open question — repository consumption scope: single primary Harness Pi environment, no other machines or agents consume it as their source of truth ([docs/DECISIONS.md](docs/DECISIONS.md) D31)
- `docs`: complete `/self-eval` behavioral run — five-dimension evaluation against repository evidence, all dimensions PASS (registry: `capabilities/index.md`)
- `docs`: complete `/metrics` behavioral run — maturity 88% (29/33 active), validation coverage 94% (31/33 validated); trend up from the D26 baseline (79%/89%)
- `docs`: validate power-tools extension — strict type-check PASS (TypeScript 7.0.2 against the global pi installation's bundled type declarations, zero-footprint; D29 trigger satisfied without a repo-local dev setup)
- `docs`: verify prompt deployment sync — `capabilities/prompts/` ≡ `~/.pi/agent/prompts/` (12/12 identical)
- `docs`: consolidate TODO carried-forward items into the Continuous Evolution section (remove duplication)
- `fix`: correct 9router documented version in setup inventory — 0.5.45 → 0.5.55 (verified installed and active; matches npm latest; health check HTTP 200)
- `fix`: pin all four MCP servers to concrete verified versions — `chrome-devtools-mcp@1.7.0`, `@modelcontextprotocol/server-sequential-thinking@2026.7.4`, `@upstash/context7-mcp@4.0.3`, `@modelcontextprotocol/server-memory@2026.7.4` ([docs/DECISIONS.md](docs/DECISIONS.md) D32)
- `docs`: add missing memory MCP server note fragment (`capabilities/mcp/memory.md`) and update server counts and validation metadata in `docs/SETUP.md` and `capabilities/index.md`

## 2026-08-22

- `feat`: implement Runtime Abstraction Layer (RAL) v1 — `capabilities/extensions/runtime-orchestrator.ts`: `session_start` project topology detection (6 signatures), 9router health probe with auto-start, `before_agent_start` workspace context injection, `/doctor` diagnostic command (D33)
- `feat`: deploy runtime-orchestrator extension to `~/.pi/agent/extensions/runtime-orchestrator.ts` — type-check PASS (TS 7.0.2 strict); `/doctor` validated against live runtime (9router 202 models, 4 MCP servers, permission system, power-tools)
- `docs`: update `docs/ARCHITECTURE.md` with RAL v1 section (Phase 6 Runtime Abstraction Layer)
- `docs`: update `docs/SETUP.md` Extensions section with runtime-orchestrator deployment details
- `docs`: record architectural decision D33 (RAL v1 extension, phase-1 scope, deferred /sync and dynamic skill activation)
- `feat`: implement RAL v1 Phase 2 — `/sync` one-way asset deployment engine inside `runtime-orchestrator.ts` (D34): SHA256 content-hash drift detection, dry-run preview by default (`/sync`), execution mode (`/sync --apply --force`), conflict protection for locally modified runtime files, strict allowlist scope (prompts, extensions, repository-intelligence skill), protected file isolation (auth/models/settings/mcp/sessions)
- `feat`: integrate sync status indicator into `/doctor` — pending drift count reported alongside router/MCP/permission diagnostics
- `docs`: update `docs/ARCHITECTURE.md` RAL section with Phase 2 sync scope and conflict model; update `docs/SETUP.md`; record decision D34 in [docs/DECISIONS.md](docs/DECISIONS.md)
- `feat`: implement RAL v1 Phase 3 — per-turn in-memory capability scoping inside `runtime-orchestrator.ts` (D35, Option E+): `capabilities/scopes.json` Blueprint-owned tag map; `mapTopologyToProfile()` deterministic topology→profile; `resolveCapabilitySets()` ACTIVE = CORE ∪ {tag∩profile}; `renderFilteredSystemPrompt()` rebuilds only `<available_skills>` per turn via supported `before_agent_start` chaining; fail-open on any failure; native `/skill:<name>` escape hatch; `/doctor` extended with Profile/Active/Available/Evidence/Governance; scopes.json added to `/sync` allowlist. No SKILL.md mutation. Validated: 8 profile golden tests PASS, fail-open PASS, cross-project contamination clean, live Next.js profile 9 active / 12 available (~58% index reduction)
- `feat`: implement RAL Phase 4 — Pi-native dynamic model catalog bridge inside `runtime-orchestrator.ts` (D36, Option C): `pi.registerProvider("9router", { refreshModels })` fetches `/v1/models` via the shared transport and maps entries deterministically (id/name, reasoning, vision→input, contextWindow, maxTokens, zero cost; canonical thinkingFormats passthrough, non-canonical omitted); fail-open (malformed entries skipped, empty result falls back to prior stored catalog, offline serves store-only); only provider id "9router" registered; `models.json`/`auth.json` never read or written. Validated: mapping goldens PASS, live catalog 203 mapped vs 85 static, models.json/auth.json hash-unchanged, strict type-check PASS
- `fix`: add model catalog drift warning to `/doctor` — when the session's configured model is absent from the live router catalog, warn with `/model` remediation instead of failing silently on first prompt (follow-up to D36; root cause of observed 404/400 first-prompt failures: configured default model `oc/deepseek-v4-flash-free(max)` no longer served by router upstreams)
- `fix`: correct RAL Phase 4 provider baseUrl derivation — regex stripped `/v1` along with `/models`, registering `http://127.0.0.1:20128` (no `/v1`) so every chat request hit the router's web-UI catch-all and returned its 404 HTML page for every model; now derives `http://127.0.0.1:20128/v1` (exposed as tested `ROUTER_BASE_URL`). Also guards all `session_start`/auto-start UI access with `hasUI` + try/catch so headless (`pi -p`) runs no longer crash on stale extension contexts
- `feat`: implement RAL Phase 5 — complexity-aware orchestration + independent reasoning profiles inside `runtime-orchestrator.ts` (D37): orchestration governance contract in every system prompt (effort = reasoning depth, never agent count; mandatory `// complexity:` declaration); workflow tool interception enforcing strategy caps (DIRECT=1, LIGHT≤3, FULL≤8) with HEAVY requiring explicit interactive approval (Multi-agent / Single-agent / Let Harness decide) and maxAgents clamped to the approved ceiling; model silent-switch guard (model overrides in scripts prompt Keep-current / Allow); `/reasoning` command for user-controlled Default/Plan/Review profiles persisted runtime-side. Fixes cafe-mockup incident (~37 agents on a simple task)
- `docs`: record decision D37 (complexity-aware orchestration & independent reasoning profiles); update ARCHITECTURE/SETUP/registry
- `feat`: implement RAL Phase 6 — integrated `/model` reasoning flow (D38): after native model selection, RAL presents Reasoning Profile (10 profiles, Vision gated on image input) then Reasoning Level (Off/Low/Medium/High/Ultra → canonical runtime values) via the native `model_select` event + `pi.setThinkingLevel()`; profile/level persist to `harness-reasoning.json`; `/reasoning` retained for CLI compatibility; model/profile/tier separation preserved
- `feat`: implement `/mcc` Model Control Center (D39) — grouped multi-profile reasoning overview (GENERAL/PLANNING/EXECUTION/SPECIALIZED) with effective levels at a glance, per-profile level editors with immediate persistence, inline model selection via `ctx.modelRegistry` + `pi.setModel`, Vision capability gating, v2 state migration in `harness-reasoning.json`

## 2026-08-23

- `fix`: refine `/mcc` UX (D40/D39.1) — viewport-limited model picker on pi-tui SelectList (maxVisible 12), placeholder `unknown/unknown` shown as `(none — choose below)`, immediate overview re-render after each profile save, selectable section headers removed ([docs/DECISIONS.md](docs/DECISIONS.md) D40)

## 2026-08-25

- `fix`: repair `/mcc` profile-key parse defect found in real-world validation — row values `__p_<Name>__` parsed with `slice(4)` wrote overrides under corrupted keys (`Task__`, live `Plan__`), so saves never displayed and were silently discarded by load sanitization; values now flow through one exported token helper and a value→profile Record ([docs/DECISIONS.md](docs/DECISIONS.md) D41)
- `feat`: rebuild `/mcc` overview as grouped structural list (`MccOverviewList`) — GENERAL/PLANNING/EXECUTION/SPECIALIZED headers render but are never selectable; Vision-without-image rows render disabled and skipped; columnar label/description layout; success-colored `●active` marker distinct from the selection highlight; viewport cap with scroll indicator and orphan-header trim
- `feat`: model picker fuzzy filter (pi-tui `fuzzyFilter`, mid-string and multi-token match), 9router-first sort, live match counts, Delete-key editing — replaces prefix-only `setFilter` that returned "No matching commands" for "stealth" in a 1356-model catalog
- `fix`: unify reasoning persistence on v2 state — `model_select` and `/reasoning` no longer clobber `overrides` via legacy v1 writes; `loadReasoningProfile()` reads v2; `saveReasoningStateV2()` sanitizes keys/levels on write (heals corrupt state files); legacy writer removed
- `fix`: level editor preselects current radio and offers explicit "Keep current (<raw>)" for out-of-map stored levels (removes silent Off trap); `session_start` warms `ctx.modelRegistry.refresh()` after router health OK
- `docs`: validation evidence — strict type-check PASS (TS latest); 12-check headless component harness PASS; live TUI round-trip PASS (Commit low→High saved, overview updated in place, state file healed, reopen preserved, `stealth ox` → ox-alpha 1/1356)
- `feat`: implement Model Control System Phase 1 (D42) — visibility trust state (`harness-models.json`) filtering inside refreshModels; SELECTABLE = DISCOVERED ∩ VISIBLE with honest `Connectivity: UNVERIFIED`; boot-default restoration (bounded handshake, notice, no dialog); reasoning v3 {defaultProfile, profiles} with migration + pure resolveEffective; ephemeral execution profiles via `// profile:` tag at the workflow boundary; inline `{model:}` override detection + Keep-strip; `/mcc` removed — `/model` post-selection flow is the unified control center ([docs/DECISIONS.md](docs/DECISIONS.md) D42)
- `fix`: `/doctor` placeholder blind spot (no more `current model "unknown" is live-router current`) + catalog counts / connectivity / reasoning diagnostics
- `fix`: D43 — root-cause `/model` same-model dead-end (host skips model_select on equal models; interactive dispatch hard-coded) → added Alt+M shortcut + bare `/reasoning` opening the shared Model Control Center (single v3 state/resolver), visible handler errors, `/doctor` discoverability tip ([docs/DECISIONS.md](docs/DECISIONS.md) D43)
- `feat`: D44 — unified `/model` via version-guarded host bridge (`pi-model-bridge.mjs`): same-model selector picks emit `model_select(sameModel:true)`; control center opens for both cases; reversible backup + structure/version guard + `/doctor` diagnostics ([docs/DECISIONS.md](docs/DECISIONS.md) D44)
- `fix`: D45 — `/model` width-overflow crash (`Rendered line 40 exceeds terminal width (215 > 204)`): dynamic column sizing, marker inside the label column, ANSI/Unicode-aware truncation, width-aware header/status/footer, final per-line clamp; overflow regression tests at widths 8–400 ([docs/DECISIONS.md](docs/DECISIONS.md) D45)
- `feat`: D46 — `/model` control center visual refinement: table rows with dynamic columns, semantic level tones, MODEL/REASONING header hierarchy, responsive width-aware chrome/footers, subtle selection ([docs/DECISIONS.md](docs/DECISIONS.md) D46)
- `feat`: D47 — `/model` navigation + detail architecture: two-pane control surface (stacked on narrow), focused CURRENT MODEL / PROFILE detail panels, SELECTED MODEL detail strip in the picker, selection-change wiring ([docs/DECISIONS.md](docs/DECISIONS.md) D47)
- `feat`: D48 — `/model` scope/navigation architecture: PROVIDERS nav section, truthful provider counts, two-pane provider-scoped model browser, scope-aware titles, ✓ current marker ([docs/DECISIONS.md](docs/DECISIONS.md) D48)
- `feat`: D49 — `/model` panelization: CURRENT MODEL / NAVIGATION · DETAIL / SELECTED MODEL / footer as titled-rule regions with a subtle pane divider ([docs/DECISIONS.md](docs/DECISIONS.md) D49)
- `docs`: validation evidence — strict type-check PASS; 15-check regression suite PASS; live battery PASS (boot restore → footer ox-alpha; Vision high→low immediate; Set-Default persisted; workflow config-immutability; override prompt + Keep-strip)
- `feat`: D50 — `/model` unified Model Control Surface: three-region responsive layout, detail follows focus, truthful provider wording, standalone browser retired ([docs/DECISIONS.md](docs/DECISIONS.md) D50)
- `feat`: D51 — `/model` opens the Model Control Surface directly: version-guarded host bridge intercepts `/model` dispatch and routes to the extension's control surface; native picker no longer the first screen; `openModelBrowser` retired ([docs/DECISIONS.md](docs/DECISIONS.md) D51)

## 2026-09-01


- `feat`: D53 — `/model` final information architecture: PROVIDERS | MODELS two-pane browser (provider selection scopes the model list), SELECTED MODEL detail region that follows focus (provider / model / profile), horizontally dense REASONING PROFILES region with all ten profiles visible and distinct ›/★/● markers, visible in-pane search, contextual footer; model rows drop the repeated provider prefix; `modelSurfaceLoops` guard absorbs `model_select` fired by the surface's own `setModel`; D50 three-region composition retired ([docs/DECISIONS.md](docs/DECISIONS.md) D53)

 ## Notes

- Entries must be added in the same session as the change they describe (capture loop).
