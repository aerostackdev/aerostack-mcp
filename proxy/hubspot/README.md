# HubSpot MCP

> **Tier:** Proxy — HubSpot hosts and maintains this MCP server.

## What it does
Contacts, deals, companies, tickets, workflows via HubSpot's official MCP

## Setup

1. Get your credentials: app.hubspot.com → Settings → Integrations → Private Apps → Create private app
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `HUBSPOT_ACCESS_TOKEN` | Yes | HubSpot Private App Access Token |

## Proxy URL

`https://mcp.hubspot.com`

All requests are forwarded to HubSpot's official MCP server. New tools added by HubSpot are available immediately — no Aerostack update needed.
