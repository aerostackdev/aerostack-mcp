# Stripe Payments MCP

> Official proxy MCP — Payments, customers, subscriptions, invoices via Stripe's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-stripe`

---

## Overview

Stripe Payments is a proxy MCP server that forwards requests directly to the official Stripe MCP endpoint at `https://mcp.stripe.com`. All tools are maintained by Stripe — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Stripe)
**Auth:** Bearer token via `STRIPE_SECRET_KEY`

## Available Tools

- **create_payment_intent** — Create a Stripe PaymentIntent to initiate a payment flow for a specified amount and currency
- **list_customers** — List Stripe customers with optional filtering by email or creation date and pagination
- **get_customer** — Retrieve a Stripe customer by ID with payment methods, subscriptions, and billing details
- **create_invoice** — Create a Stripe invoice for a customer that can be sent, finalized, and collected automatically
- **list_subscriptions** — List Stripe subscriptions with optional filters for customer, status, or price ID

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe Secret API Key (sk_live_... or sk_test_...) | dashboard.stripe.com → Developers → API keys → Secret key |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Stripe Payments"**
3. Enter your `STRIPE_SECRET_KEY` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Stripe tools automatically.

## Usage

### Example Prompts

```
"List all my Stripe items and summarize the most recent ones"
"Find anything related to [keyword] in Stripe"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-stripe \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-STRIPE-SECRET-KEY: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_payment_intent","arguments":{}}}'
```

## License

MIT
