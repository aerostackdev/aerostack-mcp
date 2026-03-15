# Linear MCP

> **Tier:** Proxy — Linear hosts and maintains this MCP server.

## What it does
Issues, projects, cycles, teams, roadmap via Linear's official MCP

## Setup

1. Get your credentials: linear.app → Settings → API → Personal API Keys → Create key
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `LINEAR_API_KEY` | Yes | Linear Personal API Key |

## Proxy URL

`https://mcp.linear.app/mcp`

All requests are forwarded to Linear's official MCP server. New tools added by Linear are available immediately — no Aerostack update needed.
