# mcp-zendesk — Zendesk MCP Server

> Manage tickets, users, organizations, knowledge base, views, and CSAT analytics from your AI agents.

Zendesk is the enterprise support platform used by thousands of customer service teams to handle tickets, knowledge bases, and customer relationships. This MCP server exposes 26 tools across 6 functional groups — tickets, users, organizations, knowledge base, views and macros, and CSAT analytics — letting your AI agents handle everything from ticket creation and routing to CSAT trend analysis, all without logging into Zendesk.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-zendesk`

---

## What You Can Do

- Create support tickets with full context (subject, body, priority, tags, channel, and an internal AI summary note) as part of bot escalation workflows
- Search and update existing tickets to handle status changes, reassignments, and customer replies from AI-driven support agents
- Search and manage users and organizations to build full customer profiles before responding
- Query CSAT scores and SLA metrics to generate daily support health reports without any Zendesk report configuration

## Available Tools

| Tool | Description |
|------|-------------|
| `list_tickets` | List recent tickets with optional status, priority, or assignee filters |
| `search_tickets` | Full Zendesk search syntax — status:open, priority:urgent, tag:billing, free text |
| `get_ticket` | Get full ticket details: subject, description, status, priority, tags, channel |
| `create_ticket` | Create ticket with subject, body, requester, priority, tags, channel, and internal_note |
| `update_ticket` | Update status, priority, assignee, or tags (use add_tags to append without overwriting) |
| `delete_ticket` | Soft-delete a ticket (recoverable within 30 days) |
| `list_ticket_comments` | Get all comments — public replies and internal notes |
| `add_comment` | Add a public reply or internal note to a ticket (defaults to internal) |
| `merge_tickets` | Merge a duplicate ticket into another |
| `search_users` | Find users by email, name, phone, or free text |
| `get_user` | Get full user profile: name, email, phone, org, role, tags, notes, timezone |
| `get_user_tickets` | Get all tickets submitted by a specific user |
| `create_user` | Create a new end-user, agent, or admin |
| `update_user` | Update user name, email, phone, org, tags, or notes |
| `get_user_identities` | Get all verified identities for a user (emails, phones, social) |
| `search_organizations` | Find organizations by name, domain, or external ID |
| `get_organization` | Get full org details: name, domains, tags, notes, group |
| `create_organization` | Create a new organization with domains and tags |
| `update_organization` | Update organization fields |
| `search_articles` | Full-text search across published Help Center articles |
| `list_articles` | List all articles sorted by last updated, optionally filtered by labels |
| `get_article` | Get full article content (HTML stripped to plain text) |
| `create_article` | Create a new Help Center article in a section |
| `list_views` | List all active views (saved ticket queues) |
| `get_view_tickets` | Get tickets in a specific view |
| `list_macros` | List active macros with their actions |
| `get_satisfaction_ratings` | Get CSAT scores, filterable by good/bad and date range |
| `get_ticket_metrics` | Get SLA metrics — reply time, resolution time, reopens (calendar and business hours) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `ZENDESK_SUBDOMAIN` | Yes | Your Zendesk subdomain (e.g. `acme` from `acme.zendesk.com`) | Found in your Zendesk URL |
| `ZENDESK_EMAIL` | Yes | Admin email address for API authentication | The email address you use to log into Zendesk admin |
| `ZENDESK_API_TOKEN` | Yes | API token for authentication | [your-subdomain.zendesk.com/admin](https://your-subdomain.zendesk.com/admin) → **Apps and Integrations** → **APIs** → **Zendesk API** → enable **Token Access** → **Add API Token** → copy the token (shown once) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Zendesk"** and click **Add to Workspace**
3. Add all three secrets under **Project → Secrets**

Once added, every AI agent in your workspace can call Zendesk tools automatically — no per-user setup needed.

### Example Prompts

```
"Search for all open urgent tickets tagged billing and summarize the top 5 issues"
"Create a support ticket for sarah@acme.com with subject Refund request and flag it as high priority with an internal note explaining the situation"
"Get our CSAT scores for the last 30 days and calculate the good-to-bad ratio"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-zendesk \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ZENDESK-SUBDOMAIN: your-subdomain' \
  -H 'X-Mcp-Secret-ZENDESK-EMAIL: admin@yourcompany.com' \
  -H 'X-Mcp-Secret-ZENDESK-API-TOKEN: your-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_tickets","arguments":{"query":"status:open priority:urgent"}}}'
```

## License

MIT
