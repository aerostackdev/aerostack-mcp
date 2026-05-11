# mcp-square — Square MCP Server

> Full Square integration — manage locations, catalog items, customers, orders, payments, and invoices for your Square merchant account.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-square`

---

## What You Can Do

This MCP server gives AI agents access to Square via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Square directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_locations` | List all Square locations for the merchant account |
| `get_location` | Get details of a specific Square location |
| `list_catalog_items` | List catalog items from the Square catalog |
| `get_catalog_item` | Get a specific catalog object including related objects |
| `list_customers` | List customers in the Square account |
| `get_customer` | Get details of a specific Square customer |
| `create_customer` | Create a new customer in Square |
| `update_customer` | Update an existing Square customer |
| `list_orders` | Search/list orders for a specific location |
| `get_order` | Get details of a specific Square order |
| `list_payments` | List payments for a location within a time range |
| `get_payment` | Get details of a specific Square payment |
| `list_invoices` | List invoices for a location |
| `get_invoice` | Get details of a specific Square invoice |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SQUARE_ACCESS_TOKEN` | Yes | Your Square access token — found in the Square Developer Dashboard under your application credentials |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Square"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `SQUARE_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Square tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-square \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SQUARE-ACCESS-TOKEN: your-square-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_locations","arguments":{}}}'
```

## License

MIT
