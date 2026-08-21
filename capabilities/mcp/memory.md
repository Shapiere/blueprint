# memory — MCP Server Note

## Purpose

Config fragment and notes for the official memory MCP server (graph-based transient memory store for engineering entities, relations, and observations).

## Config Fragment

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory@2026.7.4"]
    }
  }
}
```

Deployed at `~/.config/mcp/mcp.json`.

## Validation

- PASS 2026-08-03: entity + observation creation verified via proxy tool. Re-verified 2026-08-21: pinned 2026.7.4 tool call `create_entities` executed PASS (9 tools available).
- Purpose: session-scale scratchpad for engineering entities, relations, and observations per the Engineering Memory Strategy (decision D27).

## Notes

- Operates as scratch memory; the repository remains the primary source of truth (decision D27).
- No credentials required.
- MIT license.
