# Sentry MCP

> **Tier:** Proxy — Sentry hosts and maintains this MCP server.

## What it does
Issues, events, releases, performance via Sentry's official MCP

## Setup

1. Get your credentials: sentry.io → Settings → Auth Tokens → Create New Token
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTRY_AUTH_TOKEN` | Yes | Sentry User Auth Token |
| `SENTRY_ORG_SLUG` | Yes | Your Sentry organization slug (found in org URL) |

## Proxy URL

`https://mcp.sentry.dev/mcp`

All requests are forwarded to Sentry's official MCP server. New tools added by Sentry are available immediately — no Aerostack update needed.
