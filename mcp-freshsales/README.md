# mcp-freshsales — Freshsales MCP Server

> Manage contacts, leads, deals, and accounts in Freshsales CRM with search and note capabilities.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-freshsales`

---

## What You Can Do

This MCP server gives AI agents access to Freshsales via 18 tools. Connect it to any Aerostack workspace and your agents can interact with Freshsales directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_contacts` | List contacts in Freshsales |
| `create_contact` | Create a new contact in Freshsales |
| `get_contact` | Get a specific contact by ID |
| `update_contact` | Update a contact in Freshsales |
| `delete_contact` | Delete a contact from Freshsales |
| `list_leads` | List leads in Freshsales |
| `create_lead` | Create a new lead in Freshsales |
| `get_lead` | Get a specific lead by ID |
| `convert_lead` | Convert a lead to contact, account, and deal |
| `list_deals` | List deals in Freshsales |
| `create_deal` | Create a new deal in Freshsales |
| `get_deal` | Get a specific deal by ID |
| `update_deal` | Update a deal in Freshsales |
| `list_accounts` | List accounts (sales accounts) in Freshsales |
| `create_account` | Create a new account in Freshsales |
| `create_note` | Create a note attached to a CRM record |
| `list_notes` | List notes for a CRM record |
| `search` | Search across Freshsales records |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `FRESHSALES_API_KEY` | Yes | Your FRESHSALES API KEY from the service's developer settings |
| `FRESHSALES_DOMAIN` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Freshsales"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `FRESHSALES_API_KEY`
- `FRESHSALES_DOMAIN`

Once added, every AI agent in your workspace can use Freshsales tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-freshsales \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FRESHSALES-API-KEY: your-freshsales-api-key' \
  -H 'X-Mcp-Secret-FRESHSALES-DOMAIN: your-freshsales-domain' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_contacts","arguments":{}}}'
```

## License

MIT
