# Project State

## Purpose

Current status snapshot. History lives in [CHANGELOG.md](CHANGELOG.md); this file owns only the present.

## Current Milestone

**Milestone 10 — Production Hardening & Real-World Readiness.** Status: **complete** (2026-08-03). Verdict: **foundation certified** (see completion report). Committed and pushed. **The platform now operates in Continuous Evolution** (D30).

## Completed

- Repository structure per Bootstrap Specification v1.1.
- Constitution committed: [docs/BOOTSTRAP_SPEC.md](docs/BOOTSTRAP_SPEC.md).
- Setup inventory with last-verified markers: [docs/SETUP.md](docs/SETUP.md).
- Secrets policy and `.gitignore` in place.
- Vision, design principles, success criteria, decision log, roadmap, contributing guide.
- Decision log records all audit dispositions.
- Audit revisions applied (broken link fix, map deduplication, status pointers, ownership leaks, task traceability).
- Milestone 2 validation: 9router service startup method documented and verified (npm global `9router@0.5.45`, manual start, no autostart).
- Milestone 2 validation: fresh-config simulation passed (`FRESH_OK`) — restore steps 4–5 verified.
- Milestone 2 validation: remote repository visibility determined — **public** (GitHub API, unauthenticated access).
- Milestone 2 validation: success criteria re-evaluated with evidence (C1 partially validated; C2/C3/C5 re-validated).
- Milestone 2 validation: capture loop exercised — validation findings captured same-session in SETUP.md, CHANGELOG.md, DECISIONS.md.
- Milestone 3 depth: operations and troubleshooting sections added to [docs/SETUP.md](docs/SETUP.md) (start sequence, health check, updates, auth-shape incident recovery).
- Milestone 3 depth: `models.json` provider entry shape documented (redacted verified example).
- Milestone 3 depth: candidate evaluations recorded — no setup additions adopted ([docs/DECISIONS.md](docs/DECISIONS.md) D13, D14).
- Milestone 3 depth: capture loop exercised — M3 updates captured same-session.
- Milestone 6: platform architecture adopted — constitution v1.2, `docs/ARCHITECTURE.md`, `capabilities/` tree with registry ([docs/DECISIONS.md](docs/DECISIONS.md) D15).
- Milestone 6: Wave 1 integrated and validated — rpiv-todo, pi-permission-system (path protection), pi-plan-mode, pi-fff, sequential-thinking + context7 MCP, anthropics doc skills; all smoke tests PASS (see [capabilities/index.md](capabilities/index.md)).
- Milestone 6: platform assets versioned — power-tools + prompt templates sourced from `capabilities/`.
- Milestone 6: decisions recorded — license-driven skill referencing (D16), Wave 2 layer decisions (D17).
- Milestone 7: Wave 2 — permission policy deepened (bash + external-directory gates; `rm -rf` deny validated), dynamic-workflows core adopted + pi-subagents retired (D17/D20), superpowers methodology skills ported (TDD, systematic-debugging, plans), review workflow consolidated, rpiv-ask-user-question + pi-simplify loaded, frontend-design/skill-creator skills registered, pdf functional validation completed (pypdf), licenses verified (all MIT).
- Milestone 8: Engineering Intelligence Layer v1 — repository-intelligence skill + five intelligence prompt templates + orchestrator rules ([docs/DECISIONS.md](docs/DECISIONS.md) D22/D23); behaviorally validated (repo analysis, plan-next audit, decide analysis).
- Milestone 9: intelligence v2 — repository-intelligence v2 modules, orchestration v2 rules, debug/perf/metrics/memory templates; memory MCP integrated (validated); Wave 3 deferrals recorded with triggers (D25); metrics baseline (D26); memory strategy (D27).
- Milestone 10: production hardening — verification script adopted (D28), hardening decisions (D29), foundation certified, transition to Continuous Evolution (D30).
- Continuous Evolution (2026-08-21): repository consumption scope resolved — single primary environment, no other consumers ([docs/DECISIONS.md](docs/DECISIONS.md) D31); `/self-eval` and `/metrics` behavioral runs completed (registry updated); power-tools strict type-check PASS (D29 trigger satisfied zero-footprint); prompt deployment sync verified (12/12 identical).
- Continuous Evolution (2026-08-22): Runtime Abstraction Layer v1 implemented — `capabilities/extensions/runtime-orchestrator.ts` (`session_start` topology detection, 9router supervision, workspace context injection, `/doctor` command); deployed to runtime; type-check PASS; registry and architecture updated (D33).
- Continuous Evolution (2026-08-22): RAL v1 Phase 2 implemented — `/sync` one-way asset deployment engine inside `runtime-orchestrator.ts` (SHA256 drift detection, dry-run preview, conflict protection with `--force`, protected file isolation, strict allowlist scope); `/doctor` extended with sync status; validated against live runtime (idempotency 100% PASS); decision D34 recorded.
- Continuous Evolution (2026-08-22): RAL v1 Phase 3 implemented — per-turn in-memory capability scoping (Option E+, D35): `capabilities/scopes.json` tag map, deterministic profile resolution, `<available_skills>` filtered per turn via `before_agent_start`, fail-open, native `/skill:<name>` escape hatch, `/doctor` scoping observability; 8 profile golden tests + fail-open + cross-contamination PASS; live Next.js profile 9 active / 12 available.
- Continuous Evolution (2026-08-22): RAL Phase 4 implemented — Pi-native dynamic model catalog bridge (Option C, D36): `pi.registerProvider("9router", { refreshModels })` maps the live `/v1/models` catalog (203 models) into `/model` deterministically; fail-open with prior-catalog fallback; `models.json`/`auth.json` untouched; mapping goldens + config-untouched hash checks PASS.
- Continuous Evolution (2026-08-23): RAL Phase 5 implemented — complexity-aware orchestration + independent reasoning profiles (D37): orchestration governance contract, workflow tool interception with strategy caps (DIRECT=1/LIGHT≤3/FULL≤8), HEAVY user-approval gate, model silent-switch guard, `/reasoning` profiles; fixes cafe-mockup over-orchestration incident (~37 agents → ≤3).
- Continuous Evolution (2026-08-23): RAL Phase 6 implemented — integrated `/model` reasoning flow (D38): post-selection Reasoning Profile (10 profiles, Vision capability-gated) and Level (Ultra→xhigh mapping) selectors via native `model_select` event + `pi.setThinkingLevel()`; persistence in `harness-reasoning.json`; `/reasoning` retained for CLI compatibility.
- Continuous Evolution (2026-08-23): `/mcc` UX refinement (D40) — viewport-limited model picker, unknown-model placeholder fix, immediate overview updates.
- Continuous Evolution (2026-08-25): `/mcc` real-world defect fixes (D41) — profile-key parse bug repaired (corrupt `Plan__`-style override keys healed), grouped structural overview with never-selectable headers and distinct active marker, fuzzy router-first model picker (1356-model catalog), unified v2 reasoning persistence across `/model`, `/reasoning`, and `/mcc`; validated via strict type-check, 12-check headless harness, and live TUI round-trip.
- Continuous Evolution (2026-08-25): Model Control System Phase 1 implemented (D42) — user-owned visibility trust state (`harness-models.json`) applied inside refreshModels (SELECTABLE = DISCOVERED ∩ VISIBLE; connectivity honestly UNVERIFIED in Phase 1), boot-default restoration with bounded handshake + notice, reasoning state v3 (defaultProfile + profiles, single sanitized writer, pure resolveEffective), ephemeral execution profiles via validated `// profile:` workflow tag, hardened inline-model-override guard, `/mcc` removed — `/model` post-selection flow is the unified control center; validated live (restore, immediate profile updates, Set-Default, immutable-config workflow run, override prompt + Keep-strip) and by a 15-check regression suite.

