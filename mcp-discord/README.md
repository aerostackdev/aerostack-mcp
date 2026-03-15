# mcp-discord

Discord MCP server for Aerostack — read and send messages, manage channels, members, roles, and threads via the Discord REST API v10.

**23 tools** · **1 credential** · Cloudflare Worker

---

## Setup

### Step 1 — Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → give it a name (e.g. `My Aerostack Bot`)
3. Go to the **Bot** tab → click **Add Bot** → confirm
4. Under **Token** → click **Reset Token** → copy the token

### Step 2 — Enable Required Intents

Still on the **Bot** tab, scroll to **Privileged Gateway Intents** and enable:

- **SERVER MEMBERS INTENT** — required to read member lists
- **MESSAGE CONTENT INTENT** — required to read message text content

### Step 3 — Set Bot Permissions

Go to **OAuth2 → URL Generator**:

- **Scopes:** check `bot`
- **Bot Permissions:** check the following:
  - Read Messages / View Channels
  - Send Messages
  - Read Message History
  - Manage Messages *(to delete/pin messages)*
  - Add Reactions
  - Manage Roles *(to assign/remove roles)*
  - Manage Channels *(to create/edit channels)*
  - Kick Members *(optional — only if you need kick_member)*

Copy the generated **OAuth2 URL** at the bottom of the page.

### Step 4 — Add Bot to Your Server

Open the OAuth2 URL in your browser → select your Discord server → click **Authorize**.

### Step 5 — Add Secret to Aerostack

In your Aerostack workspace → **Project Settings → Secrets**:

| Key | Value |
|-----|-------|
| `DISCORD_BOT_TOKEN` | The bot token copied in Step 1 |

> The Aerostack gateway injects this as `X-Mcp-Secret-DISCORD-BOT-TOKEN` — never sent in the request body.

---

## Tools

### Discovery

| Tool | Description |
|------|-------------|
| `get_bot_info` | Get the connected bot's username, ID, and avatar |
| `list_guilds` | List all servers the bot is a member of |
| `get_guild` | Get server info: name, description, member count, icon |
| `list_channels` | List all channels in a server (text, voice, category, forum) |
| `get_channel` | Get channel details: name, topic, type, slowmode |

### Messages

| Tool | Description |
|------|-------------|
| `get_messages` | Get recent messages from a channel (up to 100, with pagination) |
| `send_message` | Send a message to a channel (supports rich embeds) |
| `reply_to_message` | Reply to a specific message |
| `edit_message` | Edit a message the bot sent |
| `delete_message` | Delete a message (requires Manage Messages) |
| `get_pinned_messages` | Get all pinned messages in a channel |
| `pin_message` | Pin a message |
| `add_reaction` | Add an emoji reaction to a message |

### Members & Roles

| Tool | Description |
|------|-------------|
| `list_members` | List server members with roles and join dates |
| `get_member` | Get a member's profile: nickname, roles, join date |
| `list_roles` | List all roles with colors and positions |
| `assign_role` | Give a role to a member |
| `remove_role` | Remove a role from a member |
| `kick_member` | Kick a member from the server |

### Channels & Threads

| Tool | Description |
|------|-------------|
| `create_channel` | Create a text, voice, announcement, or forum channel |
| `edit_channel` | Edit channel name, topic, or slowmode |
| `create_thread` | Create a thread from a message or standalone |
| `list_active_threads` | List all active threads in a server |

---

## Architecture

- **API:** Discord REST API v10 (`https://discord.com/api/v10`)
- **Auth:** `Authorization: Bot {token}` header
- **Transport:** HTTP/JSON-RPC 2.0 — no WebSocket (CF Workers are stateless)
- **No runtime deps** — pure `fetch()` only

> **Note on real-time events:** Discord's Gateway (WebSocket) is not supported — CF Workers cannot maintain persistent connections. For event-driven workflows (e.g. "on new message"), use Discord Webhooks pointed at an Aerostack function.

> **Note on message search:** Discord's REST API has no server-side text search endpoint. Use `get_messages` with `before`/`after` pagination to scan message history.

---

## Local Development

```bash
cd MCP/mcp-discord
npm install
wrangler dev

# Test initialize
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}'

# Test tools/list
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-DISCORD-BOT-TOKEN: Bot YOUR_TOKEN_HERE" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Test get_bot_info
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-DISCORD-BOT-TOKEN: Bot YOUR_TOKEN_HERE" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_bot_info","arguments":{}}}'
```

## Deploy

```bash
aerostack deploy mcp --slug discord
# or: wrangler deploy
```
