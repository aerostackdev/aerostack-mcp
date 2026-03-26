# Razorpay Billing MCP

> Official proxy MCP — Payments, orders, subscriptions, payouts via Razorpay's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-razorpay`

---

## Overview

Razorpay Billing is a proxy MCP server that forwards requests directly to the official Razorpay MCP endpoint at `https://mcp.razorpay.com/mcp`. All tools are maintained by Razorpay — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Razorpay)
**Auth:** Bearer token via `RAZORPAY_KEY_ID`

## Available Tools

- **create_payment_link** — Create a Razorpay payment link with a specified amount, currency, and customer details to share with buyers
- **get_payment** — Retrieve details of a specific Razorpay payment by its payment ID including status and method
- **list_payments** — List Razorpay payments with optional filters for date range, count, and pagination
- **create_order** — Create a Razorpay order that is required before initiating a payment through the Razorpay checkout
- **fetch_order** — Fetch details of an existing Razorpay order by ID, including its status and associated payments

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `RAZORPAY_KEY_ID` | Yes | Razorpay Key ID | dashboard.razorpay.com → Settings → API Keys → Generate Test/Live Key |
| `RAZORPAY_KEY_SECRET` | Yes | Razorpay Key Secret | dashboard.razorpay.com → Settings → API Keys → same as Key ID generation |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Razorpay Billing"**
3. Enter your `RAZORPAY_KEY_ID` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Razorpay tools automatically.

## Usage

### Example Prompts

```
"List all my Razorpay items and summarize the most recent ones"
"Find anything related to [keyword] in Razorpay"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-razorpay \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-RAZORPAY-KEY-ID: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_payment_link","arguments":{}}}'
```

## License

MIT
