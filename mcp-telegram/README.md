# mcp-telegram — Telegram MCP Server

> Build and operate Telegram bots from AI agents — send messages, manage groups and channels, moderate members, and run polls programmatically.

Telegram is a messaging platform with 900M+ active users and a powerful Bot API used by businesses for notifications, support, and community management. This MCP server gives your agents complete access to the Telegram Bot API: sending text, photos, documents, polls, and invoices; managing group and channel members; setting roles and permissions; pinning messages; and handling bot commands.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-telegram`

---

## What You Can Do

- Send automated notifications to Telegram groups or channels from any system event or trigger
- Moderate community groups — ban, restrict, or promote members based on automated rules
- Create and manage polls to gather community feedback directly in Telegram
- Build a full-featured Telegram bot assistant that handles commands, messages, and member events

## Available Tools

| Tool | Description |
|------|-------------|
| get_me | Get the bot's own profile information |
| get_my_commands | Get the list of commands registered for the bot |
| set_my_commands | Set the list of bot commands shown in the Telegram UI |
| get_webhook_info | Get current webhook configuration |
| get_updates | Get incoming updates (messages, callbacks) via long polling |
| get_chat_history | Get recent messages from a chat or group |
| send_message | Send a text message to a chat with Markdown/HTML formatting support |
| send_photo | Send a photo to a chat with optional caption |
| send_document | Send a document/file to a chat |
| send_poll | Send a poll to a group or channel |
| send_invoice | Send a payment invoice via Telegram Payments |
| edit_message | Edit an existing message text |
| delete_message | Delete a message from a chat |
| get_chat | Get details of a chat, group, or channel |
| get_chat_member | Get a specific member's status in a group or channel |
| get_chat_member_count | Get the total member count of a chat |
| get_chat_administrators | List all administrators in a group or channel |
| get_user_profile_photos | Get profile photos of a user |
| get_file | Get a file uploaded to Telegram by file ID |
| ban_member | Ban a user from a group or channel |
| unban_member | Unban a previously banned user |
| restrict_member | Restrict a member's permissions (mute, disable media, etc.) |
| promote_member | Promote a member to administrator with specific permissions |
| pin_message | Pin a message in a group or channel |
| set_chat_title | Update the title of a group or channel |
| set_chat_description | Update the description of a group or channel |
| create_invite_link | Generate a new invite link for a group or channel |
| send_chat_action | Send a typing/uploading indicator to a chat |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| TELEGRAM_BOT_TOKEN | Yes | Telegram Bot API token | Talk to [@BotFather](https://t.me/BotFather) on Telegram → /newbot or /token |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Telegram"** and click **Add to Workspace**
3. Add your `TELEGRAM_BOT_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can send messages and manage your Telegram bot automatically — no per-user setup needed.

### Example Prompts

```
"Send a message to our #alerts Telegram group: 'Deployment to production completed successfully'"
"Create a poll in the community channel asking users which feature they want next"
"Ban the user who has been spamming in our Telegram group — user ID 123456789"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-telegram \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TELEGRAM-BOT-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_message","arguments":{"chat_id":"-1001234567890","text":"Hello from the AI agent!"}}}'
```

## License

MIT
