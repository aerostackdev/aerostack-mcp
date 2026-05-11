# mcp-pinterest — Pinterest MCP Server

> Full Pinterest integration — manage boards, pins, and get user analytics for your Pinterest business account.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-pinterest`

---

## What You Can Do

This MCP server gives AI agents access to Pinterest via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Pinterest directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_current_user` | Get the current authenticated Pinterest user account |
| `list_boards` | List boards for the current Pinterest user |
| `get_board` | Get details of a specific Pinterest board |
| `create_board` | Create a new Pinterest board |
| `update_board` | Update a Pinterest board |
| `delete_board` | Delete a Pinterest board |
| `list_pins` | List pins on a Pinterest board |
| `get_pin` | Get details of a specific Pinterest pin |
| `create_pin` | Create a new Pinterest pin |
| `update_pin` | Update a Pinterest pin |
| `delete_pin` | Delete a Pinterest pin |
| `get_analytics` | Get analytics for the current Pinterest user account |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `PINTEREST_ACCESS_TOKEN` | Yes | Your Pinterest access token — create one in the Pinterest Developer Portal under My Apps |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Pinterest"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `PINTEREST_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Pinterest tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-pinterest \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PINTEREST-ACCESS-TOKEN: your-pinterest-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_current_user","arguments":{}}}'
```

## License

MIT
