# PayPal Payments MCP

> Official proxy MCP — Orders, payments, subscriptions, payouts via PayPal's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-paypal`

---

## Overview

PayPal Payments is a proxy MCP server that forwards requests directly to the official PayPal MCP endpoint at `https://mcp.paypal.com`. All tools are maintained by PayPal — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by PayPal)
**Auth:** Bearer token via `PAYPAL_ACCESS_TOKEN`

## Available Tools

- **create_order** — Create a new PayPal order with line items, currency, and purchase unit details for checkout
- **capture_payment** — Capture payment for an approved PayPal order, finalizing the transaction and moving funds
- **get_order** — Retrieve the details and current status of a PayPal order by its order ID
- **list_transactions** — List PayPal transaction history for the account within a specified date range
- **create_invoice** — Create a PayPal invoice with line items, due date, and recipient details for billing

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `PAYPAL_ACCESS_TOKEN` | Yes | PayPal REST API Access Token | developer.paypal.com → My Apps → Create App → Copy Client ID + Secret, then get access token via OAuth |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"PayPal Payments"**
3. Enter your `PAYPAL_ACCESS_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use PayPal tools automatically.

## Usage

### Example Prompts

```
"List all my PayPal items and summarize the most recent ones"
"Find anything related to [keyword] in PayPal"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-paypal \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PAYPAL-ACCESS-TOKEN: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_order","arguments":{}}}'
```

## License

MIT
