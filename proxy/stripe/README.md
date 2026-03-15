# Stripe MCP

> **Tier:** Proxy — Stripe hosts and maintains this MCP server.

## What it does
Payments, customers, subscriptions, invoices via Stripe's official MCP

## Setup

1. Get your credentials: dashboard.stripe.com → Developers → API keys → Secret key
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe Secret API Key (sk_live_... or sk_test_...) |

## Proxy URL

`https://mcp.stripe.com`

All requests are forwarded to Stripe's official MCP server. New tools added by Stripe are available immediately — no Aerostack update needed.
