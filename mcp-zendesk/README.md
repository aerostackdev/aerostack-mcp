# mcp-zendesk

Enterprise-grade MCP server for Zendesk Support — deployed as a Cloudflare Worker on the Aerostack gateway.

Enables AI agents and bots to manage tickets, users, organizations, knowledge base articles, views, macros, and CSAT analytics via natural language.

---

## What This Enables

**In an AI Bot Stack context:**
- Bot can't answer a question? Create a ticket automatically, with full AI conversation summary as an internal note.
- New WhatsApp/Telegram user? Create a Zendesk user and link to their channel identity.
- Returning customer? Search user history, find existing tickets, update with new context.
- Support manager wants queue visibility? list_views + get_view_tickets without logging into Zendesk.
- Daily CSAT analysis? get_satisfaction_ratings + pattern analysis + Slack summary.

**26 tools across 6 groups:**
tickets (9) · users (6) · organizations (4) · knowledge base (4) · views & macros (3) · analytics (2)

---

## Auth — The /token Format

Zendesk API token auth uses a non-obvious Basic auth format:

```
Username: {email}/token         ← MUST append /token to the email
Password: {api_token}
Header:   Authorization: Basic btoa("{email}/token:{api_token}")
```

This is handled automatically — you just provide 3 clean values.

---

## 5-Minute Setup

1. Log into Zendesk Admin Center → `https://{subdomain}.zendesk.com/admin`
2. Go to **Apps and Integrations → APIs → Zendesk API**
3. Enable **Token Access** (toggle, if not already on)
4. Click **Add API Token** → give it a name (e.g. "Aerostack MCP") → copy the token (shown once only)
5. Add all 3 values to your Aerostack workspace secrets

No app creation. No OAuth. No review process. Just copy-paste.

---

## Secrets

| Variable | Header Injected | Example |
|---|---|---|
| `ZENDESK_SUBDOMAIN` | `X-Mcp-Secret-ZENDESK-SUBDOMAIN` | `acme` (from acme.zendesk.com) |
| `ZENDESK_EMAIL` | `X-Mcp-Secret-ZENDESK-EMAIL` | `admin@acme.com` |
| `ZENDESK_API_TOKEN` | `X-Mcp-Secret-ZENDESK-API-TOKEN` | `abc123xyz456...` |

---

## Tool Reference

### Group 1 — Tickets (9 tools)

| Tool | Description |
|------|-------------|
| `list_tickets` | Recent tickets with optional status/priority/assignee filters |
| `search_tickets` | Full Zendesk search syntax — status:open, priority:urgent, tag:billing, free text |
| `get_ticket` | Full ticket details: subject, description, status, priority, tags, channel |
| `create_ticket` | Create ticket with subject, body, requester, priority, tags, channel, internal_note |
| `update_ticket` | Update status, priority, assignee, tags. Use add_tags to append without overwriting. |
| `delete_ticket` | Soft-delete (trash, recoverable within 30 days) |
| `list_ticket_comments` | All comments — public replies and internal notes |
| `add_comment` | ⚠️ Defaults to internal note (public: false). Set public: true explicitly for customer replies. |
| `merge_tickets` | Merge duplicate ticket into another |

### Group 2 — Users (6 tools)

| Tool | Description |
|------|-------------|
| `search_users` | Find by email, name, phone, or free text |
| `get_user` | Full profile: name, email, phone, org, role, tags, notes, timezone |
| `get_user_tickets` | All tickets submitted by this user — support history |
| `create_user` | Create new end-user (or agent/admin) |
| `update_user` | Update name, email, phone, org, tags, notes — only provided fields |
| `get_user_identities` | All verified identities: emails, phones, social logins |

### Group 3 — Organizations (4 tools)

| Tool | Description |
|------|-------------|
| `search_organizations` | Find by name, domain, or external ID |
| `get_organization` | Full org details: name, domains, tags, notes, group |
| `create_organization` | Create new org with domains and tags |
| `update_organization` | Update org fields — only provided fields |

