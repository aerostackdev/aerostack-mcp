# Discord MCP — Build Plan

> Status: PLANNED — ready to implement
> Priority: #1 (500M+ users, no official MCP, excellent REST API)

---

## 1. Architecture Decision: REST vs WebSocket

### Why REST (not WebSocket Gateway)

Discord has two API surfaces:

| API | What It Does | CF Workers Compatible? |
|-----|-------------|----------------------|
| **REST API v10** | CRUD — get messages, send, manage roles, etc. | YES — pure fetch() |
| **Gateway (WebSocket)** | Real-time events — message created, user joined, etc. | NO — requires persistent long-lived connection |
| **Webhooks** | One-way Discord → your server push | YES — but separate service |

**Decision: REST API v10** — aligns with all other MCPs in this repo (pure `fetch()`, no runtime deps, stateless Cloudflare Worker). The Gateway would require a separate always-on process which breaks the MCP pattern entirely.

**Limitation to document:** No real-time event subscription via MCP. Users who need event streaming (e.g. "notify me when a message arrives") should use Discord Webhooks pointed at an Aerostack function endpoint — a separate integration pattern documented in the MCP README.

---

## 2. What the User Needs to Connect Discord

### Step-by-step setup (document in README)

#### Step 1 — Create a Discord Application
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → name it (e.g. "My Aerostack Bot")
3. Go to **Bot** tab → click **Add Bot** → confirm
4. Under **Token** → click **Reset Token** → copy it → this is `DISCORD_BOT_TOKEN`

#### Step 2 — Enable Required Intents
Still in the Bot tab, scroll to **Privileged Gateway Intents** and enable:
- **SERVER MEMBERS INTENT** — to read member lists
- **MESSAGE CONTENT INTENT** — to read message content (required after April 2022)

#### Step 3 — Set Bot Permissions
Go to **OAuth2 → URL Generator**:
- Scopes: `bot`
- Bot Permissions (select all needed):
  - Read Messages/View Channels
  - Send Messages
  - Manage Messages (to delete/pin)
  - Read Message History
  - Add Reactions
  - Manage Roles (to assign/remove roles)
  - Manage Channels (to create/edit channels)
  - Kick Members (optional)
  - Embed Links

#### Step 4 — Invite Bot to Your Server
Copy the generated OAuth2 URL → open it in browser → select your Discord server → Authorize.

#### Step 5 — Add Secret to Aerostack
In your Aerostack workspace:
- **Secret key:** `DISCORD_BOT_TOKEN`
- **Value:** `Bot TOKEN_FROM_STEP_1` (must include the `Bot ` prefix, or we handle it in code)

> The MCP injects it via `X-Mcp-Secret-DISCORD-BOT-TOKEN` header per Aerostack gateway pattern.

### Credentials Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | YES | Bot token from Discord Developer Portal |

That's it — **one credential**. Simpler than most MCPs.

---

## 3. Discord REST API Details

**Base URL:** `https://discord.com/api/v10`
**Auth header:** `Authorization: Bot {DISCORD_BOT_TOKEN}`
**Rate limits:** 50 requests/second global; per-route limits apply
**Note:** Always send `User-Agent: AerostackMCP/1.0` per Discord requirements

### Key endpoints used

```
GET  /users/@me                          → Bot info
GET  /users/@me/guilds                   → All servers the bot is in
GET  /guilds/{guild_id}?with_counts=true → Server info + member count
GET  /guilds/{guild_id}/channels         → All channels in a server
GET  /guilds/{guild_id}/members?limit=   → Member list
GET  /guilds/{guild_id}/roles            → All roles
GET  /channels/{channel_id}              → Channel details
GET  /channels/{channel_id}/messages     → Message history (max 100)
GET  /channels/{channel_id}/pins         → Pinned messages
GET  /channels/{channel_id}/threads/active → Active threads
POST /channels/{channel_id}/messages     → Send message
PATCH /channels/{channel_id}/messages/{id} → Edit message (bot-owned only)
DELETE /channels/{channel_id}/messages/{id} → Delete message
PUT  /channels/{channel_id}/pins/{msg_id}  → Pin message
DELETE /channels/{channel_id}/pins/{msg_id} → Unpin message
PUT  /channels/{channel_id}/messages/{id}/reactions/{emoji}/@me → Add reaction
POST /channels/{channel_id}/threads      → Create thread
PATCH /channels/{channel_id}             → Edit channel
DELETE /channels/{channel_id}            → Delete channel
POST /guilds/{guild_id}/channels         → Create channel
GET  /guilds/{guild_id}/members/{user_id} → Get member
PUT  /guilds/{guild_id}/members/{user_id}/roles/{role_id} → Add role
DELETE /guilds/{guild_id}/members/{user_id}/roles/{role_id} → Remove role
DELETE /guilds/{guild_id}/members/{user_id} → Kick member
POST /guilds/{guild_id}/roles            → Create role
```

