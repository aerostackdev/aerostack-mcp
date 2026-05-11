# mcp-rocketchat — Rocketchat MCP Server

> Open-source team chat via Rocket.Chat — send messages, manage channels, list rooms and users.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-rocketchat`

---

## What You Can Do

This MCP server gives AI agents access to Rocketchat via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Rocketchat directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_me` | Get current user info including id, name, username, email, and status. |
| `list_channels` | List public channels in the Rocket.Chat server. |
| `get_channel` | Get channel details by channel name. |
| `create_channel` | Create a new public channel. |
| `send_message` | Send a message to a channel or room. |
| `list_messages` | List recent messages in a channel by room ID. |
| `get_room_info` | Get room details by room ID. |
| `list_users` | List users in the Rocket.Chat server. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ROCKETCHAT_URL` | Yes | See provider documentation |
| `ROCKETCHAT_AUTH_TOKEN` | Yes | Personal access token or service token from the provider |
| `ROCKETCHAT_USER_ID` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Rocketchat"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `ROCKETCHAT_URL`
- `ROCKETCHAT_AUTH_TOKEN`
- `ROCKETCHAT_USER_ID`

Once added, every AI agent in your workspace can use Rocketchat tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-rocketchat \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ROCKETCHAT-URL: your-rocketchat-url' \
  -H 'X-Mcp-Secret-ROCKETCHAT-AUTH-TOKEN: your-rocketchat-auth-token' \
  -H 'X-Mcp-Secret-ROCKETCHAT-USER-ID: your-rocketchat-user-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_me","arguments":{}}}'
```

## License

MIT
