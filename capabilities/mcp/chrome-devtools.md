# chrome-devtools — MCP Server Note

## Purpose

Config fragment and notes for the chrome-devtools MCP server (browser automation via Chrome DevTools Protocol).

## Config Fragment

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@1.7.0"]
    }
  }
}
```

Deployed at `~/.config/mcp/mcp.json`.

## Validation

- PASS 2026-08-03: first use via the mcp proxy tool — 29 `chrome_devtools_*` tools discovered and listed (lazy start works). Re-verified 2026-08-21: pinned 1.7.0 handshake + 29 tools listed PASS.
- Purpose: browser workflows (navigation, snapshots, screenshots, script evaluation).

## Notes

- Servers start lazily on first tool use (context economy preserved).
- Wave 2 decision pending: chrome-devtools vs playwright-mcp for E2E verification (see `docs/DECISIONS.md` D17).
- No credentials required.
