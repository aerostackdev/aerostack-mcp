# mcp-wave — Wave MCP Server

> Manage free accounting with Wave — invoices, customers, products, transactions, and chart of accounts via GraphQL from AI.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-wave`

---

## What You Can Do

This MCP server gives AI agents access to Wave via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Wave directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_invoices` | List invoices for the business |
| `get_invoice` | Get a single invoice by ID |
| `create_invoice` | Create a new invoice |
| `send_invoice` | Send an invoice to the customer |
| `delete_invoice` | Delete an invoice |
| `list_customers` | List customers for the business |
| `create_customer` | Create a new customer |
| `list_products` | List products for the business |
| `create_product` | Create a new product |
| `list_accounts` | List chart of accounts |
| `create_income_transaction` | Create an income transaction |
| `create_expense_transaction` | Create an expense transaction |
| `list_transactions` | List transactions for the business |
| `get_business` | Get business information |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `WAVE_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |
| `WAVE_BUSINESS_ID` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Wave"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `WAVE_ACCESS_TOKEN`
- `WAVE_BUSINESS_ID`

Once added, every AI agent in your workspace can use Wave tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-wave \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-WAVE-ACCESS-TOKEN: your-wave-access-token' \
  -H 'X-Mcp-Secret-WAVE-BUSINESS-ID: your-wave-business-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_invoices","arguments":{}}}'
```

## License

MIT
