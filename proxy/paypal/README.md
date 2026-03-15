# PayPal MCP

> **Tier:** Proxy — PayPal hosts and maintains this MCP server.

## What it does
Orders, payments, subscriptions, payouts via PayPal's official MCP

## Setup

1. Get your credentials: developer.paypal.com → My Apps → Create App → Copy Client ID + Secret, then get access token via OAuth
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `PAYPAL_ACCESS_TOKEN` | Yes | PayPal REST API Access Token |

## Proxy URL

`https://mcp.paypal.com`

All requests are forwarded to PayPal's official MCP server. New tools added by PayPal are available immediately — no Aerostack update needed.
