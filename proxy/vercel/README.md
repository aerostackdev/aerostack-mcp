# Vercel MCP

> **Tier:** Proxy — Vercel hosts and maintains this MCP server.

## What it does
Deployments, projects, domains, env vars, logs via Vercel's official MCP

## Setup

1. Get your credentials: vercel.com/account/tokens → Create Token
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `VERCEL_TOKEN` | Yes | Vercel Personal Access Token |

## Proxy URL

`https://mcp.vercel.com`

All requests are forwarded to Vercel's official MCP server. New tools added by Vercel are available immediately — no Aerostack update needed.
