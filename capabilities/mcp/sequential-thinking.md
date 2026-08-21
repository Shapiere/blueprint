# sequential-thinking — MCP Server Note

## Purpose

Config fragment and notes for the official sequential-thinking MCP server (structured step-by-step reasoning tool).

## Config Fragment

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking@2026.7.4"]
    }
  }
}
```

Deployed at `~/.config/mcp/mcp.json`.

## Validation

- PASS 2026-08-03: `sequential_thinking` invoked via the mcp proxy tool. Re-verified 2026-08-21: pinned 2026.7.4 tool call `sequentialthinking` executed PASS.
- Purpose: reasoning scaffold; particularly valuable for the default free-tier model.

## Notes

- One tool, minimal context footprint (benchmark overall 8.4, ADOPT).
- No credentials required.
