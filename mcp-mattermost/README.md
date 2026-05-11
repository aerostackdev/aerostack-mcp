# mcp-mattermost — Mattermost MCP Server

> Open-source team messaging via Mattermost — send messages, manage channels, list users, post to teams.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-mattermost`

---

## What You Can Do

This MCP server gives AI agents access to Mattermost via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Mattermost directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_me` | Get the current user profile including id, username, email, and roles. |
| `list_teams` | List all teams the current user is a member of. |
| `list_channels` | List channels in a team that the current user is a member of. |
| `get_channel` | Get channel details by channel ID. |
| `post_message` | Post a message to a channel. |
| `list_posts` | List recent posts in a channel. |
| `get_post` | Get a specific post by post ID. |
| `create_channel` | Create a new channel in a team. type: O=public, P=private. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MATTERMOST_URL` | Yes | See provider documentation |
| `MATTERMOST_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Mattermost"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `MATTERMOST_URL`
- `MATTERMOST_TOKEN`

Once added, every AI agent in your workspace can use Mattermost tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-mattermost \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MATTERMOST-URL: your-mattermost-url' \
  -H 'X-Mcp-Secret-MATTERMOST-TOKEN: your-mattermost-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_me","arguments":{}}}'
```

## License

MIT
