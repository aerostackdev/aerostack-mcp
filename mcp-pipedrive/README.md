# mcp-pipedrive — Pipedrive MCP Server

> Give AI agents full control over your sales pipeline — manage contacts, deals, organizations, activities, and pipeline stages automatically.

Pipedrive is a sales-focused CRM used by over 100,000 companies to manage their revenue pipelines. This MCP server gives your agents complete access to the Pipedrive API: searching and creating contacts and organizations, opening and progressing deals through pipeline stages, logging activities, and managing the pipeline structure itself — enabling fully automated CRM operations.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-pipedrive`

---

## What You Can Do

- Automatically create contacts and deals from lead capture forms, inbound emails, or webhook triggers
- Progress deals through pipeline stages based on external signals (payment received, demo booked, contract signed)
- Log call and meeting activities against deals and contacts to keep CRM records accurate
- Build a sales intelligence agent that surfaces deal risk, stale contacts, or pipeline gaps

## Available Tools

| Tool | Description |
|------|-------------|
| search_persons | Search contacts by name, email, or phone |
| get_person | Get full details of a specific person by ID |
| create_person | Create a new contact with name, email, phone, and organization link |
| update_person | Update an existing contact's details |
| list_person_deals | List all deals associated with a specific person |
| list_deals | List deals filtered by status (open, won, lost) |
| get_deal | Get full details of a specific deal |
| create_deal | Create a new deal with title, value, pipeline, stage, and associations |
| update_deal | Update deal fields — title, value, stage, or status |
| update_deal_stage | Move a deal to a new pipeline stage |
| search_organizations | Search organizations by name |
| get_organization | Get full details of a specific organization |
| create_organization | Create a new organization with name and address |
| list_organization_deals | List all deals associated with a specific organization |
| list_activities | List activities filtered by type (call, meeting, email) and due date |
| get_activity | Get full details of a specific activity |
| create_activity | Create a new activity (call, meeting, task) linked to a deal, person, or org |
| complete_activity | Mark an activity as done/completed |
| list_pipelines | List all pipelines with IDs and names |
| list_stages | List all stages within a specific pipeline |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| PIPEDRIVE_API_TOKEN | Yes | Pipedrive API token | Pipedrive → Settings → Personal preferences → API |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Pipedrive"** and click **Add to Workspace**
3. Add your `PIPEDRIVE_API_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can manage Pipedrive CRM data automatically — no per-user setup needed.

### Example Prompts

```
"Create a new deal called 'Acme Corp - Enterprise Plan' for $50,000 and link it to contact john@acme.com"
"Show me all open deals in the Sales pipeline and move any that haven't been updated in 14 days to 'At Risk'"
"Log a completed call activity against deal #42 with a note about next steps"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-pipedrive \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PIPEDRIVE-API-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_deals","arguments":{"status":"open","limit":20}}}'
```

## License

MIT
