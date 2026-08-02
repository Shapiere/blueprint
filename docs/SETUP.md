# Setup Inventory

## Purpose

Everything required to rebuild this environment from scratch, and the current state of the Pi installation. Unknown information is marked **Pending** — never invent configuration.

**Last verified: 2026-08-02** (re-verified during Milestone 2 validation; refresh via the capture loop on every setup change).

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

- Package: `9router@0.5.45` (npm global; binary `9router`). Install/update: `npm install -g 9router`.
- Start: run `9router` in a terminal. The CLI spawns `node app/custom-server.js` and waits for the port (default `127.0.0.1:20128`; `-l` shows server logs, `-p <port>` overrides).
- Verified 2026-08-02: process tree `powershell -> node cli.js -> node app/custom-server.js`; listener on `0.0.0.0:20128`. No autostart registration found (Run keys, scheduled tasks, services) — the service is started manually and must be running before Pi is used.

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
7. `pi install` the five packages.
8. Copy `extensions/power-tools.ts`, `prompts/*.md`, and skills registration to `~/.pi/agent/`.
9. Write `~/.config/mcp/mcp.json` (chrome-devtools).

Validation status: steps 4–5 verified via fresh-config simulation (temp agent dir, documented files, placeholder auth; output `FRESH_OK`, 2026-08-02). Steps 1–3 and 6–9 verified by checklist against the live machine. Full fresh-machine execution remains pending (see `implementation/TODO.md`).

## Pending

- Full cold-install on a fresh machine (steps 1–3, 6–9) not yet executed; partial validation complete (2026-08-02).
- Interactive `/login` flow on a fresh machine untested (stored-credential path verified via simulation).
