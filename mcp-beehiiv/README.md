# mcp-beehiiv — Beehiiv MCP Server

> Full Beehiiv integration — manage newsletter publications, posts, subscriptions, segments, and get publication statistics.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-beehiiv`

---

## What You Can Do

This MCP server gives AI agents access to Beehiiv via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Beehiiv directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_publications` | List all Beehiiv publications for the authenticated account |
| `get_publication` | Get details of a specific Beehiiv publication |
| `list_posts` | List posts for a Beehiiv publication |
| `get_post` | Get details of a specific Beehiiv post |
| `list_subscriptions` | List subscriptions for a Beehiiv publication |
| `get_subscription` | Get details of a specific subscription |
| `create_subscription` | Create a new subscription to a Beehiiv publication |
| `update_subscription` | Update an existing Beehiiv subscription |
| `delete_subscription` | Delete a Beehiiv subscription |
| `list_segments` | List audience segments for a Beehiiv publication |
| `get_segment` | Get details of a specific Beehiiv audience segment |
| `get_stats` | Get aggregate statistics for a Beehiiv publication |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `BEEHIIV_API_KEY` | Yes | Your Beehiiv API key — found in your Beehiiv account under Settings → API |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Beehiiv"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `BEEHIIV_API_KEY`

Once added, every AI agent in your workspace can use Beehiiv tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-beehiiv \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-BEEHIIV-API-KEY: your-beehiiv-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_publications","arguments":{}}}'
```

## License

MIT