### Group 4 — Knowledge Base (4 tools)

| Tool | Description |
|------|-------------|
| `search_articles` | Full-text search across published Help Center articles |
| `list_articles` | All articles sorted by updated_at, optionally filtered by labels |
| `get_article` | Full article content (HTML stripped to plain text) |
| `create_article` | Create new Help Center article in a section |

### Group 5 — Views & Macros (3 tools)

| Tool | Description |
|------|-------------|
| `list_views` | All active views (saved ticket queues) |
| `get_view_tickets` | Tickets in a specific view |
| `list_macros` | Active macros with their actions (status change, tags, canned replies) |

### Group 6 — Analytics (2 tools)

| Tool | Description |
|------|-------------|
| `get_satisfaction_ratings` | CSAT scores — filter by good/bad, date range |
| `get_ticket_metrics` | SLA metrics — reply time, resolution time, reopens (calendar + business hours) |

---

## The add_comment Public/Internal Distinction

This is the most important safety feature of this MCP.

```
add_comment(ticket_id: 1001, body: "Agent note", public: false)  ← DEFAULT — agents only
add_comment(ticket_id: 1001, body: "Hi Sarah!", public: true)    ← CUSTOMER SEES THIS
```

`public: false` is the default because accidentally sending an internal note to a customer
(with things like "this customer is being difficult") would be a serious incident.

Always explicitly set `public: true` when you intend a customer-facing reply.

---

## The create_ticket internal_note Pattern

When an AI bot escalates to a human agent, pass full context in `internal_note`:

```json
{
    "subject": "Refund request — 3 weeks pending",
    "body": "Customer is requesting a refund for invoice #4821.",
    "requester_email": "sarah@acme.com",
    "priority": "urgent",
    "tags": ["whatsapp", "bot-escalation", "billing"],
    "channel": "whatsapp",
    "internal_note": "🤖 AI Bot Escalation\n\nChannel: WhatsApp (+447911123456)\nSentiment: Frustrated\nConversation: 8 messages, 12 minutes\n\nCustomer has been waiting 3 weeks for £89 refund (Invoice #4821). They've contacted support twice. Tone escalated in last 2 messages.\n\nRecommended action: Check Stripe refund and process manually. High-value customer (Enterprise, £4,800/yr)."
}
```

The human agent opens the ticket and already knows everything. No need to ask the customer to repeat themselves.

---

## curl Test Examples

### Health check
```bash
curl https://your-worker.workers.dev/
```

### Search tickets
```bash
curl -X POST https://your-worker.workers.dev/ \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-ZENDESK-SUBDOMAIN: mycompany" \
  -H "X-Mcp-Secret-ZENDESK-EMAIL: admin@mycompany.com" \
  -H "X-Mcp-Secret-ZENDESK-API-TOKEN: your_api_token" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search_tickets",
      "arguments": { "query": "status:open priority:urgent" }
    }
  }'
```

### Create ticket with internal note
```bash
curl -X POST https://your-worker.workers.dev/ \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-ZENDESK-SUBDOMAIN: mycompany" \
  -H "X-Mcp-Secret-ZENDESK-EMAIL: admin@mycompany.com" \
  -H "X-Mcp-Secret-ZENDESK-API-TOKEN: your_api_token" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_ticket",
      "arguments": {
        "subject": "Billing question via WhatsApp",
        "body": "Customer is asking about their invoice.",
        "requester_email": "customer@example.com",
        "priority": "normal",
        "channel": "whatsapp",
        "internal_note": "Bot escalation: customer could not find invoice #4821"
      }
    }
  }'
```

---

## Deploy

```bash
cd MCP/mcp-zendesk
npm install
npx wrangler deploy
```

Or via Aerostack:
```bash
aerostack deploy mcp --slug zendesk
```

---

## Development

```bash
npm test          # run vitest unit tests
npm run typecheck # TypeScript strict check
npm run dev       # wrangler dev (local)
```
