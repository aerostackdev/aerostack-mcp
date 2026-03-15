# Cloudflare MCP

> **Tier:** Proxy — Cloudflare hosts and maintains this MCP server.

## What it does
Cloudflare Workers, KV, R2, D1, Pages, DNS via Cloudflare's official MCP

## Setup

1. Get your credentials: dash.cloudflare.com → My Profile → API Tokens → Create Token
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Yes | Cloudflare API Token with required permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Your Cloudflare Account ID |

## Proxy URL

`https://mcp.cloudflare.com/mcp`

All requests are forwarded to Cloudflare's official MCP server. New tools added by Cloudflare are available immediately — no Aerostack update needed.
