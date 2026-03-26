# mcp-resend — Resend MCP Server

> Send transactional emails and manage domains from your AI agents.

Resend is the developer-first email platform built for reliable transactional delivery — welcome emails, password resets, invoice notifications, and anything else your product needs to send. This MCP server lets your AI agents send emails, check delivery status, list recent sends, and inspect verified sending domains without touching code.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-resend`

---

## What You Can Do

- Send transactional emails (HTML or plain text) from agent workflows — triggered by signups, payments, alerts, or any event
- Check the delivery status of a previously sent email by ID to confirm it was received
- List recent emails to audit what has been sent and identify delivery issues
- List verified sending domains to confirm which domains are authorized before sending

## Available Tools

| Tool | Description |
|------|-------------|
| `send_email` | Send a transactional email (HTML or plain text, supports CC, BCC, reply-to) |
| `get_email` | Get details and delivery status of a sent email by ID |
| `list_emails` | List recently sent emails |
| `list_domains` | List verified sending domains |
| `cancel_email` | Cancel a scheduled email before it sends |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `RESEND_API_KEY` | Yes | Resend API key for all email operations | [resend.com/api-keys](https://resend.com/api-keys) → **Create API Key** → give it a name and set permissions → copy the key (shown once) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Resend"** and click **Add to Workspace**
3. Add your `RESEND_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Resend tools automatically — no per-user setup needed.

### Example Prompts

```
"Send a welcome email to new-user@example.com from hello@myapp.com with the onboarding instructions"
"Check the delivery status of the email with ID email_abc123xyz"
"List all verified sending domains on our Resend account"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-resend \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-RESEND-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_email","arguments":{"from":"hello@yourdomain.com","to":"recipient@example.com","subject":"Welcome aboard","html":"<p>Thanks for signing up!</p>"}}}'
```

## License

MIT
