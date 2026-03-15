# Figma MCP

> **Tier:** Proxy — Figma hosts and maintains this MCP server.

## What it does
Files, frames, components, comments, variables via Figma's official MCP

## Setup

1. Get your credentials: figma.com → Settings → Account → Personal access tokens → Generate new token
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `FIGMA_ACCESS_TOKEN` | Yes | Figma Personal Access Token |

## Proxy URL

`https://mcp.figma.com/mcp`

All requests are forwarded to Figma's official MCP server. New tools added by Figma are available immediately — no Aerostack update needed.
