# mcp-stream — Stream MCP Server

> GetStream.io chat MCP — manage channels, messages, and users via the Stream Chat API

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-stream`

---

## What You Can Do

This MCP server gives AI agents access to Stream via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Stream directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_channels` | List all channels |
| `get_channel` | Get a channel by type and ID |
| `create_channel` | Create a new channel |
| `send_message` | Send a message to a channel |
| `list_messages` | List messages in a channel |
| `create_user` | Create or update a user |
| `delete_channel` | Delete a channel |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `STREAM_API_KEY` | Yes | Your STREAM API KEY from the service's developer settings |
| `STREAM_API_SECRET` | Yes | Secret key from the provider's developer console |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Stream"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `STREAM_API_KEY`
- `STREAM_API_SECRET`

Once added, every AI agent in your workspace can use Stream tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-stream \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-STREAM-API-KEY: your-stream-api-key' \
  -H 'X-Mcp-Secret-STREAM-API-SECRET: your-stream-api-secret' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_channels","arguments":{}}}'
```

## License

MIT
