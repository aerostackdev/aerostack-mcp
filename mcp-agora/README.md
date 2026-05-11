# mcp-agora — Agora MCP Server

> Real-time voice and video calling via Agora — manage apps, query usage, and build communication features.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-agora`

---

## What You Can Do

This MCP server gives AI agents access to Agora via 6 tools. Connect it to any Aerostack workspace and your agents can interact with Agora directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `query_channel_user_list` | List all users currently in an Agora channel |
| `ban_user_from_channel` | Ban a user from joining a channel for a specified duration |
| `list_ban_rules` | List all active user ban rules for the app |
| `delete_ban_rule` | Remove a specific user ban rule by ID |
| `query_online_channels` | List currently active (online) channels for the app |
| `get_channel_user_count` | Get the number of users in a specific channel |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `AGORA_CUSTOMER_ID` | Yes | See provider documentation |
| `AGORA_CUSTOMER_SECRET` | Yes | Secret key from the provider's developer console |
| `AGORA_APP_ID` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Agora"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `AGORA_CUSTOMER_ID`
- `AGORA_CUSTOMER_SECRET`
- `AGORA_APP_ID`

Once added, every AI agent in your workspace can use Agora tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-agora \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AGORA-CUSTOMER-ID: your-agora-customer-id' \
  -H 'X-Mcp-Secret-AGORA-CUSTOMER-SECRET: your-agora-customer-secret' \
  -H 'X-Mcp-Secret-AGORA-APP-ID: your-agora-app-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_channel_user_list","arguments":{}}}'
```

## License

MIT
