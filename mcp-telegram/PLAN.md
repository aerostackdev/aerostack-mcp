# Telegram MCP — Architecture Plan

> Status: PLANNED — priority build
> Opportunity: 800M users, best-in-class Bot API, zero quality cloud-hosted MCP exists

---

## Why This Is a Moat

### The Current Reality for Telegram Bot Operators

There are millions of active Telegram bots. Every SaaS, community, creator, and support team running
one has a `TELEGRAM_BOT_TOKEN` sitting in their `.env`. Their bot is:

- Dumb — it responds to `/commands` with hardcoded strings
- Blind — it can't reason over its own message history
- Isolated — it can't pull context from Stripe, Notion, Linear, or CRM
- Manual — every new behaviour requires a developer to write and deploy code

### What MCP Changes

The token they already have becomes the credential that lets Claude:

1. **Read everything** — message history, user profiles, group members, file attachments
2. **Act intelligently** — send context-aware replies, not scripted responses
3. **Manage the bot** — update commands, configure webhooks, moderate groups
4. **Cross-wire services** — Telegram message triggers a Stripe lookup, a Linear ticket, a Notion entry

This is not a Telegram bot replacement. It is an **AI brain transplant for their existing bot**.

### The Aerostack Moat Specifically

| Angle | Why It Matters |
|-------|---------------|
| **First cloud-hosted Telegram MCP** | npm `telegram-mcp-server` exists but is low quality, local only |
| **One token, instant AI** | Existing bot users plug in their current token — zero migration |
| **Workspace composability** | Telegram + Stripe + Notion + Linear in one Claude session = product |
| **B2B fit** | SaaS support bots, community managers, sales teams — exact Aerostack ICP |
| **Network pull** | Developer demos this to their team → whole team wants Aerostack workspace |

---

## Architecture Decision

### API: Telegram Bot API (REST, not MTProto)

Telegram has two protocol surfaces:

| Protocol | Purpose | CF Workers? |
|----------|---------|-------------|
| **Bot API** (`api.telegram.org/bot{token}/`) | All bot operations via HTTPS REST | **YES** — pure fetch() |
| **MTProto** | Full Telegram client protocol (read any chat, not just bot) | **NO** — binary protocol, requires persistent TCP |

**Decision: Bot API only.**

MTProto would allow reading ANY user's messages (not just bot conversations), but it requires:
- Phone number auth, not a bot token
- A persistent binary TCP connection
- Libraries like GramJS or Telethon — heavy, not CF Workers compatible

Bot API is the right call: stateless, pure HTTPS, one token, covers every real use case.

**What Bot API can and can't read:**

| Can Read | Can't Read |
|----------|-----------|
| Messages sent TO the bot | Private chats between other users |
| Group messages where bot is a member | Groups the bot hasn't been added to |
| Channel posts if bot is admin | MTProto-only features (stories, etc.) |
| Files/media sent to the bot | |

This covers 100% of real use cases for businesses and developers.

### Credential

**One variable:** `TELEGRAM_BOT_TOKEN`

Format: `1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ`

Header injection: `X-Mcp-Secret-TELEGRAM-BOT-TOKEN`

**How users get it:**
1. Open Telegram → search `@BotFather`
2. Send `/newbot` → follow prompts → receive token
3. Add token to Aerostack workspace secrets

If they already have a bot → they already have the token. Zero migration cost.

---

## Full Tool Surface (28 tools)

### Group 1 — Bot Identity & Config (4 tools)

Tools that manage the bot itself, not any specific chat.

| Tool | Bot API Method | Description |
|------|---------------|-------------|
| `get_me` | `getMe` | Bot's username, ID, name, capabilities |
| `get_my_commands` | `getMyCommands` | Current command list visible to users |
| `set_my_commands` | `setMyCommands` | Update command list (name + description pairs) |
| `get_webhook_info` | `getWebhookInfo` | Current webhook URL, pending update count, last error |

### Group 2 — Receiving Messages (2 tools)

The inbound feed — what users and groups are saying to the bot.

| Tool | Bot API Method | Description |
|------|-------------|-------------|
| `get_updates` | `getUpdates` | Pull pending messages/events (polling). Params: limit, offset, allowed_updates filter |
| `get_chat_history` | `forwardMessage` trickery / `getChatHistory` via Bot API messages endpoint | Recent messages in a specific chat (note: Bot API only returns messages the bot received, not full history) |

> **Important note on history:** Bot API does not expose a `getChatHistory` endpoint.
> `getUpdates` has a rolling window (last ~100 updates). For persistent history, developers
> must store messages as they come in. The MCP's `get_updates` is the primary inbound tool.
> This is a known limitation we document, not hide.

### Group 3 — Sending Messages (7 tools)

The core outbound surface — everything the bot can send.

