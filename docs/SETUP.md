# Setup Inventory

## Purpose

Everything required to rebuild this environment from scratch, and the current state of the Pi installation. Unknown information is marked **Pending** — never invent configuration.

**Last verified: 2026-08-02** (refresh via the capture loop on every setup change).

---

## Host

- Windows 11 Pro (build 10.0.26200), x64, terminal: Warp.
- Git for Windows installed; bash at `C:\Program Files\Git\bin\bash.exe` — **required by Pi** (checked locations: settings `shellPath`, Git Bash, `bash` on PATH).

## Prerequisites

- Node.js v24.18.0 (npm 11.16.0). Pi installs and runs on Node >= 22.19.
- Git (bundled with Git for Windows).

## Pi CLI

- Package: `@earendil-works/pi-coding-agent` **0.83.0** (latest), installed globally via npm. Binary: `pi`.
- Install: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`
- Config directory: `~/.pi/agent` (`settings.json`, `models.json`, `auth.json`, `extensions/`, `prompts/`, `skills/`).

## Provider and Models

- Provider id: **`9router`** — a local router process.
- Endpoint: `http://127.0.0.1:20128/v1` (must be running; verified responding 2026-08-02).
- API: `openai-completions`. Model catalog is fetched from the router at runtime (~200 models).
- `models.json` defines the provider entry: `baseUrl`, `api`, placeholder `apiKey`, `compat` (`thinkingFormat`) and model overrides.
- Default model: `oc/deepseek-v4-flash-free(max)`.
- Notable catalog entries: `cc/claude-sonnet-5`, `cc/claude-opus-5`, `cx/gpt-5.6-sol`, `ag/gemini-3.6-flash-*`, `oc/deepseek-v4-flash-free(max)`.
- Model switching: `Ctrl+P` cycle, `/model`, or `--model provider/id`.

## Auth

- The 9router key lives in `~/.pi/agent/auth.json` — **never committed** (see Secrets Policy).
- Stored shape: `{"9router": {"type": "api_key", "key": "<secret>"}}` — the `type` field is required.
- Re-entry on a fresh machine: `pi` then `/login` (provider 9router), or write `auth.json` with the shape above.
- Note: the local router accepted placeholder bearer `sk_9router` for `GET /v1/models` (verified 2026-08-02); upstream credential behavior is **Pending** (untested on a fresh machine).

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
| `skills` | see Skills section | 10 entries |
| `packages` | see Packages section | 5 entries |

## Packages (managed by `pi install`)

| Source | Purpose |
|---|---|
| `npm:pi-web-access` | web search, URL fetch, PDF/YouTube extraction |
| `npm:pi-subagents` | task delegation to subagents |
| `git:github.com/badlogic/pi-skills` | 8 skills (registered via settings `skills`, not the package loader — repo has no manifest) |
| `npm:pi-mcp-adapter` | MCP server support via a single proxy tool |
| `npm:pi-lens` | LSP/linter/formatter feedback during edits |

Uninstall: `pi remove <source>`.

## Extensions

- `~/.pi/agent/extensions/power-tools.ts` — custom tools `repo_tree`, `git_log`; command `/power-tools`; hot-reload with `/reload`.
- Source of truth for its content: the file itself (review before changing; extensions run with full permissions).

## Skills (11 discovered, 2026-08-02)

| Skill | Source |
|---|---|
| `img2threejs` | `~/.claude/skills` |
| `frontend-design-review` | `~/.codex/skills` |
| `brave-search`, `browser-tools`, `gccli`, `gdcli`, `gmcli`, `transcribe`, `vscode`, `youtube-transcript` | `badlogic/pi-skills` dirs (via settings `skills`) |
| `pi-subagents` | `npm:pi-subagents` package |

## Prompt Templates (`~/.pi/agent/prompts/`)

- `commit.md` — conventional commit message from staged changes.
- `review.md` — senior review of staged changes.
- `explain.md` — deep-dive explanation of a file or symbol.

## MCP

- Adapter: `pi-mcp-adapter` (package, installed).
- Config: `~/.config/mcp/mcp.json` — one server: `chrome-devtools` (`npx -y chrome-devtools-mcp@latest`).
- Also read automatically: `.mcp.json`, `~/.agents/mcp.json`, host configs via `/mcp setup`.
- Manage: `/mcp` in Pi; servers start lazily on first tool use.

## Restore Procedure (cold install — NOT YET VALIDATED)

1. Install Node.js (>= 22.19) and Git for Windows.
2. `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`
3. Start the local 9router service on `127.0.0.1:20128` (startup method: **Pending**).
4. Write `~/.pi/agent/models.json` per the Provider section (schema: constitution-referenced `docs/DECISIONS.md` D3; exact file: on the source machine).
5. Run `pi`, authenticate via `/login` for provider `9router`.
6. Apply `settings.json` keys from the Settings table.
7. `pi install` the five packages.
8. Copy `extensions/power-tools.ts`, `prompts/*.md`, and skills registration to `~/.pi/agent/`.
9. Write `~/.config/mcp/mcp.json` (chrome-devtools).

## Pending

- Cold-install procedure unexecuted (validation item, Milestone 2).
- 9router service startup method undocumented.
- Fresh-machine `/login` flow untested.
- Remote repository visibility (public/private) unknown.
