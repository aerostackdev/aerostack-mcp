# mcp-sendbird — Sendbird MCP Server

> Sendbird in-app messaging MCP — manage channels, messages, and users via the Sendbird platform API

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-sendbird`

---

## What You Can Do

This MCP server gives AI agents access to Sendbird via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Sendbird directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_channels` | List group channels |
| `get_channel` | Get a group channel by URL |
| `create_channel` | Create a new group channel |
| `send_message` | Send a message to a group channel |
| `list_messages` | List messages in a group channel |
| `list_users` | List users in the application |
| `create_user` | Create a new user |
| `delete_message` | Delete a message from a group channel |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SENDBIRD_API_TOKEN` | Yes | Personal access token or service token from the provider |
| `SENDBIRD_APP_ID` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Sendbird"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `SENDBIRD_API_TOKEN`
- `SENDBIRD_APP_ID`

Once added, every AI agent in your workspace can use Sendbird tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-sendbird \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SENDBIRD-API-TOKEN: your-sendbird-api-token' \
  -H 'X-Mcp-Secret-SENDBIRD-APP-ID: your-sendbird-app-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_channels","arguments":{}}}'
```

## License

MIT