---

## 4. Tools to Implement (23 tools)

### Group A — Discovery (read-only, safe)

| Tool | Endpoint | Description |
|------|----------|-------------|
| `get_bot_info` | `GET /users/@me` | Get bot username, ID, avatar |
| `list_guilds` | `GET /users/@me/guilds` | List all servers the bot is in |
| `get_guild` | `GET /guilds/{guild_id}?with_counts=true` | Server info: name, description, member count, channels count, icon |
| `list_channels` | `GET /guilds/{guild_id}/channels` | All channels (text, voice, category, forum, thread) with metadata |
| `get_channel` | `GET /channels/{channel_id}` | Channel details: name, topic, type, NSFW, slowmode, position |

### Group B — Messages (core use case)

| Tool | Endpoint | Description |
|------|----------|-------------|
| `get_messages` | `GET /channels/{channel_id}/messages` | Get recent messages. Params: `limit` (1-100), `before`/`after` message ID for pagination |
| `send_message` | `POST /channels/{channel_id}/messages` | Send text message with optional embed, reply reference, or mention |
| `reply_to_message` | `POST /channels/{channel_id}/messages` | Reply to a specific message (sets `message_reference`) |
| `edit_message` | `PATCH /channels/{channel_id}/messages/{message_id}` | Edit bot's own message content |
| `delete_message` | `DELETE /channels/{channel_id}/messages/{message_id}` | Delete any message (requires Manage Messages perm) |
| `get_pinned_messages` | `GET /channels/{channel_id}/pins` | Get all pinned messages in a channel |
| `pin_message` | `PUT /channels/{channel_id}/pins/{message_id}` | Pin a message |
| `add_reaction` | `PUT /channels/{channel_id}/messages/{id}/reactions/{emoji}/@me` | Add emoji reaction |

### Group C — Members & Roles (moderation)

| Tool | Endpoint | Description |
|------|----------|-------------|
| `list_members` | `GET /guilds/{guild_id}/members` | List members with usernames, roles, join date. Params: `limit` (1-1000) |
| `get_member` | `GET /guilds/{guild_id}/members/{user_id}` | Member profile: username, nickname, roles, join date, avatar |
| `list_roles` | `GET /guilds/{guild_id}/roles` | All roles with colors, permissions, member count |
| `assign_role` | `PUT /guilds/{guild_id}/members/{user_id}/roles/{role_id}` | Give a role to a member |
| `remove_role` | `DELETE /guilds/{guild_id}/members/{user_id}/roles/{role_id}` | Remove a role from a member |
| `kick_member` | `DELETE /guilds/{guild_id}/members/{user_id}` | Kick member from server (requires permission) |

### Group D — Channels & Threads

| Tool | Endpoint | Description |
|------|----------|-------------|
| `create_channel` | `POST /guilds/{guild_id}/channels` | Create text, announcement, or category channel. Params: `name`, `type`, `topic`, `parent_id` |
| `edit_channel` | `PATCH /channels/{channel_id}` | Edit channel name, topic, slowmode, nsfw flag |
| `create_thread` | `POST /channels/{channel_id}/threads` | Create thread from message or as standalone forum post |
| `list_active_threads` | `GET /channels/{channel_id}/threads/active` | All active (non-archived) threads in a channel |

---

## 5. Input Schema Details (key tools)

### `get_messages`
```json
{
  "type": "object",
  "properties": {
    "channel_id": { "type": "string", "description": "Channel ID (numeric snowflake, e.g. '1234567890')" },
    "limit": { "type": "number", "description": "Number of messages (1-100, default 20)" },
    "before": { "type": "string", "description": "Get messages before this message ID (for pagination)" },
    "after": { "type": "string", "description": "Get messages after this message ID (for pagination)" }
  },
  "required": ["channel_id"]
}
```