## In Flight

Nothing. The foundational phase is complete; the platform operates in Continuous Evolution (no predefined milestones — see [ROADMAP.md](ROADMAP.md)).

## Blocked

Nothing.

## Open Questions

None open.

(Resolved 2026-08-21: repository consumption scope — single primary Harness Pi environment, no other machines or agents consume it as their source of truth; `docs/DECISIONS.md` D31. Resolved during Milestone 2: remote visibility is **public** — D11. Resolved during Milestone 6: subagent-layer and browser-server decisions — D17.)

## Known Gaps

- Full cold-install on a fresh machine not executed (no fresh machine available during Milestone 2; simulated validation completed — `docs/DECISIONS.md` D12).
- Interactive `/login` flow on a fresh machine untested (stored-credential path verified).
- Continuous Evolution (2026-08-25): `/model` same-model dead-end root-caused to a Pi host skip (`_emitModelSelect` early-return on equal models; interactive `/model` hard-coded pre-extension; identical in 0.84.3) and mitigated (D43): Alt+M shortcut + bare `/reasoning` open the same control center/v3 state, handler errors surface visibly, doctor tip added; also clarified `/effort` is a workflow auto-arm toggle unrelated to reasoning state.
- Continuous Evolution (2026-08-25): Unified `/model` completed (D44) — version-guarded host bridge (`capabilities/scripts/pi-model-bridge.mjs`, status/apply/restore) emits `model_select(sameModel:true)` for same-model selector picks; control center now opens for BOTH same-model and changed-model selections; doctor reports bridge state; Alt+M // bare `/reasoning` remain as secondary access to the identical flow.
- Continuous Evolution (2026-08-25): fixed the `/model` width-overflow crash (D45) — `Rendered line 40 exceeds terminal width (215 > 204)` caused by the row marker inflating the label column; rows/headers/footer/status now use dynamic column sizing with ANSI/Unicode-aware truncation and a final per-line width clamp, so no rendered line can exceed the terminal at any width.
- Continuous Evolution (2026-08-25): `/model` Model Control Center visual refinement (D46) — table rows (name | level | description) with dynamic columns, semantic level tones, marker inside the name column, MODEL/REASONING header blocks, width-aware chrome and footers, subtle selection highlight; no architecture changes.
- Continuous Evolution (2026-08-25): `/model` navigation + detail architecture (D47) — NavDetailPane two-pane control surface (wide) / stacked (narrow), focused CURRENT MODEL and PROFILE detail panels, SELECTED MODEL detail strip in the picker, selection-change wiring; no runtime behavior changes.
- Continuous Evolution (2026-08-25): `/model` panelization (D49) — semantic regions via a shared titled-rule panel primitive: CURRENT MODEL, NAVIGATION · DETAIL (with subtle `│` divider), SELECTED MODEL, footer; no runtime behavior changes.
- Continuous Evolution (2026-08-25): `/model` scope/navigation architecture (D48) — PROVIDERS nav section with truthful counts, two-pane scoped model browser (provider | models), scope-aware titles, ✓ current marker, dash suppressed for non-profile rows; no runtime behavior changes.