| Tool | Bot API Method | Description |
|------|----------------|-------------|
| `send_message` | `sendMessage` | Text message. Supports HTML/Markdown, reply keyboard, inline buttons, reply-to |
| `send_photo` | `sendPhoto` | Image with optional caption. Accepts URL or file_id |
| `send_document` | `sendDocument` | File attachment with optional caption |
| `send_poll` | `sendPoll` | Multiple choice or quiz poll |
| `send_invoice` | `sendInvoice` | Telegram native payment checkout (requires payment provider token) |
| `edit_message` | `editMessageText` | Edit a previously sent message |
| `delete_message` | `deleteMessage` | Delete a message from chat |

### Group 4 — Chat & User Intelligence (6 tools)

Read-only tools for understanding who is in your chats and what's happening.

| Tool | Bot API Method | Description |
|------|----------------|-------------|
| `get_chat` | `getChat` | Chat/group/channel profile: title, description, member count, invite link, pinned message |
| `get_chat_member` | `getChatMember` | User profile + status in chat: admin/member/banned, join date, permissions |
| `get_chat_member_count` | `getChatMemberCount` | Total member count for a group or channel |
| `get_chat_administrators` | `getChatAdministrators` | Full list of admins with their permissions |
| `get_user_profile_photos` | `getUserProfilePhotos` | User's profile photo history |
| `get_file` | `getFile` + download URL | Get download URL for any file sent to the bot (photos, docs, audio) |

### Group 5 — Moderation (5 tools)

Group management operations — the ones community managers use daily.

| Tool | Bot API Method | Description |
|------|----------------|-------------|
| `ban_member` | `banChatMember` | Ban user from group. Optional until_date for temp bans |
| `unban_member` | `unbanChatMember` | Remove ban, allow user to rejoin via invite |
| `restrict_member` | `restrictChatMember` | Restrict permissions: no messages, no media, no links, etc. |
| `promote_member` | `promoteChatMember` | Give admin rights with specific permission flags |
| `pin_message` | `pinChatMessage` | Pin a message in a group or channel |

### Group 6 — Group & Channel Management (4 tools)

| Tool | Bot API Method | Description |
|------|----------------|-------------|
| `set_chat_title` | `setChatTitle` | Rename a group or channel (bot must be admin) |
| `set_chat_description` | `setChatDescription` | Update group/channel description |
| `create_invite_link` | `createChatInviteLink` | Create invite link with optional member limit and expiry |
| `send_chat_action` | `sendChatAction` | Show "typing...", "uploading photo" etc. for UX |

---

## Key Input Schemas

### `get_updates`
```json
{
  "properties": {
    "limit": { "type": "number", "description": "Messages to return (1-100, default 20)" },
    "offset": { "type": "number", "description": "Mark all updates before this ID as read (use update_id + 1 from last batch)" },
    "allowed_updates": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Filter update types: message, edited_message, channel_post, callback_query, etc."
    }
  }
}
```

### `send_message`
```json
{
  "properties": {
    "chat_id": { "type": "string", "description": "Chat ID or @username. Private: numeric user ID. Group: negative ID. Channel: @channelname" },
    "text": { "type": "string", "description": "Message text (max 4096 chars)" },
    "parse_mode": { "type": "string", "enum": ["HTML", "Markdown", "MarkdownV2"], "description": "Text formatting mode (default HTML)" },
    "reply_to_message_id": { "type": "number", "description": "Reply to a specific message ID (optional)" },
    "disable_notification": { "type": "boolean", "description": "Send silently — no notification sound (optional)" },
    "protect_content": { "type": "boolean", "description": "Prevent forwarding/saving (optional)" },
    "inline_keyboard": {
      "type": "array",
      "description": "Inline button rows. Each row is array of {text, url} or {text, callback_data} buttons",
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "text": { "type": "string" },
            "url": { "type": "string" },
            "callback_data": { "type": "string" }
          }
        }
      }
    }
  },
  "required": ["chat_id", "text"]
}
```

### `set_my_commands`
```json
{
  "properties": {
    "commands": {
      "type": "array",
      "description": "List of commands to set (replaces all existing commands)",
      "items": {
        "type": "object",
        "properties": {
          "command": { "type": "string", "description": "Command without slash, lowercase (e.g. 'start', 'help', 'status')" },
          "description": { "type": "string", "description": "What this command does — shown to users in menu (max 256 chars)" }
        },
        "required": ["command", "description"]
      }
    },
    "language_code": { "type": "string", "description": "BCP-47 language code for localized commands (optional, e.g. 'en', 'ru')" }
  },
  "required": ["commands"]
}
```

### `restrict_member`
```json
{
  "properties": {
    "chat_id": { "type": "string" },
    "user_id": { "type": "number" },
    "can_send_messages": { "type": "boolean", "default": false },
    "can_send_media": { "type": "boolean", "default": false },
    "can_send_polls": { "type": "boolean", "default": false },
    "can_add_web_page_previews": { "type": "boolean", "default": false },
    "until_date": { "type": "number", "description": "Unix timestamp when restriction lifts (0 = permanent)" }
  },
  "required": ["chat_id", "user_id"]
}
```

