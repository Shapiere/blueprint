# Setup Inventory

## Purpose

Everything required to rebuild this environment from scratch, and the current state of the Pi installation. Unknown information is marked **Pending** — never invent configuration.

**Last verified: 2026-08-21** (9router and MCP servers re-verified; refresh via the capture loop on every setup change).

---

## Host

- Windows 11 Pro (build 10.0.26200), x64, terminal: Warp.
- Git for Windows installed; bash at `C:\Program Files\Git\bin\bash.exe` — **required by Pi** (checked locations: settings `shellPath`, Git Bash, `bash` on PATH).
- Path note (verified 2026-08-02): short paths resolve differently for this machine's shell tools versus real binaries — `/g/pisetup` maps to `G:\pisetup` for the former but to `G:/g/pisetup` for git. Use explicit drive-letter paths with real binaries (`git -C "G:/pisetup" ...`).

## Prerequisites

- Node.js v24.18.0 (npm 11.16.0). Pi installs and runs on Node >= 22.19.
- Git (bundled with Git for Windows).

## Pi CLI

- Package: `@earendil-works/pi-coding-agent` **0.83.0** (latest), installed globally via npm. Binary: `pi`.
- Install: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`
- Config directory: `~/.pi/agent` (`settings.json`, `models.json`, `auth.json`, `extensions/`, `prompts/`, `skills/`).

## Provider and Models

- Provider id: **`9router`** — a local router process (see [9router Service](#9router-service)).
- Endpoint: `http://127.0.0.1:20128/v1` (must be running; verified responding 2026-08-02).
- API: `openai-completions`. Model catalog is fetched from the router at runtime (~200 models).
- `models.json` defines the provider entry: `baseUrl`, `api`, placeholder `apiKey`, `compat` (`thinkingFormat`) and model overrides. Verified shape (2026-08-02), values are placeholders — no secrets:

```json
{
  "providers": {
    "9router": {
      "baseUrl": "http://127.0.0.1:20128/v1",
      "api": "openai-completions",
      "apiKey": "sk_9router",
      "models": [
        {
          "id": "oc/deepseek-v4-flash-free(max)",
          "reasoning": true,
          "input": ["text"],
          "contextWindow": 1000000,
          "maxTokens": 128000,
          "compat": { "thinkingFormat": "deepseek" }
        }
      ]
    }
  }
}
```
- Default model: `oc/deepseek-v4-flash-free(max)`.
- Notable catalog entries: `cc/claude-sonnet-5`, `cc/claude-opus-5`, `cx/gpt-5.6-sol`, `ag/gemini-3.6-flash-*`, `oc/deepseek-v4-flash-free(max)`.
- Model switching: `Ctrl+P` cycle, `/model`, or `--model provider/id`.

## 9router Service

- Package: `9router@0.5.55` (npm global; binary `9router`). Install/update: `npm install -g 9router`.
- Start: run `9router` in a terminal. The CLI spawns `node app/custom-server.js` and waits for the port (default `127.0.0.1:20128`; `-l` shows server logs, `-p <port>` overrides).
- Verified 2026-08-21: installed `9router@0.5.55` (npm latest); health check HTTP 200 on `127.0.0.1:20128/v1/models`. Started manually before Pi is used.

## Auth

- The 9router key lives in `~/.pi/agent/auth.json` — **never committed** (see Secrets Policy).
- Stored shape: `{"9router": {"type": "api_key", "key": "<secret>"}}` — the `type` field is required.
- Re-entry on a fresh machine: `pi` then `/login` (provider 9router), or write `auth.json` with the shape above.
- Note: verified 2026-08-02 (fresh-config simulation): the local router accepts the placeholder bearer `sk_9router` for `GET /v1/models` and for chat completions on the free model; it does not validate the Pi-supplied key. The real key remains the documented re-entry path. Fresh-machine interactive `/login` flow remains **Pending**.

## Settings (`~/.pi/agent/settings.json`)

