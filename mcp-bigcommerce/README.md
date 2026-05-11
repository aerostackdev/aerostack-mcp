# mcp-bigcommerce — Bigcommerce MCP Server

> Connect your BigCommerce store to AI — manage products, orders, customers, categories, and coupons with natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-bigcommerce`

---

## What You Can Do

This MCP server gives AI agents access to Bigcommerce via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Bigcommerce directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_products` | List products in the BigCommerce store |
| `get_product` | Get a single product by ID |
| `create_product` | Create a new product in the store |
| `update_product` | Update an existing product |
| `delete_product` | Delete a product from the store |
| `list_orders` | List orders in the store |
| `get_order` | Get a single order by ID |
| `update_order_status` | Update the status of an order |
| `list_customers` | List customers in the store |
| `get_customer` | Get a customer by ID |
| `list_categories` | List product categories |
| `create_category` | Create a new product category |
| `list_coupons` | List coupons in the store |
| `get_store_info` | Get store information and settings |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `BIGCOMMERCE_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |
| `BIGCOMMERCE_STORE_HASH` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Bigcommerce"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `BIGCOMMERCE_ACCESS_TOKEN`
- `BIGCOMMERCE_STORE_HASH`

Once added, every AI agent in your workspace can use Bigcommerce tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-bigcommerce \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-BIGCOMMERCE-ACCESS-TOKEN: your-bigcommerce-access-token' \
  -H 'X-Mcp-Secret-BIGCOMMERCE-STORE-HASH: your-bigcommerce-store-hash' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_products","arguments":{}}}'
```

## License

MIT
