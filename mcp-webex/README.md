# mcp-webex — Webex MCP Server

> Collaborate with Cisco Webex — send messages, manage rooms, add members, and schedule meetings via the Webex API.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-webex`

---

## What You Can Do

This MCP server gives AI agents access to Webex via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Webex directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_current_user` | Get the current authenticated Webex user |
| `list_rooms` | List Webex rooms/spaces |
| `get_room` | Get a specific room by ID |
| `create_room` | Create a new Webex room/space |
| `list_messages` | List messages in a room |
| `get_message` | Get a specific message by ID |
| `send_message` | Send a message to a room or person |
| `delete_message` | Delete a message |
| `list_memberships` | List memberships for a room |
| `add_member` | Add a person to a room by email |
| `remove_member` | Remove a membership from a room |
| `list_teams` | List all Webex teams |
| `create_team` | Create a new Webex team |
| `create_meeting` | Schedule a Webex meeting |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `WEBEX_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Webex"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `WEBEX_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Webex tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-webex \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-WEBEX-ACCESS-TOKEN: your-webex-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_current_user","arguments":{}}}'
```

## License

MIT
