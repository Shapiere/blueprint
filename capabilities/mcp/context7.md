# context7 — MCP Server Note

## Purpose

Config fragment and notes for the Context7 MCP server (version-pinned library documentation for LLMs).

## Config Fragment

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@4.0.3"]
    }
  }
}
```

Deployed at `~/.config/mcp/mcp.json`.

## Validation

- PASS 2026-08-03: `context7_resolve-library-id` invoked via proxy. Re-verified 2026-08-21: pinned 4.0.3 tool call `resolve-library-id` (TypeBox query) returned candidate libraries PASS.
- Purpose: fresh, version-pinned library docs; highest value-per-token of any researched server (benchmark overall 8.8, ADOPT).

## Notes

- Optional free API key for higher rate limits (env var only if added; none configured).
- No credentials currently required.