| Key | Value | Note |
|---|---|---|
| `defaultProvider` | `9router` | |
| `defaultModel` | `oc/deepseek-v4-flash-free(max)` | |
| `defaultProjectTrust` | `always` | no trust prompts in headless runs |
| `quietStartup` | `true` | |
| `theme` | `dark` | |
| `compaction` | enabled, reserve 16384, keep recent 20000 | defaults, explicit |
| `retry` | enabled, maxRetries 3, baseDelayMs 2000 | defaults, explicit |
| `skills` | see Skills section | 21 settings entries; 27 discovered |
| `packages` | see Packages section | 11 entries |

## Packages (managed by `pi install`)

| Source | Purpose |
|---|---|
| `npm:pi-web-access` | web search, URL fetch, PDF/YouTube extraction |
| `npm:pi-subagents` | task delegation to subagents |
| `git:github.com/badlogic/pi-skills` | 8 skills (registered via settings `skills`, not the package loader — repo has no manifest) |
| `npm:pi-mcp-adapter` | MCP server support via a single proxy tool |
| `npm:pi-lens` | LSP/linter/formatter feedback during edits |
| `npm:@juicesharp/rpiv-todo` | todo tool + live overlay (Wave 1, validated 2026-08-03) |
| `npm:@gotgenes/pi-permission-system` | permission gates; path protection + bash policy active (Wave 1+2, validated 2026-08-03) |
| `npm:@narumitw/pi-plan-mode` | enforced read-only plan mode (Wave 1, validated 2026-08-03) |
| `npm:@ff-labs/pi-fff` | fuzzy file/content search (Wave 1, validated 2026-08-03) |
| `npm:@quintinshaw/pi-dynamic-workflows` | dynamic workflow execution, routed subagents (Wave 2, validated 2026-08-03 — launch; completion async) |
| `npm:@juicesharp/rpiv-ask-user-question` | structured typed questioning (Wave 2; interactive) |
| `npm:pi-simplify` | diff-scoped simplify pass (Wave 2; interactive; load-validated) |

Removed Wave 2: `npm:pi-subagents` (retired per `docs/DECISIONS.md` D17/D20 — superseded by pi-dynamic-workflows).

Uninstall: `pi remove <source>`.

## Extensions

- `~/.pi/agent/extensions/power-tools.ts` — custom tools `repo_tree`, `git_log`; command `/power-tools`; hot-reload with `/reload`. Strict type-check PASS 2026-08-21 (TypeScript 7.0.2 vs global pi type declarations; source: `capabilities/extensions/power-tools.ts`).
- `~/.pi/agent/extensions/runtime-orchestrator.ts` — Runtime Abstraction Layer (RAL) v1 (Phases 1–6 + /mcc): `session_start` project topology detection (Node/TS, Python, Rust, Go, Roblox, Generic); 9router health probe with auto-start fallback; `before_agent_start` workspace context injection + per-turn capability scoping + orchestration governance contract; complexity-aware workflow enforcement (strategy caps DIRECT=1/LIGHT≤3/FULL≤8, HEAVY user approval via interactive select); dynamic model catalog bridge via Pi-native `refreshModels`; integrated `/model` flow; model silent-switch guard; `/doctor`, `/reasoning`, `/sync`, and `/mcc` Model Control Center commands. Source: `capabilities/extensions/runtime-orchestrator.ts`. Type-check PASS 2026-08-23 (TS 7.0.2). Decisions D33–D39.
- `~/.pi/agent/harness-reasoning.json` — reasoning profile configuration (10 profiles: Default/Plan/Task/Review/Vision/Advisor/Synthesis/Commit/Research/Coding + thinking level), runtime-owned state; primary UX is the integrated `/model` flow (model → profile → level), `/reasoning <profile> [level]` retained for CLI compatibility.
- `/mcc` — Model Control Center: grouped overview of all reasoning profiles with effective levels at a glance, per-profile level editors, and inline model selection (`ctx.modelRegistry` + `pi.setModel`). Edits persist immediately; Esc/Cancel is safe.
- Extensions run with full system permissions; keep source files reviewed (both are platform-owned and version-tracked in `capabilities/extensions/`).

## Skills (11 discovered, 2026-08-02)

