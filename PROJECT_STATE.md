# Project State

## Purpose

Current status snapshot — the present only. History lives in [CHANGELOG.md](CHANGELOG.md); the *why* lives in [docs/DECISIONS.md](docs/DECISIONS.md); the ordered action list lives in [NEXT_SESSION.md](NEXT_SESSION.md).

## Phase

**Continuous Evolution** (since 2026-08-03, decision D30). The foundation (Milestones 1–10) is complete and certified; there are no predefined milestones. Work enters through the capability lifecycle, trigger-based integrations, and the capture loop. Architecture and governance are the stable core; capabilities, prompts and model configuration are the evolving surface.

**Last shipped work item:** D76 — Model Governance & Runtime Hardening (2026-09-30, decision record **D77**, commit `6e59d64`). The governance/documentation layer was reconciled to match it on **2026-10-01** (commit `daa1bb3`; see [CHANGELOG.md](CHANGELOG.md) and `G:/blueprint-report/d66-d76-governance-capture-loop-reconciliation-2026-10-01.md`).

## Shipped (Continuous Evolution)

One line per work item; detail in [docs/DECISIONS.md](docs/DECISIONS.md) and [CHANGELOG.md](CHANGELOG.md). Work-item labels are the implementation names; where a label differs from its decision-record number, both are shown.

| Work item | What shipped | Decision | Commit |
|---|---|---|---|
| D31 | Repository consumption scope: single primary environment | D31 | — |
| D32 | MCP servers pinned to exact versions | D32 | — |
| D33 | RAL v1 foundation — `session_start` topology, 9router probe, `/doctor` | D33 | — |
| D34 | `/sync` one-way asset deployment (SHA256 drift, conflicts, allowlist) | D34 | — |
| D35 | Per-turn in-memory capability scoping (`scopes.json`, fail-open) | D35 | — |
| D36 | Pi-native dynamic model catalog bridge (`refreshModels`) | D36 | — |
| D37 | Complexity-aware orchestration + independent reasoning profiles | D37 | — |
| D38 | Integrated `/model` reasoning flow (model → profile → level) | D38 | — |
| D39–D41 | `/mcc` adopted, refined, real-world defect fixes | D39–D41 | — |
| D42 | Model Control System Phase 1 — visibility trust state, boot-default restore, reasoning v3, `/model` control center; `/mcc` removed | D42 | — |
| D43 | Same-model dead-end root cause (host skip) + Alt+M / bare `/reasoning` access | D43 | — |
| D44 | Unified `/model` via the version-guarded host bridge | D44 | — |
| D45–D54 | `/model` responsive width fix, navigation/detail, scope IA, panelization, unified surface, single-active focus | D45–D54 | — |
| D55 | `/model` visual redesign — boxed browser, grid profile controls, grouped inspectors | *no decision entry* | `bc2aeb3` |
| D56 | Diagnosis only — provider classification reads Pi's cached availability snapshot | *no decision entry* | — |
| D57 | 9router startup is **manual**; no spawn, no autostart; refresh follows router readiness | D57 | — |
| D58 | `/model` outer surface frame with inline title | *no decision entry* | `1e0392c` |
| D59–D61 | Purple three-column IA + bundled theme, precision visual correction, divider integration | D59–D61 | — |
| D62–D65 | Runtime Context field, `/model` provenance fix, three-layer surface (Activity / Context / Input), visual polish | D62–D65 | — |
| D66 | Permission Decision Surface (presentation-only authorizer) | D66 | `de3eed1` |
| D66.1 | Runtime activation fix, then compact primary | D67, D68 | `34ad73c` |
| D66.2 | Filesystem controls reflect the delegation envelope (`Y` hidden on excluded surfaces) | D69 | `6286eed` |
| D66 | Single permission UI via the terminal prompt renderer (no `Session`, no stock) | D70 | `0f3c303` |
| D66.3 | Permission information & action hierarchy polish (incl. the 2026-09-12 final refinement) | D71 | `c098bdb`, `b3cf66b` |
| D72 | Work Plan compact status layer above Runtime Context (rpiv-todo single source) | D72 | `533f071`, `58f97d4`, `63a1bc5` |
| D72.1 | Work Plan unified visual polish — one surface, one header | **D75** | `d31e678` |
| D73 | 9router catalog reliability — bounded probe, one-shot recovery, non-destructive refresh | D73 | `c970d1f` |
| D74 | Supplementary discovery for routable-but-unadvertised models | D74 | `5bed7a0` |
| D75 | Supplementary model default restore (declared default resolvable after catalog population) | **D76** | `cd2de51` |
| D76 | Model governance & restore-race hardening (user selection outranks the declared default) | **D77** | `6e59d64` |

## Current Runtime Guarantees

### Model lifecycle

```
DISCOVERED → VISIBLE → SELECTABLE → DECLARED DEFAULT → RESTORED → CURRENT
```

