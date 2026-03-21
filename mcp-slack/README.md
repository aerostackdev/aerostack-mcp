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

## Setup (Important — read before using)

### Step 1: Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it (e.g., "Aerostack Bot") and select your workspace

### Step 2: Add Bot Token Scopes

Go to **OAuth & Permissions** → scroll to **Bot Token Scopes** → add these scopes:

| Scope | Required For | Tools |
|-------|-------------|-------|
| `chat:write` | **Required** — Send messages | `post_message` |
| `channels:read` | **Required** — List channels | `list_channels` |
| `channels:history` | Read channel messages | `get_channel_history` |
| `groups:read` | List private channels | `list_channels` (private) |
| `search:read` | Search messages | `search_messages` |
| `users:read` | Look up users | `get_user_info`, `list_users` |
| `reactions:write` | Add emoji reactions | `add_reaction` |

At minimum, add `chat:write` and `channels:read`. Add others based on which tools you need.

### Step 3: Install to Workspace

Click **Install to Workspace** → Authorize → Copy the **Bot User OAuth Token** (`xoxb-...`).

### Step 4: Invite Bot to Channels

**This step is required!** The bot can only post to channels it has been invited to.

In each Slack channel where you want the bot to operate:
```
/invite @YourBotName
```

Or: Click channel name → **Integrations** → **Add apps** → select your bot.

If you skip this step, you'll get a `not_in_channel` error when trying to post messages.

### Step 5: Add to Aerostack Workspace

1. Go to your Aerostack workspace → **Add Server** → search **"Slack"**
2. Paste your `SLACK_BOT_TOKEN` (`xoxb-...`) when prompted
3. Click **Test** to verify the connection

## Available Tools

| Tool | Description | Required Scopes |
|------|-------------|-----------------|
| `list_channels` | List public/private channels in the workspace | `channels:read`, `groups:read` |
| `post_message` | Post a message to a channel or thread | `chat:write` |
| `get_channel_history` | Get recent messages from a channel | `channels:history` |
| `search_messages` | Search messages across the workspace | `search:read` |
| `get_user_info` | Get profile info for a specific user | `users:read` |
| `list_users` | List all users in the workspace | `users:read` |
| `add_reaction` | Add an emoji reaction to a message | `reactions:write` |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | Yes | Slack Bot User OAuth Token (starts with `xoxb-`) |

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `missing_scope` | Bot token doesn't have the required scope | Add the scope in Slack API dashboard → OAuth & Permissions → **Reinstall** the app → update token in Aerostack |
| `not_in_channel` | Bot hasn't been invited to the channel | Type `/invite @YourBotName` in the channel |
| `channel_not_found` | Wrong channel name or ID | Use channel ID (e.g., `C6GK6DHPY`) instead of `#name` |
| `invalid_auth` | Token is expired or wrong | Re-copy the token from Slack API dashboard |

## Example Prompts

```
"Post a message to #engineering saying the database migration completed successfully"
"Search Slack for any messages about the payment gateway outage from last week"
"List all users in the workspace and find the user ID for sarah@company.com"
```

## Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-slack \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SLACK-BOT-TOKEN: xoxb-your-bot-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"post_message","arguments":{"channel":"#general","text":"Hello from Aerostack!"}}}'
```

## License

MIT