---

## Power Use Cases (what makes this a moat)

### UC-1: Intelligent Support Bot
**Workspace: Telegram MCP + Stripe MCP + Linear MCP**

User messages bot: "my payment failed yesterday"

Claude:
1. `get_updates` → reads message, extracts user info
2. Stripe `search_customers` → finds customer by Telegram username match or asks for email
3. Stripe `list_invoices` → finds the failed payment
4. Telegram `send_message` → replies with specific invoice details + payment retry link
5. Linear `create_issue` → logs support ticket automatically

No code written. No new deployment. Just three MCPs connected.

---

### UC-2: Community Analytics (Community Managers)
**Workspace: Telegram MCP only**

> "How many new members joined my group this week? What are they talking about?
> Which messages got the most reactions?"

Claude:
1. `get_chat` → gets current member count
2. `get_updates` → scans recent messages
3. `get_chat_administrators` → cross-references admin vs member activity
4. Surfaces: top topics, engagement rate, unanswered questions

This was impossible before without building a custom analytics tool.

---

### UC-3: Broadcast Campaign Management
**Workspace: Telegram MCP + Airtable MCP**

> "Send a personalized message to each subscriber in my Airtable contacts table
> announcing the new feature, include their first name"

Claude:
1. Airtable `list_records` → fetches subscriber list with names + chat_ids
2. Telegram `send_message` in loop with personalized content per user
3. Telegram `send_chat_action` (typing) before each message for natural feel
4. Returns delivery summary

---

### UC-4: Group Moderation Automation
**Workspace: Telegram MCP**

> "Review the last 50 messages in my group and ban anyone who sent links to external sites"

Claude:
1. `get_updates` → reads 50 messages
2. Identifies messages with external URLs
3. `get_chat_member` → checks if they're admin (skip if so)
4. `ban_member` → bans offending users
5. `delete_message` → removes the spam messages
6. `send_message` → posts moderation notice to group

---

### UC-5: Multi-language Bot Commands
**Workspace: Telegram MCP**

> "Set up my bot's command list in English, Russian, and Spanish"

Claude calls `set_my_commands` three times with `language_code` en/ru/es — something that
takes 10 minutes of API docs reading and code writing without MCP.

---

### UC-6: Channel Content Pipeline
**Workspace: Telegram MCP + Notion MCP**

> "Take all the articles saved in my Notion database this week and post them
> as formatted messages to my Telegram channel with the title, summary, and link"

Claude:
1. Notion `query_database` → gets this week's articles
2. Formats each as HTML (bold title, summary paragraph, URL button)
3. Telegram `send_message` to channel with inline keyboard button linking to full article

This is a complete content publishing workflow with zero code.

---

## Error Handling Map

| Telegram Error | Code | MCP Message |
|---------------|------|-------------|
| Invalid token | 401 | "Invalid bot token — check TELEGRAM_BOT_TOKEN in workspace secrets" |
| Bot blocked by user | 403 | "User has blocked this bot — cannot send message to chat_id {id}" |
| Chat not found | 400 + "chat not found" | "chat_id not found — bot may not be a member of this chat" |
| Not enough rights | 400 + "not enough rights" | "Bot lacks permission for this action — promote bot to admin in this chat" |
| Message too long | 400 + "message is too long" | "Message exceeds 4096 characters — split into multiple messages" |
| Flood control | 429 | "Telegram rate limit — retry after {retry_after}s" |
| User not found | 400 + "user not found" | "user_id not found — user may not have interacted with this bot" |

---

## File Structure

```
MCP/mcp-telegram/
├── src/
│   └── index.ts          ← 28 tools, pure fetch(), ~700 lines
├── aerostack.toml
├── package.json
├── tsconfig.json
├── PLAN.md               ← This file
└── README.md             ← Setup (BotFather steps) + tool reference + use cases
```

---

## What to Build After Telegram

With Discord + Telegram built, the pattern is clear for the rest of the communication tier:

| MCP | Token Type | Primary Moat |
|-----|-----------|-------------|
| **WhatsApp Business** | Access Token + Phone ID | 2B users, business messaging |
| **Twitter/X** | Bearer Token + OAuth | Social listening, posting |
| **Instagram Graph** | Access Token + Account ID | DMs, comments, stories |
| **Zoom** | OAuth Token | Meeting management, recordings |

Each follows identical pattern: REST API, one/two tokens, CF Worker, no local process.

---

## Build Checklist

- [ ] `src/index.ts` — all 28 tools implemented
- [ ] `aerostack.toml`
- [ ] `package.json`
- [ ] `tsconfig.json`
- [ ] `README.md` — BotFather setup guide
- [ ] `MCP-list.json` — status → built
- [ ] `MCP/README.md` — add to table
- [ ] typecheck passes (`npx tsc --noEmit`)