- **Discovery** (D36, D74): the advertised catalog (`GET /v1/models`) is authoritative and first; the router's own Pi declaration (`GET /api/cli-tools/pi-settings`) scopes a supplementary catalog built from its routable catalog (`GET /api/models`). Advertised wins on collision; entries without finite `caps` are dropped rather than defaulted; no provider or model id is hardcoded; the path is fail-soft and bounded.
- **Visibility** (D42): `~/.pi/agent/harness-models.json` is user curation only. SELECTABLE = DISCOVERED ∩ VISIBLE. Connectivity is honestly **UNVERIFIED** (Phase 2 skipped, D52).
- **Selection** (D42–D63): `/model` is the single entry point, routed to the Model Control Surface by the version-guarded host bridge (`capabilities/scripts/pi-model-bridge.mjs`). It never opens from programmatic model events.
- **Declared default** (D42, D75, D76): `settings.json` `defaultProvider`/`defaultModel`, written by the host on every selection.
- **Restore** (D75, D76): a bounded post-start reconciliation (`1200 ms` + `8 × 900 ms`) repairs a session the host could not resolve — it waits for the dynamic catalog and replaces the host's provider-sentinel fallback. Genuine misses warn truthfully instead of 401ing.
- **Precedence** (D77, enforced): explicit user selection **>** declared default **>** fallback. `explicitUserSelection` forbids reconciliation once the user has chosen; `reconciliationApplies` limits it to an unresolved session or process startup (a resumed `pi -c` session keeps its own model); `withModelWrite` serializes every Harness-initiated model write; the restore reports success truthfully.
- Model, reasoning profile and reasoning level remain **independent**; `/doctor` reports the declared default, whether the current model is advertised or supplementary, and whether the reconciliation stood down.

### 9router policy (D57, D73)

Manually started by the user. Harness **never** spawns, kills, restarts, watchdogs or polls it. Recovery is bounded and one-shot: one boot-time refresh when the router is already healthy, and one probe + at most one refresh per `/model` open. Offline wording is truthful; the health probe is a bounded 4.5 s request with a classified failure (`timeout | http | connection | parse`) surfaced in `/doctor`. `refreshModels` never publishes an empty catalog over a known-good one.

### Runtime surface (D62–D65, D72, D72.1)

Primary surface order is `Activity → Work Plan → Runtime Context → Input`, with a zero-height footer (branch source only) and no extension-status fragments anywhere (diagnostics live in `/doctor`). The Runtime Context field carries `model · ● level · ★ profile > 📁 workspace > ⑂ branch > usage` in one framed, tinted field.

### Work Plan (D72, D72.1)

`@juicesharp/rpiv-todo` owns state, tool and persistence; Harness owns presentation. ONE surface: collapsed `◆ WORK PLAN  │ X/Y  ◐ <task>  ›`, expanded the same header with `⌃` over indented rows; glyphs carry state (`◐` active / `●` completed / `○` pending); zero tasks → the surface disappears. `rpiv-todos` never registers (`overlayEnabled:false`), and Harness is the sole `ctrl+shift+t` owner (`collapseKey:off`). `X/Y` is ordinal position, not completed/total.

### Permission surface (D66–D71)

`pi-permission-system` remains the sole authority (policy, session rules, fail-closed). Harness contributes presentation only: `capabilities/extensions/components/permission-surface.ts` plus the terminal prompt renderer registered through the package, giving one `Y/N/R` decision surface with `Esc`/`Ctrl+C` fail-closed, a subagent badge, and width safety `12..400`.

### Capability scoping & sync (D34, D35)

Per-turn `<available_skills>` scoping is deterministic and in-memory (fail-open, `/skill:<name>` escape hatch). `/sync` deploys platform assets one way with SHA256 drift detection, conflict protection and a protected-file allowlist.

## In Flight

Nothing.

## Blocked

Nothing.

## Open Questions

None open.

## Known Gaps

**Host-side limitations (cannot be fixed from this repository):**

- Pi resolves the initial model during session construction, **before** any extension's `session_start`, so the host may pick its `defaultModelPerProvider` sentinel and print its own warning. Harness can only repair afterwards.
- The host exposes no atomic compare-and-set for the current model; the D77 write chain closes the reachable window, not the primitive.
- The `/model` autocomplete warning ("conflicts with built-in interactive command") is a host command-name collision. It is cosmetic: the Harness command is load-bearing for the bridge and must not be removed.
- Router-side catalog artifacts (e.g. ids in the router's generated `models.json` template that are absent from `/v1/models`) remain selectable and are outside Harness ownership.

**Repository / validation debt:**

- Full cold-install on a fresh machine not executed (simulated — D12); interactive `/login` on a fresh machine untested.
- Interactive validations: **completed 2026-10-01** for plan-mode, ask-user prompting and pi-lens (command surface); pi-simplify was validated at its entry point only, because its workflow mutates files and the sweep was read-only.
- Deferred capabilities awaiting triggers: GitHub MCP (PAT), piolium (container), playwright (E2E need), pi-web-access (API key).
- Work items **D55**, **D56** and **D58** have no decision entry (evidence lives in the reports and [CHANGELOG.md](CHANGELOG.md)); the numbers are retired, not reused. See the Numbering section of [docs/DECISIONS.md](docs/DECISIONS.md).
- Execution-profile status chip can persist up to its 30-minute window after a workflow ends (documented v1 semantics).

## Next

See [NEXT_SESSION.md](NEXT_SESSION.md). The platform is at a clean, fully documented baseline: no runtime work is in flight, the suite is green, and the deployed extension is byte-identical to the repository source.
