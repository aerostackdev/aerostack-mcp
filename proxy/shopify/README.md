# Shopify MCP

> **Tier:** Proxy — Shopify hosts and maintains this MCP server.

## What it does
Products, orders, customers, inventory via Shopify's official MCP

## Setup

1. Get your credentials: Found in your Shopify admin URL
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_DOMAIN` | Yes | Your Shopify store domain (e.g. mystore.myshopify.com) |
| `SHOPIFY_ACCESS_TOKEN` | Yes | Shopify Admin API Access Token |

## Proxy URL

`https://{SHOPIFY_DOMAIN}/api/mcp`

All requests are forwarded to Shopify's official MCP server. New tools added by Shopify are available immediately — no Aerostack update needed.
