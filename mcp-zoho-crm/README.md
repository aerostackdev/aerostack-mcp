# mcp-zoho-crm — Zoho CRM MCP Server

> Manage leads, contacts, deals, accounts, and tasks in Zoho CRM with full CRUD operations and lead conversion.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-zoho-crm`

---

## What You Can Do

This MCP server gives AI agents access to Zoho CRM via 20 tools. Connect it to any Aerostack workspace and your agents can interact with Zoho CRM directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_leads` | List leads from Zoho CRM |
| `create_lead` | Create a new lead in Zoho CRM |
| `get_lead` | Get a specific lead by ID |
| `update_lead` | Update a lead in Zoho CRM |
| `delete_lead` | Delete a lead from Zoho CRM |
| `convert_lead` | Convert a lead to contact/account/deal |
| `list_contacts` | List contacts from Zoho CRM |
| `create_contact` | Create a new contact in Zoho CRM |
| `get_contact` | Get a specific contact by ID |
| `update_contact` | Update a contact in Zoho CRM |
| `list_deals` | List deals from Zoho CRM |
| `create_deal` | Create a new deal in Zoho CRM |
| `get_deal` | Get a specific deal by ID |
| `update_deal` | Update a deal in Zoho CRM |
| `list_accounts` | List accounts from Zoho CRM |
| `create_account` | Create a new account in Zoho CRM |
| `search_records` | Search records across Zoho CRM modules |
| `create_task` | Create a new task in Zoho CRM |
| `list_tasks` | List tasks from Zoho CRM |
| `get_modules` | Get all available modules in Zoho CRM |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ZOHO_CRM_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Zoho CRM"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `ZOHO_CRM_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Zoho CRM tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-zoho-crm \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ZOHO-CRM-ACCESS-TOKEN: your-zoho-crm-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_leads","arguments":{}}}'
```

## License

MIT
