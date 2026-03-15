# mcp-slack — Slack MCP Server

> Post messages, search conversations, and manage users in your Slack workspace.

Slack is the real-time communication hub for modern teams. This MCP server gives your AI agents the ability to post messages to any channel, read message history, search across conversations, look up user profiles, and add emoji reactions — making Slack a natural output channel for automated workflows and AI-driven notifications.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-slack`

---

## What You Can Do

- Post notifications, alerts, and summaries directly to Slack channels from any agent workflow — deploy notifications, error alerts, daily digests, and more
- Search message history to retrieve context from past conversations before an agent responds or takes action
- Look up user profiles to resolve names to user IDs or find contact details for routing
- Add emoji reactions to messages programmatically as a lightweight acknowledgment or status signal

## Available Tools

| Tool | Description |
|------|-------------|
| `list_channels` | List public channels in the workspace |
| `post_message` | Post a message to a channel or thread |
| `get_channel_history` | Get recent messages from a channel |
| `search_messages` | Search messages across the workspace |
| `get_user_info` | Get profile info for a specific user |
| `list_users` | List all users in the workspace |
| `add_reaction` | Add an emoji reaction to a message |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `SLACK_BOT_TOKEN` | Yes | Slack bot token (starts with `xoxb-`) | [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **OAuth & Permissions** → add scopes (`channels:read`, `chat:write`, `channels:history`, `search:read`, `users:read`, `reactions:write`) → **Install to Workspace** → copy **Bot User OAuth Token** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Slack"** and click **Add to Workspace**
3. Add your `SLACK_BOT_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call Slack tools automatically — no per-user setup needed.

### Example Prompts

```
"Post a message to #engineering saying the database migration completed successfully"
"Search Slack for any messages about the payment gateway outage from last week"
"List all users in the workspace and find the user ID for sarah@company.com"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-slack \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SLACK-BOT-TOKEN: xoxb-your-bot-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"post_message","arguments":{"channel":"#general","text":"Hello from Aerostack!"}}}'
```

## License

MIT
