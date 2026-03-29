# mcp-close — Close CRM MCP Server

> Automate your entire Close CRM workflow — manage leads, contacts, opportunities, activities, and tasks from any AI agent.

Close is a CRM built specifically for inside sales teams, focused on speed, automation, and communication. This MCP server gives your agents complete access to the Close API: creating and qualifying leads, managing contacts and opportunities, logging notes, creating tasks, and querying activities — all programmatically.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-close`

---

## What You Can Do

- Automatically create and qualify leads from inbound channels, web forms, or enrichment pipelines
- Create contacts and opportunities without touching the Close UI
- Log notes and create follow-up tasks automatically after calls or emails
- Query pipeline status, lead statuses, and user assignments to build reports and dashboards

## Available Tools

| Tool | Description |
|------|-------------|
| _ping | Verify Close API credentials — returns current user info |
| list_leads | List leads with optional search query, status, and user filters |
| get_lead | Get full lead details including contacts, opportunities, and activities |
| create_lead | Create a new lead with contacts and addresses |
| update_lead | Update lead name, status, or description |
| delete_lead | Permanently delete a lead |
| list_contacts | List contacts optionally filtered by lead |
| get_contact | Get full contact details by ID |
| create_contact | Create a contact attached to a lead with emails and phones |
| update_contact | Update contact name, title, emails, or phones |
| delete_contact | Permanently delete a contact |
| list_opportunities | List opportunities filtered by status type, lead, user, or date range |
| get_opportunity | Get full opportunity details by ID |
| create_opportunity | Create an opportunity on a lead with value, currency, and expected date |
| update_opportunity | Update opportunity status, value, or expected date |
| search_opportunities | Search opportunities by query string |
| list_activities | List activities (notes, calls, emails, tasks) with filters |
| create_note | Add a note to a lead |
| create_task | Create a task on a lead with due date and assignment |
| list_tasks | List tasks filtered by assignee, completion, lead, or due date |
| list_users | List all users in the organisation |
| list_pipelines | List pipelines with all stages and status IDs |
| get_lead_statuses | Get all lead statuses — use to find valid status_id values |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| CLOSE_API_KEY | Yes | Close CRM API key | [Close Settings → Developer → API Keys](https://app.close.com/settings/api/) — click "Generate New Key" |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Close"** and click **Add to Workspace**
3. Add your `CLOSE_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can automate Close CRM — no per-user setup needed.

### Example Prompts

```
"Create a new lead in Close for TechCorp with contact Jane Smith, CEO, jane@techcorp.com"
"List all active opportunities worth more than $50,000 and create a summary"
"Find all leads in 'Potential' status and create a follow-up task for each one due next Monday"
"Log a note on lead_abc123 saying we had a discovery call and they are interested in the Pro plan"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-close \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CLOSE-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_leads","arguments":{"query":"Acme","_limit":10}}}'
```

## License

MIT
