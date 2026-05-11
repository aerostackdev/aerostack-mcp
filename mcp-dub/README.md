# mcp-dub — Dub MCP Server

> Link management and analytics via Dub — create short links, track clicks, manage domains and workspaces.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-dub`

---

## What You Can Do

This MCP server gives AI agents access to Dub via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Dub directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `create_link` | Create a new short link in Dub |
| `list_links` | List short links in the Dub workspace |
| `get_link` | Get details of a specific Dub link by ID |
| `update_link` | Update an existing Dub short link |
| `delete_link` | Delete a Dub short link |
| `get_link_analytics` | Get click analytics for a Dub link |
| `list_domains` | List custom domains in the Dub workspace |
| `get_workspace` | Get information about the current Dub workspace |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DUB_API_KEY` | Yes | Your DUB API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Dub"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `DUB_API_KEY`

Once added, every AI agent in your workspace can use Dub tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-dub \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DUB-API-KEY: your-dub-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_link","arguments":{}}}'
```

## License

MIT
