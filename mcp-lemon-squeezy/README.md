# mcp-lemon-squeezy — Lemon Squeezy MCP Server

> Digital product sales via Lemon Squeezy — manage stores, products, orders, subscriptions, and license keys.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-lemon-squeezy`

---

## What You Can Do

This MCP server gives AI agents access to Lemon Squeezy via 9 tools. Connect it to any Aerostack workspace and your agents can interact with Lemon Squeezy directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_stores` | List all stores in your Lemon Squeezy account. |
| `list_products` | List products in a store. |
| `get_product` | Get a product by its ID. |
| `list_orders` | List orders in a store. |
| `get_order` | Get an order by its ID. |
| `list_subscriptions` | List subscriptions across your stores. |
| `get_subscription` | Get a subscription by its ID. |
| `cancel_subscription` | Cancel a subscription by its ID. This will cancel at period end. |
| `list_customers` | List customers across your stores. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `LEMONSQUEEZY_API_KEY` | Yes | Your LEMONSQUEEZY API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Lemon Squeezy"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `LEMONSQUEEZY_API_KEY`

Once added, every AI agent in your workspace can use Lemon Squeezy tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-lemon-squeezy \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LEMONSQUEEZY-API-KEY: your-lemonsqueezy-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_stores","arguments":{}}}'
```

## License

MIT
