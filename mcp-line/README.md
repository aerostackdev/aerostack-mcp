# mcp-line — Line MCP Server

> LINE messaging API — send messages, broadcast to followers, manage chatbots, and access user profiles.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-line`

---

## What You Can Do

This MCP server gives AI agents access to Line via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Line directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `send_push_message` | Send a push message to a specific user by userId. |
| `send_multicast` | Send a message to multiple users (up to 500) at once. |
| `broadcast_message` | Broadcast a message to all users who have added the bot as a friend. |
| `get_profile` | Get the profile of a LINE user by userId. |
| `get_bot_info` | Get bot info including basic info and message quota. |
| `get_message_quota` | Get remaining monthly message quota for the bot. |
| `create_rich_menu` | Create a rich menu for the bot. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `LINE_CHANNEL_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Line"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `LINE_CHANNEL_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Line tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-line \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LINE-CHANNEL-ACCESS-TOKEN: your-line-channel-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_push_message","arguments":{}}}'
```

## License

MIT