### `send_message`
```json
{
  "type": "object",
  "properties": {
    "channel_id": { "type": "string", "description": "Channel ID to send message to" },
    "content": { "type": "string", "description": "Message text content (max 2000 chars)" },
    "embed_title": { "type": "string", "description": "Optional rich embed title" },
    "embed_description": { "type": "string", "description": "Optional rich embed description" },
    "embed_color": { "type": "number", "description": "Optional embed color as integer (e.g. 5793266 for blue)" }
  },
  "required": ["channel_id", "content"]
}
```

### `create_channel`
```json
{
  "type": "object",
  "properties": {
    "guild_id": { "type": "string", "description": "Server ID" },
    "name": { "type": "string", "description": "Channel name (lowercase, no spaces — use hyphens)" },
    "type": {
      "type": "number",
      "enum": [0, 2, 4, 5, 15],
      "description": "0=text, 2=voice, 4=category, 5=announcement, 15=forum"
    },
    "topic": { "type": "string", "description": "Channel topic/description (optional)" },
    "parent_id": { "type": "string", "description": "Category channel ID to place this channel under (optional)" }
  },
  "required": ["guild_id", "name"]
}
```

---

## 6. File Structure

```
MCP/mcp-discord/
├── src/
│   └── index.ts          ← Worker — TOOLS array + callTool() + JSON-RPC handler
├── aerostack.toml         ← Deploy config
├── package.json
├── tsconfig.json
├── PLAN.md               ← This file
└── README.md             ← User setup guide (Steps 1-5 above)
```

---

## 7. Rate Limiting Strategy

Discord enforces per-route rate limits. The MCP should:
- Return Discord's 429 error as a clean `rpcErr` with the `retry_after` value in the message
- NOT implement retry logic (let the caller/Claude handle it — stateless pattern)
- Document: "If you hit rate limits, wait X seconds before retrying"

Discord's global limit is 50 req/s which is well within MCP usage patterns.

---

## 8. Error Handling

| Discord Status | MCP Response |
|----------------|-------------|
| 401 | `rpcErr(-32001, "Invalid bot token — check DISCORD_BOT_TOKEN")` |
| 403 | `rpcErr(-32003, "Missing permission: {permission_name}")` |
| 404 | `rpcErr(-32004, "Resource not found — check guild_id/channel_id/user_id")` |
| 429 | `rpcErr(-32029, "Rate limited — retry after {X}s")` |
| 50001 | `rpcErr(-32003, "Bot does not have access to this resource")` |
| 50013 | `rpcErr(-32003, "Bot missing required permission")` |

Discord error codes: `50001` = Missing Access, `50013` = Missing Permissions, `10003` = Unknown Channel, `10004` = Unknown Guild, `10007` = Unknown Member.

---

## 9. Use Cases This Enables

Once deployed, a developer on Aerostack can:

| Use Case | Tools Used |
|----------|-----------|
| **Community dashboard** | `list_guilds` + `get_guild` + `list_channels` |
| **Support bot** | `get_messages` + `reply_to_message` + `assign_role` |
| **Moderation tool** | `get_messages` + `delete_message` + `kick_member` |
| **Onboarding automation** | `assign_role` + `send_message` (welcome new members) |
| **Announcement bot** | `send_message` with embed to announcement channel |
| **Community analytics** | `list_members` + `list_channels` + `get_messages` |
| **Thread management** | `create_thread` + `list_active_threads` |

---

## 10. Build Order

1. Scaffold files (`package.json`, `tsconfig.json`, `aerostack.toml`)
2. Implement `src/index.ts`:
   - RPC helpers (`rpcOk`, `rpcErr`)
   - `DISCORD_API` base + auth header helper
   - `TOOLS` array (all 23 tools)
   - `callTool()` switch with all implementations
   - JSON-RPC `fetch` handler (`initialize`, `tools/list`, `tools/call`)
3. Write `README.md` with setup guide
4. Test with a real bot token against a test server
5. Deploy: `aerostack deploy mcp --slug discord`

---

## 11. Notes on Limitations

- **No message search:** Discord's search is client-side only; REST API has no `/search` endpoint for regular bots. The `get_messages` tool with `before`/`after` pagination is the workaround.
- **No DMs by default:** Bots can only DM users who have already DMed the bot or share a server. Not implementing DM tools to avoid abuse.
- **Voice channels:** Read metadata only — actually joining/streaming voice is impossible in a stateless Worker (requires Gateway + UDP). Not in scope.
- **Slash commands:** Creating Discord Application Commands is possible via REST but is an advanced use case. Can be added in v2.
