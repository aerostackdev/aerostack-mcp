# mcp-google-chat — Google Chat MCP Server

> Collaborate with Google Chat — send messages, manage spaces, add reactions, and list members via the Google Chat API.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-google-chat`

---

## What You Can Do

This MCP server gives AI agents access to Google Chat via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Google Chat directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_spaces` | List Google Chat spaces the user is a member of |
| `get_space` | Get details of a specific space |
| `list_messages` | List messages in a space |
| `get_message` | Get a specific message |
| `send_message` | Send a message to a space |
| `update_message` | Update the text of a message |
| `delete_message` | Delete a message from a space |
| `list_members` | List members of a space |
| `get_member` | Get a specific member of a space |
| `create_reaction` | Add an emoji reaction to a message |
| `list_reactions` | List reactions on a message |
| `delete_reaction` | Delete a reaction from a message |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Google Chat"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `GOOGLE_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Google Chat tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-google-chat \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: your-google-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_spaces","arguments":{}}}'
```

## License

MIT
