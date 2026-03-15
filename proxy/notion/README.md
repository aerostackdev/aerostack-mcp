# Notion MCP

> **Tier:** Proxy — Notion hosts and maintains this MCP server.

## What it does
Pages, databases, blocks, search via Notion's official MCP

## Setup

1. Get your credentials: notion.so/my-integrations → New integration → Copy Internal Integration Token
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTION_API_KEY` | Yes | Notion Integration Token |

## Proxy URL

`https://mcp.notion.com/mcp`

All requests are forwarded to Notion's official MCP server. New tools added by Notion are available immediately — no Aerostack update needed.
