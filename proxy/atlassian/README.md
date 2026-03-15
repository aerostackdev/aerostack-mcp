# Atlassian (Jira + Confluence) MCP

> **Tier:** Proxy — Atlassian (Jira + Confluence) hosts and maintains this MCP server.

## What it does
Jira issues, sprints, Confluence pages via Atlassian's official MCP

## Setup

1. Get your credentials: id.atlassian.com/manage-profile/security/api-tokens → Create API token
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `ATLASSIAN_TOKEN` | Yes | Atlassian API Token |
| `ATLASSIAN_CLOUD_ID` | Yes | Your Atlassian Cloud ID (from site URL) |

## Proxy URL

`https://mcp.atlassian.com/v1/mcp`

All requests are forwarded to Atlassian (Jira + Confluence)'s official MCP server. New tools added by Atlassian (Jira + Confluence) are available immediately — no Aerostack update needed.
