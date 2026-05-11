# mcp-mollie — Mollie MCP Server

> Mollie payment gateway — manage payments, customers, subscriptions, and refunds. Popular in Europe with iDEAL and SEPA support.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-mollie`

---

## What You Can Do

This MCP server gives AI agents access to Mollie via 9 tools. Connect it to any Aerostack workspace and your agents can interact with Mollie directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_payments` | List payments in Mollie with status, amount, and payment method details. |
| `get_payment` | Get full payment details by ID including status, amount, method, and checkout URL. |
| `create_payment` | Create a new payment in Mollie. Amount, description, and redirectUrl are required. |
| `cancel_payment` | Cancel a payment that has not yet been completed. |
| `list_customers` | List customers in Mollie. |
| `create_customer` | Create a new customer in Mollie. |
| `list_subscriptions` | List subscriptions for a specific customer. |
| `create_subscription` | Create a recurring subscription for a customer. |
| `list_refunds` | List all refunds across all payments. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MOLLIE_API_KEY` | Yes | Your Mollie API key — test keys start with test_, live keys start with live_ |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Mollie"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `MOLLIE_API_KEY`

Once added, every AI agent in your workspace can use Mollie tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-mollie \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MOLLIE-API-KEY: your-mollie-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_payments","arguments":{}}}'
```

## License

MIT
