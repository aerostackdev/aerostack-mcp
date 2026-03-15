# mcp-discord — Discord MCP Server

> Read messages, manage channels, members, and roles across your Discord servers.

Discord is where developer communities, gaming teams, and businesses build real-time communities. This MCP server exposes 23 tools covering the full Discord REST API v10 — letting your AI agents send messages, moderate members, manage channels, and work with threads, all without a WebSocket bot running 24/7.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-discord`

---

## What You Can Do

- Post announcements or moderation notices to specific channels from automated workflows triggered by external events
- Search message history across channels to audit activity or build context for an AI support agent
- Assign or remove roles in response to external actions — e.g. grant a "Subscriber" role when a Stripe payment succeeds
- Create and manage channels and threads programmatically for structured community spaces

## Available Tools

| Tool | Description |
|------|-------------|
| `get_bot_info` | Get the connected bot's username, ID, and avatar |
| `list_guilds` | List all servers the bot is a member of |
| `get_guild` | Get server info: name, description, member count, icon |
| `list_channels` | List all channels in a server (text, voice, category, forum) |
| `get_channel` | Get channel details: name, topic, type, slowmode |
| `get_messages` | Get recent messages from a channel (up to 100, with pagination) |
| `send_message` | Send a message to a channel (supports rich embeds) |
| `reply_to_message` | Reply to a specific message |
| `edit_message` | Edit a message the bot sent |
| `delete_message` | Delete a message (requires Manage Messages permission) |
| `get_pinned_messages` | Get all pinned messages in a channel |
| `pin_message` | Pin a message in a channel |
| `add_reaction` | Add an emoji reaction to a message |
| `list_members` | List server members with roles and join dates |
| `get_member` | Get a member's profile: nickname, roles, join date |
| `list_roles` | List all roles with colors and positions |
| `assign_role` | Give a role to a member |
| `remove_role` | Remove a role from a member |
| `kick_member` | Kick a member from the server |
| `create_channel` | Create a text, voice, announcement, or forum channel |
| `edit_channel` | Edit channel name, topic, or slowmode |
| `create_thread` | Create a thread from a message or as a standalone thread |
| `list_active_threads` | List all active threads in a server |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token for API authentication | [discord.com/developers/applications](https://discord.com/developers/applications) → Your App → **Bot** tab → **Reset Token** → copy token. Enable **Server Members Intent** and **Message Content Intent** under Privileged Gateway Intents. |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Discord"** and click **Add to Workspace**
3. Add your `DISCORD_BOT_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call Discord tools automatically — no per-user setup needed.

### Example Prompts

```
"Post a message to the #announcements channel saying we just shipped v2.0"
"List the last 20 messages in #support and summarize the most common issues"
"Assign the Subscriber role to user 123456789 in the community server"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-discord \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DISCORD-BOT-TOKEN: your-bot-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_guilds","arguments":{}}}'
```

## License

MIT
