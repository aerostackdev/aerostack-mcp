# mcp-freshdesk — Freshdesk MCP Server

> Supercharge your customer support operations — let AI agents triage tickets, manage contacts, reply to customers, and report on team performance.

Freshdesk is a leading cloud-based customer support platform used by over 60,000 businesses. This MCP server gives your agents complete access to Freshdesk's support infrastructure: creating and triaging tickets, managing contacts and companies, posting replies and internal notes, and pulling performance statistics — enabling fully automated support workflows.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-freshdesk`

---

## What You Can Do

- Automatically triage and route incoming support tickets based on content, priority, or customer tier
- Create support tickets from any trigger — form submissions, emails, Slack messages, or payment failures
- Reply to tickets or add internal notes without leaving your AI workflow
- Pull ticket statistics and agent workloads for real-time support dashboards

## Available Tools

| Tool | Description |
|------|-------------|
| list_tickets | List tickets with optional filters for status, priority, and assignee |
| get_ticket | Get full details of a specific ticket including description and metadata |
| create_ticket | Create a new support ticket with subject, description, priority, and type |
| update_ticket | Update ticket fields — status, priority, assignee, tags, and more |
| delete_ticket | Permanently delete a ticket by ID |
| list_ticket_conversations | List all replies and notes on a ticket |
| add_reply | Post a reply to a ticket visible to the requester |
| add_note | Add an internal note to a ticket visible only to agents |
| update_ticket_status | Convenience tool to change a ticket's status (open, pending, resolved, closed) |
| list_contacts | List contacts with optional filters |
| get_contact | Get full details of a specific contact |
| create_contact | Create a new contact with name, email, phone, and company |
| update_contact | Update contact details |
| search_contacts | Search contacts by email, name, or phone |
| merge_contacts | Merge duplicate contacts into a primary contact |
| list_companies | List all companies in Freshdesk |
| get_company | Get details of a specific company |
| create_company | Create a new company with name, domains, and description |
| list_company_contacts | List all contacts associated with a company |
| list_agents | List all support agents in your Freshdesk account |
| get_agent | Get details of a specific agent |
| get_current_agent | Get the profile of the currently authenticated agent |
| list_groups | List all agent groups in your Freshdesk account |
| get_group | Get details of a specific agent group |
| get_ticket_stats | Get ticket statistics — counts by status, priority, and agent |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| FRESHDESK_API_KEY | Yes | Freshdesk API key | Freshdesk → Profile icon → Profile Settings → API Key |
| FRESHDESK_DOMAIN | Yes | Your Freshdesk subdomain (e.g. `acme` for acme.freshdesk.com) | Your Freshdesk URL |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Freshdesk"** and click **Add to Workspace**
3. Add your `FRESHDESK_API_KEY` and `FRESHDESK_DOMAIN` under **Project → Secrets**

Once added, every AI agent in your workspace can manage Freshdesk support tickets automatically — no per-user setup needed.

### Example Prompts

```
"Create a high-priority ticket for customer john@acme.com — their payment integration is down"
"List all open tickets assigned to agent ID 5 and summarize their status"
"Reply to ticket #1042 saying we've identified the issue and will have a fix within 2 hours"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-freshdesk \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FRESHDESK-API-KEY: your-key' \
  -H 'X-Mcp-Secret-FRESHDESK-DOMAIN: acme' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_tickets","arguments":{"status":"open"}}}'
```

## License

MIT
