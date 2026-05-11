# mcp-gorgias — Gorgias MCP Server

> Full Gorgias integration — manage ecommerce support tickets, customers, macros, satisfaction surveys, and team users.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-gorgias`

---

## What You Can Do

This MCP server gives AI agents access to Gorgias via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Gorgias directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_tickets` | List support tickets with pagination and status filter. |
| `get_ticket` | Get full ticket details by ID. |
| `create_ticket` | Create a new support ticket. |
| `update_ticket` | Update ticket status, assignee, or tags. |
| `create_message` | Add a message to an existing ticket. |
| `list_customers` | List customers with pagination. |
| `get_customer` | Get customer details by ID. |
| `list_tags` | List all tags in the account. |
| `list_satisfaction_surveys` | List customer satisfaction surveys. |
| `list_macros` | List macros (canned responses and workflows). |
| `get_stats` | Get overview statistics for the helpdesk. |
| `list_users` | List all agent users in the account. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GORGIAS_EMAIL` | Yes | Your Gorgias account email address |
| `GORGIAS_API_KEY` | Yes | Your Gorgias API key — found in Settings → REST API |
| `GORGIAS_DOMAIN` | Yes | Your Gorgias subdomain (e.g. 'mystore' for mystore.gorgias.com) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Gorgias"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `GORGIAS_EMAIL`
- `GORGIAS_API_KEY`
- `GORGIAS_DOMAIN`

Once added, every AI agent in your workspace can use Gorgias tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-gorgias \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GORGIAS-EMAIL: your-gorgias-email' \
  -H 'X-Mcp-Secret-GORGIAS-API-KEY: your-gorgias-api-key' \
  -H 'X-Mcp-Secret-GORGIAS-DOMAIN: your-gorgias-domain' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_tickets","arguments":{}}}'
```

## License

MIT
