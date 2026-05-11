# mcp-harvest — Harvest MCP Server

> Track time and manage invoicing with Harvest — time entries, projects, clients, tasks, reports, and invoices from AI.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-harvest`

---

## What You Can Do

This MCP server gives AI agents access to Harvest via 16 tools. Connect it to any Aerostack workspace and your agents can interact with Harvest directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_time_entries` | List time entries with optional filters |
| `create_time_entry` | Create a new time entry |
| `update_time_entry` | Update an existing time entry |
| `delete_time_entry` | Delete a time entry |
| `restart_timer` | Restart a stopped timer |
| `stop_timer` | Stop a running timer |
| `list_projects` | List projects |
| `get_project` | Get a project by ID |
| `create_project` | Create a new project |
| `list_clients` | List clients |
| `create_client` | Create a new client |
| `list_tasks` | List all tasks |
| `list_invoices` | List invoices with optional filters |
| `create_invoice` | Create a new invoice |
| `list_reports_time` | Get time report by projects |
| `get_current_user` | Get current authenticated user |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `HARVEST_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |
| `HARVEST_ACCOUNT_ID` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Harvest"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `HARVEST_ACCESS_TOKEN`
- `HARVEST_ACCOUNT_ID`

Once added, every AI agent in your workspace can use Harvest tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-harvest \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-HARVEST-ACCESS-TOKEN: your-harvest-access-token' \
  -H 'X-Mcp-Secret-HARVEST-ACCOUNT-ID: your-harvest-account-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_time_entries","arguments":{}}}'
```

## License

MIT
