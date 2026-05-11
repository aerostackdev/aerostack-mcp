# mcp-pipedream — Pipedream MCP Server

> Event-driven automation via Pipedream — trigger workflows, manage sources, inspect event logs, and deploy components.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-pipedream`

---

## What You Can Do

This MCP server gives AI agents access to Pipedream via 6 tools. Connect it to any Aerostack workspace and your agents can interact with Pipedream directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_sources` | List event sources for the authenticated Pipedream user |
| `get_source` | Get details of a specific Pipedream event source |
| `list_source_events` | List recent events emitted by a Pipedream event source |
| `list_workflows` | List workflows for the authenticated Pipedream user |
| `get_me` | Get current authenticated Pipedream user info |
| `list_apps` | Search and list available Pipedream app integrations |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `PIPEDREAM_API_KEY` | Yes | Your PIPEDREAM API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Pipedream"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `PIPEDREAM_API_KEY`

Once added, every AI agent in your workspace can use Pipedream tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-pipedream \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PIPEDREAM-API-KEY: your-pipedream-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_sources","arguments":{}}}'
```

## License

MIT
