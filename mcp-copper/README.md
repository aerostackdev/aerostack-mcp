# mcp-copper — Copper MCP Server

> Manage people, companies, opportunities, activities, and tasks in Copper CRM — built for Google Workspace.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-copper`

---

## What You Can Do

This MCP server gives AI agents access to Copper via 16 tools. Connect it to any Aerostack workspace and your agents can interact with Copper directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_people` | List people (contacts) in Copper CRM |
| `create_person` | Create a new person in Copper CRM |
| `get_person` | Get a specific person by ID |
| `update_person` | Update a person in Copper CRM |
| `delete_person` | Delete a person from Copper CRM |
| `list_companies` | List companies in Copper CRM |
| `create_company` | Create a new company in Copper CRM |
| `get_company` | Get a specific company by ID |
| `update_company` | Update a company in Copper CRM |
| `list_opportunities` | List opportunities (deals) in Copper CRM |
| `create_opportunity` | Create a new opportunity in Copper CRM |
| `get_opportunity` | Get a specific opportunity by ID |
| `update_opportunity` | Update an opportunity in Copper CRM |
| `list_activities` | List activities in Copper CRM |
| `create_task` | Create a new task in Copper CRM |
| `search_records` | Search records in Copper CRM by entity type |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `COPPER_API_KEY` | Yes | Your COPPER API KEY from the service's developer settings |
| `COPPER_USER_EMAIL` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Copper"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `COPPER_API_KEY`
- `COPPER_USER_EMAIL`

Once added, every AI agent in your workspace can use Copper tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-copper \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-COPPER-API-KEY: your-copper-api-key' \
  -H 'X-Mcp-Secret-COPPER-USER-EMAIL: your-copper-user-email' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_people","arguments":{}}}'
```

## License

MIT
