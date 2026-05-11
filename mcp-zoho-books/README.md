# mcp-zoho-books — Zoho Books MCP Server

> Manage business accounting with Zoho Books — contacts, invoices, bills, expenses, payments, and financial reports from AI.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-zoho-books`

---

## What You Can Do

This MCP server gives AI agents access to Zoho Books via 20 tools. Connect it to any Aerostack workspace and your agents can interact with Zoho Books directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_contacts` | List contacts (customers and vendors) |
| `create_contact` | Create a new contact |
| `get_contact` | Get a contact by ID |
| `list_invoices` | List invoices with optional filters |
| `create_invoice` | Create a new invoice |
| `get_invoice` | Get an invoice by ID |
| `email_invoice` | Send an invoice via email |
| `list_bills` | List vendor bills |
| `create_bill` | Create a vendor bill |
| `list_estimates` | List estimates/quotes |
| `create_estimate` | Create an estimate/quote |
| `list_expenses` | List expenses |
| `create_expense` | Create an expense |
| `list_items` | List products and services |
| `create_item` | Create a new product or service |
| `list_payments` | List customer payments |
| `create_payment` | Record a customer payment |
| `get_balance_sheet` | Get the balance sheet report |
| `get_profit_loss` | Get profit and loss report |
| `get_organization` | Get organization details |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ZOHO_BOOKS_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |
| `ZOHO_BOOKS_ORGANIZATION_ID` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Zoho Books"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `ZOHO_BOOKS_ACCESS_TOKEN`
- `ZOHO_BOOKS_ORGANIZATION_ID`

Once added, every AI agent in your workspace can use Zoho Books tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-zoho-books \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ZOHO-BOOKS-ACCESS-TOKEN: your-zoho-books-access-token' \
  -H 'X-Mcp-Secret-ZOHO-BOOKS-ORGANIZATION-ID: your-zoho-books-organization-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_contacts","arguments":{}}}'
```

## License

MIT
