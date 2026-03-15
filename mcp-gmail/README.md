# mcp-gmail — Gmail MCP Server

> Give AI agents full access to Gmail — read, search, send, reply, organize, and manage email conversations programmatically.

Gmail is the world's most widely used email platform. This MCP server gives your agents complete access to the Gmail API: searching and reading messages, sending emails and replies, managing labels and folders, forwarding threads, drafting emails, and downloading attachments — enabling fully automated email workflows without human intervention.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-gmail`

---

## What You Can Do

- Search and read incoming emails with Gmail's full query syntax (sender, subject, date, labels, attachments)
- Draft and send emails or replies on behalf of a user automatically from any trigger
- Organize inboxes by applying, creating, or removing labels based on email content
- Build email-driven automation — parse invoices, route support requests, or triage leads

## Available Tools

| Tool | Description |
|------|-------------|
| list_messages | List Gmail messages matching an optional query with pagination |
| get_message | Get a specific message by ID with headers, body, and labels |
| search_messages | Search messages using Gmail query syntax (from:, subject:, has:attachment, etc.) |
| list_threads | List conversation threads matching an optional query |
| get_thread | Get a full conversation thread including all messages |
| send_email | Send an email with plain text or HTML body, CC, and BCC |
| reply_to_message | Reply to a message in the same thread with correct email headers |
| forward_message | Forward a message to one or more recipients with an optional note |
| create_draft | Create a draft email without sending it |
| list_labels | List all Gmail labels including system and user-created labels |
| get_label | Get details of a specific label with message counts |
| create_label | Create a new label for organizing messages |
| modify_message_labels | Add or remove labels on a message (use to mark read, move to folder, etc.) |
| trash_message | Move a message to trash (recoverable for 30 days) |
| delete_message | Permanently delete a message — cannot be undone |
| mark_as_read | Mark a message as read |
| mark_as_unread | Mark a message as unread |
| get_profile | Get the authenticated Gmail user's profile and message counts |
| list_drafts | List draft emails in the drafts folder |
| get_attachment | Download a message attachment by attachment ID |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| GMAIL_ACCESS_TOKEN | Yes | OAuth 2.0 access token with `gmail.send` and `gmail.readonly` scopes | [Google Cloud Console](https://console.cloud.google.com) → APIs → Gmail API → OAuth 2.0 credentials |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Gmail"** and click **Add to Workspace**
3. Add your `GMAIL_ACCESS_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can read and send Gmail automatically — no per-user setup needed.

### Example Prompts

```
"Search my inbox for unread emails from customers asking about pricing and summarize them"
"Reply to the email from alice@acme.com saying I'll send the proposal by Friday"
"Label all emails from support@stripe.com as 'Billing' and mark them as read"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-gmail \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GMAIL-ACCESS-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_messages","arguments":{"query":"is:unread from:boss@example.com"}}}'
```

## License

MIT
