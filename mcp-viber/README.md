# mcp-viber — Viber MCP Server

> Viber messaging API — send messages to users, broadcast to subscribers, and query bot account info.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-viber`

---

## What You Can Do

This MCP server gives AI agents access to Viber via 5 tools. Connect it to any Aerostack workspace and your agents can interact with Viber directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_account_info` | Get the bot account info including name, uri, category, and subscribers count. |
| `send_text_message` | Send a text message to a specific Viber user. |
| `send_picture_message` | Send a picture message with optional caption to a Viber user. |
| `broadcast_message` | Broadcast a text message to multiple Viber users (max 300 per request). |
| `get_user_details` | Get details of a specific Viber user by their user ID. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `VIBER_AUTH_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Viber"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `VIBER_AUTH_TOKEN`

Once added, every AI agent in your workspace can use Viber tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-viber \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-VIBER-AUTH-TOKEN: your-viber-auth-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_account_info","arguments":{}}}'
```

## License

MIT
