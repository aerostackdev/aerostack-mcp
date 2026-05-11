# mcp-browserbase — Browserbase MCP Server

> Cloud browser automation via Browserbase — create sessions, run Playwright scripts, capture screenshots.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-browserbase`

---

## What You Can Do

This MCP server gives AI agents access to Browserbase via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Browserbase directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `create_session` | Create a new Browserbase browser session |
| `list_sessions` | List Browserbase sessions, optionally filtered by status |
| `get_session` | Get details of a specific Browserbase session |
| `stop_session` | Stop a running Browserbase session |
| `get_session_recording` | Get the recording URL for a completed Browserbase session |
| `list_contexts` | List saved browser contexts (persistent auth state) for the project |
| `delete_context` | Delete a saved browser context |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `BROWSERBASE_API_KEY` | Yes | Your BROWSERBASE API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Browserbase"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `BROWSERBASE_API_KEY`

Once added, every AI agent in your workspace can use Browserbase tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-browserbase \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-BROWSERBASE-API-KEY: your-browserbase-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_session","arguments":{}}}'
```

## License

MIT
