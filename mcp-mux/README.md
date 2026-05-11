# mcp-mux — Mux MCP Server

> Video infrastructure via Mux — upload videos, manage assets, create live streams, and get playback IDs.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-mux`

---

## What You Can Do

This MCP server gives AI agents access to Mux via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Mux directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_assets` | List video assets in your Mux environment |
| `get_asset` | Get details for a specific video asset |
| `delete_asset` | Delete a video asset permanently |
| `create_upload` | Create a direct upload URL for uploading a video file |
| `get_upload` | Get the status of a direct upload |
| `list_live_streams` | List live streams in your Mux environment |
| `create_live_stream` | Create a new live stream with a stream key |
| `get_asset_playback_id` | List all playback IDs for a given asset |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MUX_TOKEN_ID` | Yes | Personal access token or service token from the provider |
| `MUX_TOKEN_SECRET` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Mux"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `MUX_TOKEN_ID`
- `MUX_TOKEN_SECRET`

Once added, every AI agent in your workspace can use Mux tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-mux \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MUX-TOKEN-ID: your-mux-token-id' \
  -H 'X-Mcp-Secret-MUX-TOKEN-SECRET: your-mux-token-secret' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_assets","arguments":{}}}'
```

## License

MIT
