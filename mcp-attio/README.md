# mcp-attio — Attio CRM MCP Server

> Automate your entire Attio workspace — manage people, companies, deals, notes, tasks, and workspace members from any AI agent.

Attio is a modern, data-driven CRM built for high-growth B2B teams. This MCP server gives your agents complete access to the Attio REST API: listing and creating records across people, companies, and deals; searching with rich filters; logging notes and tasks on any record; and introspecting workspace membership.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-attio`

---

## What You Can Do

- Enrich and sync people and company records from external data sources automatically
- Create and progress deals through pipeline stages based on external signals (signed contracts, payments, emails)
- Log call summaries and meeting notes directly to CRM records without opening Attio
- Assign tasks to workspace members and track completion via AI-driven workflows
- Search and filter across people, companies, and deals using Attio's native filter syntax

## Available Tools

| Tool | Description |
|------|-------------|
| list_people | List people records with cursor-based pagination |
| get_person | Get a person record by record_id |
| create_person | Create a person with name, email, and phone |
| update_person | Update person attributes |
| delete_person | Delete a person record |
| list_companies | List company records with cursor-based pagination |
| get_company | Get a company record by record_id |
| create_company | Create a company with name, domains, and employee range |
| update_company | Update company attributes |
| delete_company | Delete a company record |
| list_deals | List deal records with cursor-based pagination |
| get_deal | Get a deal record by record_id |
| create_deal | Create a deal with name, stage, and monetary value |
| update_deal | Update deal stage, value, or close date |
| delete_deal | Delete a deal record |
| search_records | Search people, companies, or deals using Attio filter syntax |
| list_record_entries | List all timeline entries on a record |
| create_note | Create a note attached to any record |
| list_notes | List notes for a specific record |
| list_tasks | List tasks, optionally filtered by record or completion status |
| create_task | Create a task linked to people, companies, or deals |
| list_workspace_members | List all members in the workspace |
| _ping | Verify connectivity — calls GET /v2/self |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| ATTIO_ACCESS_TOKEN | Yes | Attio API Bearer token | [Attio Workspace Settings](https://app.attio.com/settings) → **API** → **Access tokens** → Create token with required scopes |

### Required Token Scopes

Your access token needs read/write scopes for the objects you intend to manage:
- **Records** — `record:read`, `record:write`
- **Notes** — `note:read`, `note:write`
- **Tasks** — `task:read`, `task:write`
- **Workspace members** — `workspace_member:read`

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Attio"** and click **Add to Workspace**
3. Add your `ATTIO_ACCESS_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can manage Attio CRM data automatically — no per-user setup needed.

### Example Prompts

```
"Find all people at Acme Corp in Attio and list their email addresses"
"Create a new deal for Acme Corp in the Qualification stage worth $75,000"
"Move deal rec_deal_001 to Closed Won and log a note saying the contract was signed"
"List all incomplete tasks assigned to workspace members due this week"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-attio \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ATTIO-ACCESS-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_records","arguments":{"object_slug":"people","filter":{"name":{"$str_contains":"Jane"}},"limit":10}}}'
```

## License

MIT
