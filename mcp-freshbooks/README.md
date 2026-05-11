# mcp-freshbooks — Freshbooks MCP Server

> Manage freelance invoicing and accounting with FreshBooks — clients, invoices, payments, expenses, and P&L reports from AI.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-freshbooks`

---

## What You Can Do

This MCP server gives AI agents access to Freshbooks via 18 tools. Connect it to any Aerostack workspace and your agents can interact with Freshbooks directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_account_info` | Get authenticated user info including business memberships |
| `list_clients` | List clients in the account |
| `create_client` | Create a new client |
| `get_client` | Get a client by ID |
| `update_client` | Update an existing client |
| `list_invoices` | List invoices with optional filters |
| `create_invoice` | Create a new invoice |
| `get_invoice` | Get an invoice by ID |
| `update_invoice` | Update an invoice |
| `delete_invoice` | Delete (archive) an invoice |
| `send_invoice` | Send an invoice via email |
| `list_payments` | List payments |
| `create_payment` | Record a payment for an invoice |
| `list_expenses` | List expenses |
| `create_expense` | Create a new expense |
| `list_items` | List product/service items |
| `create_item` | Create a new product/service item |
| `get_profit_loss` | Get profit and loss report for a date range |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `FRESHBOOKS_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |
| `FRESHBOOKS_ACCOUNT_ID` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Freshbooks"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `FRESHBOOKS_ACCESS_TOKEN`
- `FRESHBOOKS_ACCOUNT_ID`

Once added, every AI agent in your workspace can use Freshbooks tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-freshbooks \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FRESHBOOKS-ACCESS-TOKEN: your-freshbooks-access-token' \
  -H 'X-Mcp-Secret-FRESHBOOKS-ACCOUNT-ID: your-freshbooks-account-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_account_info","arguments":{}}}'
```

## License

MIT