| Skill | Source |
|---|---|
| `img2threejs` | `~/.claude/skills` |
| `frontend-design-review` | `~/.codex/skills` |
| `brave-search`, `browser-tools`, `gccli`, `gdcli`, `gmcli`, `transcribe`, `vscode`, `youtube-transcript` | `badlogic/pi-skills` dirs (via settings `skills`) |
| `pi-web-access` | `npm:pi-web-access` package |
| `test-driven-development`, `systematic-debugging`, `writing-plans`, `executing-plans` | superpowers (referenced from `~/.pi/agent/vendor/superpowers/skills`; MIT, framework-free — ported as-is, D19) |
| `frontend-design`, `skill-creator` | anthropics (referenced from `vendor/anthropics/skills`; Apache-2.0) |
| `docx`, `pdf`, `pptx`, `xlsx` | anthropics skills; **pdf functional validated** 2026-08-03 (pypdf extraction; host deps: `pypdf`, `reportlab`) |
| `workflow-authoring`, `workflow-patterns` | pi-dynamic-workflows package |
| `repository-intelligence` | platform-owned skill (`capabilities/skills/repository-intelligence`; Apache-2.0) |

## Prompt Templates (`~/.pi/agent/prompts/`)

- `commit.md` — conventional commit message from staged changes.
- `review.md` — consolidated four-dimension review (Wave 2).
- `explain.md` — deep-dive explanation of a file or symbol.
- Intelligence layer (Milestone 8+9): `workflow.md` (orchestrator rules v2), `decide.md` (decision engine), `plan-next.md` (planning), `review-architecture.md` (architecture review), `self-eval.md` (self-evaluation), `debug.md` (debugging protocol), `perf.md` (performance protocol), `metrics.md` (metrics manifest), `memory.md` (engineering memory protocol).
- Sources: `capabilities/prompts/` (deployment copies are synced from the repository). Sync re-verified 2026-08-21: 12/12 templates identical.

## MCP

- Adapter: `pi-mcp-adapter` (package, installed).
- Config: `~/.config/mcp/mcp.json` — four servers (pinned to concrete versions, D32):
  - `chrome-devtools` (`npx -y chrome-devtools-mcp@1.7.0`) — validated 2026-08-03; pinned 2026-08-21 (29 tools)
  - `sequential-thinking` (`npx -y @modelcontextprotocol/server-sequential-thinking@2026.7.4`) — validated 2026-08-03; pinned 2026-08-21
  - `context7` (`npx -y @upstash/context7-mcp@4.0.3`) — validated 2026-08-03; pinned 2026-08-21
  - `memory` (`npx -y @modelcontextprotocol/server-memory@2026.7.4`) — validated 2026-08-03; pinned 2026-08-21 (entity + observation via proxy)
- Also read automatically: `.mcp.json`, `~/.agents/mcp.json`, host configs via `/mcp setup`.
- Manage: `/mcp` in Pi; servers start lazily on first tool use.
- Server notes and config fragments: [chrome-devtools](../capabilities/mcp/chrome-devtools.md), [sequential-thinking](../capabilities/mcp/sequential-thinking.md), [context7](../capabilities/mcp/context7.md), [memory](../capabilities/mcp/memory.md).

## Permission System

- Package: `@gotgenes/pi-permission-system` (installed).
- Policy (Wave 2, validated 2026-08-03): tools `allow` by default; **path protection** — deny `.env*` (except `.env.example`), `~/.ssh/*`, `~/.pi/agent/auth.json`, `~/.pi/agent/oauth.json`; **bash policy** — deny `rm -rf *`/`rm -fr *`, ask `git push --force*`/`sudo *`; **external-directory guard** — ask outside `cwd`, allow known platform dirs (`~/.pi/agent/**`, `~/.config/mcp/**`, `~/.claude/**`, `~/.codex/**`).
- Config: `~/.pi/agent/extensions/pi-permission-system/config.json`.
- Validated: `.env` read denied; `rm -rf *` blocked (model correctly fell back to plain `rm`); normal reads and bash unaffected.

### Runtime-owned model/reasoning state (D42)

