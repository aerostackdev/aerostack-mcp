# mcp-adyen — Adyen MCP Server

> Full Adyen integration — manage merchants, stores, payment links, payment methods, orders, and webhooks for enterprise payment processing.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-adyen`

---

## What You Can Do

This MCP server gives AI agents access to Adyen via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Adyen directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_merchants` | List all merchant accounts in the Adyen management API |
| `get_merchant` | Get details of a specific Adyen merchant account |
| `list_stores` | List stores for a specific Adyen merchant |
| `get_balance_accounts` | Get payment method settings for a merchant account |
| `create_payment_link` | Create a payment link in Adyen Checkout |
| `get_payment_link` | Get details of an Adyen payment link |
| `update_payment_link` | Update the status of an Adyen payment link |
| `list_payment_methods` | Get available payment methods for a merchant account |
| `create_order` | Create a new Adyen order |
| `get_order` | Get the status of an Adyen order |
| `cancel_order` | Cancel an Adyen order |
| `list_webhooks` | List webhooks configured for an Adyen merchant |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ADYEN_API_KEY` | Yes | Your Adyen API key — found in the Adyen Customer Area under Developers → API credentials |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Adyen"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `ADYEN_API_KEY`

Once added, every AI agent in your workspace can use Adyen tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-adyen \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ADYEN-API-KEY: your-adyen-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_merchants","arguments":{}}}'
```

## License

MIT
