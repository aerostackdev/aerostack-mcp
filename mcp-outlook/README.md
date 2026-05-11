# mcp-outlook — Outlook MCP Server

> Manage Outlook email at scale — inbox rules, focused inbox, folders, message search, attachments, and mail flow automation via Microsoft Graph.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-outlook`

---

## What You Can Do

This MCP server gives AI agents access to Outlook via 18 tools. Connect it to any Aerostack workspace and your agents can interact with Outlook directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_messages` | List emails with filtering by folder, subject, sender, read status |
| `get_message` | Get a single email with full body, headers, and attachment metadata |
| `send_email` | Send an email with HTML or text body, CC, BCC, and importance |
| `reply_to_message` | Reply to an email (reply or reply-all) |
| `move_message` | Move a message to a different folder |
| `list_folders` | List all mail folders with message counts |
| `create_folder` | Create a new mail folder |
| `update_folder` | Rename a mail folder |
| `delete_folder` | Delete a mail folder and all its contents |
| `search_messages` | Full-text search across emails by keyword, sender, date range |
| `get_focused_inbox` | List messages from the Focused Inbox (not Other) |
| `list_inbox_rules` | List all inbox rules (auto-move, auto-reply, etc.) |
| `create_inbox_rule` | Create an inbox rule to auto-move, categorize, or flag messages |
| `delete_inbox_rule` | Delete an inbox rule |
| `list_attachments` | List attachments on a message with size and content type |
| `get_attachment` | Download an attachment (returns base64 for binary, text for text files) |
| `get_mailbox_settings` | Get mailbox settings: auto-reply, working hours, locale, time zone |
| `update_auto_reply` | Configure out-of-office auto-reply settings |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MICROSOFT_ACCESS_TOKEN` | Yes | Microsoft OAuth 2.0 access token (requires Mail.ReadWrite, Mail.Send, MailboxSettings.ReadWrite scopes) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Outlook"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `MICROSOFT_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Outlook tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-outlook \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MICROSOFT-ACCESS-TOKEN: your-microsoft-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_messages","arguments":{}}}'
```

## License

MIT
