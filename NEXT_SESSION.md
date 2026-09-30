# Next Session

## Purpose

Handoff: what to do first, what must not be broken, and what is genuinely left. Current state lives in [PROJECT_STATE.md](PROJECT_STATE.md); this file owns the ordered action list.

## State on arrival

- **Continuous Evolution** (D30) — no milestone gates. Last shipped work item: **D76 Model Governance & Runtime Hardening** (2026-09-30, decision record **D77**, commit `6e59d64`, pushed).
- Repository and deployed runtime are in sync: `capabilities/extensions/runtime-orchestrator.ts` is byte-identical to `~/.pi/agent/extensions/runtime-orchestrator.ts`.
- Test suite **201 checks green**; strict type-check PASS; `verify.py` reports exactly one known orphan (`IMPLEMENTATION_PLAN.md`).
- The documentation layer was reconciled on **2026-10-01** (D66 → current capture loop): registry, changelog, decision numbering, project state and this handoff.
- No runtime work is in flight. Nothing is blocked.

## First Actions (in order)

1. **Verify repository state.** `python capabilities/scripts/verify.py` (expect `OK - all checks passed`); `git status` (expect a clean tree apart from the untracked `IMPLEMENTATION_PLAN.md` scratch file); confirm local `main` matches `origin/main`.
2. **Run the gates before changing anything.**
   - Tests: `npx -y tsx --tsconfig "%TEMP%/pi-tsconfig.json" capabilities/extensions/tests/d42.test.ts` → expect `201 PASS / 0 FAIL`.
   - Types: `npx -y -p typescript@latest tsc -p "%TEMP%/pi-tsconfig.json"` → expect exit 0.
   - Deployed parity: `diff -q capabilities/extensions/runtime-orchestrator.ts ~/.pi/agent/extensions/runtime-orchestrator.ts`.
3. **Operate in Continuous Evolution.** Adopt capabilities only through the lifecycle; keep the capture loop (CHANGELOG + the owning file + DECISIONS in the same session); `verify.py` before every commit.

## Invariants to preserve

**Model governance (D42, D73–D77)**

- Precedence is `explicit user selection` > `declared default` > `fallback`, and it is **enforced**: `explicitUserSelection` blocks reconciliation once the user has chosen, `reconciliationApplies` limits it to an unresolved session or process startup, `withModelWrite` serializes every Harness-initiated model write, and `restoreDeclaredDefault` reports `applied && !explicitUserSelection`. Keep `D76 1..9` green; never remove a gate without a new decision.
- Discovery: advertised catalog first, router-declared supplement second, collision-free; never hardcode a provider or model id; never fabricate capability metadata; never create a second persistent catalog.
- Visibility is curation, not connectivity — keep "Unverified" wording until an authoritative status source exists (D52).
- `/model` opens only from explicit input; programmatic model events never open it (D63).

**9router (D57, D73)** — user starts it; Harness never spawns, kills, restarts, watchdogs or polls. Exactly one `setInterval` in the extension (the Activity spinner). Recovery is bounded and one-shot.

**Runtime surface (D62–D65)** — no `ctx.ui.setStatus` fragments; primary order `Activity → Work Plan → Runtime Context → Input`; width safety 8–400; the footer stays zero-height.

**Work Plan (D72, D72.1)** — `@juicesharp/rpiv-todo` owns state/tool/persistence; Harness owns presentation; ONE surface; no `Todos (...)` overlay; Harness is the sole `ctrl+shift+t` owner (`overlayEnabled:false`, `collapseKey:off`); `X/Y` stays ordinal unless a new decision changes it.

**Permission surface (D66–D71)** — `pi-permission-system` remains the sole authority; Harness contributes presentation only; keep the fail-closed paths and the width-safety tests.

**Host bridge (D44, D51, D63)** — after any `pi update`, re-run `node capabilities/scripts/pi-model-bridge.mjs apply`; `/doctor` reports bridge state. The extension's `model` command must stay registered — it is what the bridge routes to, and the autocomplete warning it produces is cosmetic.

## Next work

No runtime work is pending. In order of value:

1. **Clear the one known repository finding** — decide the fate of the untracked `IMPLEMENTATION_PLAN.md` (a D72-era scratch file): delete it, or fold it into `implementation/TODO.md` and track it. Either way it should stop being an orphan.
2. **Interactive validations** (require a live TUI session, not automatable): plan-mode enforcement, ask-user prompting, pi-simplify, pi-lens.
3. **Trigger-based integrations** when their triggers actually fire: GitHub MCP (PAT), piolium (container), playwright (E2E need), pi-web-access (API key). Do not adopt them speculatively.
4. **Optional documentation debt** — work items D55, D56 and D58 have no decision entry (evidence exists in the reports and `CHANGELOG.md`). Writing them retroactively is optional and must be evidence-based; the numbering deliberately leaves the gaps.
5. **New engineering work** starts only from a real need, through the capability lifecycle and the capture loop. Do not create a milestone to consume remaining documentation debt.

## Left Unresolved / Deferred

- **Phase 2 (admin-derived CONNECTED/ENABLED)** — stance resolved 2026-09-01 (D52): **skip**. Phase 1 transparent fallback stays locked; consent file `~/.pi/agent/harness-router.json` stays designed-but-unused; revisit only if the user reopens it via an upstream read-only status token.
- Execution-profile status chip can persist up to its 30-minute window after a workflow ends (documented v1 semantics).
- Sub-agent inheritance of execution profiles is delivered via injected prompts; direct prompt-level observation would need instrumentation.
- Full cold-install on a fresh machine and the interactive `/login` flow there remain unexecuted (no fresh machine available; simulation only — D12).

## Host-side limitations

- Pi resolves the initial model during session construction, before any extension runs; it may pick its provider sentinel and print its own restore warning. Harness repairs this afterwards and cannot prevent it.
- No atomic host compare-and-set for the current model.
- The `/model` autocomplete conflict is a host command-name collision and cannot be removed without retiring the control center.
- Router-side catalog artifacts (ids present in the router's generated `models.json` template but absent from `/v1/models`) stay selectable; they are not Harness's to filter.

## Engineering environment notes

- **Never use `/tmp` in this shell.** It resolves to **`G:/tmp`**, a real directory on `G:` that a previous session destroyed with `rm -rf /tmp`. Use `%TEMP%` (`"$TEMP/foo"`) or an explicit repo-local scratch directory, and never delete a directory you did not create.
- **`capabilities/extensions/runtime-orchestrator.ts` uses CRLF.** Test regexes that read the source must tolerate it (`\r?\n`), and `write`/`edit` must not silently normalise the whole file.
- **The tool-output pipeline strips `claude-*` substrings.** Model ids containing that text render truncated (`ag/claude-…` → `ag/`). Verify identity by length, hash or hex — never by reading a rendered string back. This is an artifact of the tooling, not a product bug.
- **The test suite writes `~/.pi/agent/settings.json` transiently** (D75 checks declare a default and restore it, serialized). Do not run it while a live Pi session depends on that file.
- **Type-check recipe:** `npx -y -p typescript@latest tsc -p "%TEMP%/pi-tsconfig.json"` (the config points at the installed `@earendil-works` type declarations and `@types/node`).
- **Verification:** `python capabilities/scripts/verify.py` — links, orphans, secrets, structure, registry shape (10 columns), decision numbering (integer, sorted, unique), TODO carry-forward. The numbering check is why decision headings must stay integer: `### D72.1` would be parsed as `D72` and rejected as a duplicate.
- **Deployment:** the extension is deployed by copy (and by `/sync`); always confirm `diff -q` parity after a change, and never claim a redeploy that did not happen.
