# Intercom MCP

> **Tier:** Proxy — Intercom hosts and maintains this MCP server.

## What it does
Conversations, contacts, tickets, articles via Intercom's official MCP

## Setup

1. Get your credentials: app.intercom.com → Settings → Integrations → Developer Hub → New App → Authentication
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `INTERCOM_ACCESS_TOKEN` | Yes | Intercom Access Token |

## Proxy URL

`https://mcp.intercom.com/mcp`

All requests are forwarded to Intercom's official MCP server. New tools added by Intercom are available immediately — no Aerostack update needed.