- Continuous Evolution (2026-08-25): `/model` unified Model Control Surface (D50) — three-region NAVIGATION | MODELS | DETAIL layout, detail follows focus, provider wording corrected (never 'Connected'), standalone browser retired; 27-check suite green.
- Continuous Evolution (2026-08-25): `/model` opens the Model Control Surface directly (D51) — version-guarded host bridge extends the D44 pattern to intercept `/model` dispatch in interactive-mode.js, routing to the extension's control surface instead of the native picker; `openModelBrowser` retired.
- Continuous Evolution (2026-09-01): `/model` final information architecture (D53) — PROVIDERS | MODELS two-pane browser with scope titles and truthful counts, focus-following SELECTED MODEL / PROVIDER / PROFILE detail region, horizontally dense REASONING PROFILES (all ten visible, ›/★/● distinct), visible in-pane search, contextual footer; D50 three-region composition retired; `model_select` re-entrancy guard; 32-check suite green.
- Continuous Evolution (2026-09-01): `/model` single-active-focus polish (D54) — exactly one region carries the keyboard cursor; passive regions readable with ✓/★/● state markers; models pane on focus-gated `MccOverviewList`; `Search:` prompt and region-specific footers; 35-check suite green.
- Continuous Evolution (2026-09-01): 9router startup policy changed to MANUAL (D57) — Pi never spawns the router (`autoStart9router` removed); healthy-at-boot refresh + default restore unchanged; router offline → truthful offline status and "start 9router manually" notice; manual mid-session start recovered by a bounded one-shot refresh on the next `/model` open; 42-check suite green.
- Continuous Evolution (2026-09-03): `/model` outer surface frame (D58) — one full-width Model Control Center boundary with the title inline in the top rule; browser box width math corrected (inner `┐` exactly 3 columns from the outer rail); inspector metadata grouped; 42-check suite green ([docs/DECISIONS.md](docs/DECISIONS.md) D59 context).
- Continuous Evolution (2026-09-03): `/model` purple three-column IA (D59) — Row 1 = CURRENT MODEL band + PROVIDERS | MODELS | SELECTED MODEL (inspector = passive column 3 with name / route·ctx / `N output` / Capabilities / ✓ status; two-column collapse below innerWidth 78, stacked below 56); Row 2 = aligned reasoning grid with `●` under each profile name and semantic level colors (Off gray / Low green / Medium cyan / High amber / Ultra violet); profile editor rendered inside the MCC frame (shared `frameLines`); bundled `mcc-purple.json` theme auto-applied on surface open, restored on close; 49-check suite green ([docs/DECISIONS.md](docs/DECISIONS.md) D59).
