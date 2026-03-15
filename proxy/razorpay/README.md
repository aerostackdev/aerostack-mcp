# Razorpay MCP

> **Tier:** Proxy — Razorpay hosts and maintains this MCP server.

## What it does
Payments, orders, subscriptions, payouts via Razorpay's official MCP

## Setup

1. Get your credentials: dashboard.razorpay.com → Settings → API Keys → Generate Test/Live Key
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `RAZORPAY_KEY_ID` | Yes | Razorpay Key ID |
| `RAZORPAY_KEY_SECRET` | Yes | Razorpay Key Secret |

## Proxy URL

`https://mcp.razorpay.com/mcp`

All requests are forwarded to Razorpay's official MCP server. New tools added by Razorpay are available immediately — no Aerostack update needed.
