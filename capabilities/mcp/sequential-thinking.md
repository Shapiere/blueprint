# sequential-thinking — MCP Server Note

## Purpose

Config fragment and notes for the official sequential-thinking MCP server (structured step-by-step reasoning tool).

## Config Fragment

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

Deployed at `~/.config/mcp/mcp.json`.

## Validation

- PASS 2026-08-03: `sequential_thinking` invoked via the mcp proxy tool — thought chain ran and concluded (2+2 = 4).
- Purpose: reasoning scaffold; particularly valuable for the default free-tier model.

## Notes

- One tool, minimal context footprint (benchmark overall 8.4, ADOPT).
- No credentials required.