| File | Owner | Contents |
|---|---|---|
| `~/.pi/agent/harness-reasoning.json` | user (runtime) | `{version:3, defaultProfile, profiles{10}}` — written only by the `/model` flow |
| `~/.pi/agent/harness-models.json` | user (runtime) | `{visible:null|[], hidden:[], names{}}` visibility curation + display-name cache |

Neither file is under `/sync`; neither contains credentials. `models.json`/`auth.json` remain protected and untouched by RAL.

### `/model` host bridge (D44)

Pi skips `model_select` for same-model selections; the bridge makes them open the Model Control Center.

```bash
node capabilities/scripts/pi-model-bridge.mjs status   # report applied/version/backup
node capabilities/scripts/pi-model-bridge.mjs verify   # non-mutating safety check (exit 1 if unsupported/structure changed)
node capabilities/scripts/pi-model-bridge.mjs apply    # idempotent, version-guarded
node capabilities/scripts/pi-model-bridge.mjs restore  # revert to pristine host file
```

Re-run `apply` after every `pi update`; `/doctor` reports whether the bridge is active.

### Extension type-check & regression tests

```bash
# strict type-check (paths mapped to the global pi installation)
npx -y -p typescript@latest tsc -p <tsconfig-with-paths>
# regression suite (15 checks: migration, resolver, visibility, guards, control-center UI)
npx -y tsx --tsconfig <tsconfig-with-paths> capabilities/extensions/tests/d42.test.ts
```

## Operations

Daily start sequence:

1. Start the 9router service — run `9router` in a terminal (see [9router Service](#9router-service)).
2. Start Pi — run `pi` in the project directory.

Health check: `curl http://127.0.0.1:20128/v1/models` returns the model catalog (the placeholder bearer `sk_9router` is accepted).

Updates:

- Pi: `pi update` (or reinstall: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`)
- Packages: `pi update --extensions`
- 9router: `npm install -g 9router`; verify with `npm ls -g 9router`

Extensions hot-reload with `/reload` inside Pi. Sessions persist under `~/.pi/agent/sessions/`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Provider is not configured: 9router` | `auth.json` credential missing the `type` field (incident 2026-08-02) | Ensure the stored shape matches the Auth section, then restart Pi |
| Router unreachable (models list empty or connection refused) | 9router service not running | Check the listener: `netstat -ano \| grep :20128`; start `9router` |
| Model missing from `/model` | Entry absent from `models.json` or the router catalog changed | Add/refresh the provider entry (see Provider section) and restart Pi |

## Restore Procedure (cold install — PARTIALLY VALIDATED 2026-08-02)

1. Install Node.js (>= 22.19) and Git for Windows.
2. `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`
3. Start the 9router service: run `9router` in a terminal (see [9router Service](#9router-service)).
4. Write `~/.pi/agent/models.json` per the Provider section (example shape there; the source machine's file contains the full ~200-model catalog). — **verified via fresh-config simulation 2026-08-02**
5. Run `pi`, authenticate via `/login` for provider `9router`. — **stored-credential path verified via fresh-config simulation 2026-08-02** (`FRESH_OK`); interactive `/login` UI flow untested
6. Apply `settings.json` keys from the Settings table.
7. `pi install` the nine packages (see Packages table).
8. Copy `extensions/power-tools.ts` (source: `capabilities/extensions/`), `prompts/*.md` (source: `capabilities/prompts/`), and register skills per `capabilities/skills/NOTES.md`.
9. Write `~/.config/mcp/mcp.json` (four servers; fragments in `capabilities/mcp/`) and the permission config per the Permission System section.

Validation status: steps 4–5 verified via fresh-config simulation (temp agent dir, documented files, placeholder auth; output `FRESH_OK`, 2026-08-02). Steps 1–3 and 6–9 verified by checklist against the live machine. Full fresh-machine execution remains pending (see `implementation/TODO.md`).

## Pending

- Full cold-install on a fresh machine (steps 1–3, 6–9) not yet executed; partial validation complete (2026-08-02).
- Interactive `/login` flow on a fresh machine untested (stored-credential path verified via simulation).
