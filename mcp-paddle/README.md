# mcp-paddle — Paddle MCP Server

> Subscription billing and payments via Paddle — manage products, prices, subscriptions, customers, and transactions.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-paddle`

---

## What You Can Do

This MCP server gives AI agents access to Paddle via 9 tools. Connect it to any Aerostack workspace and your agents can interact with Paddle directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_products` | List all products in your Paddle catalog. |
| `get_product` | Get a product by its ID. |
| `list_prices` | List all prices across products. |
| `list_customers` | List customers in your Paddle account. |
| `get_customer` | Get a customer by their ID. |
| `list_subscriptions` | List subscriptions in your Paddle account. |
| `get_subscription` | Get a subscription by its ID. |
| `cancel_subscription` | Cancel a subscription. By default cancels at the end of the current billing period. |
| `list_transactions` | List transactions in your Paddle account. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `PADDLE_API_KEY` | Yes | Your PADDLE API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Paddle"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `PADDLE_API_KEY`

Once added, every AI agent in your workspace can use Paddle tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-paddle \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PADDLE-API-KEY: your-paddle-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_products","arguments":{}}}'
```

## License

MIT
