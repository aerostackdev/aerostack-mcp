# GitHub MCP

> **Tier:** Proxy — GitHub hosts and maintains this MCP server.

## What it does
GitHub repos, PRs, issues, branches, code search via GitHub's official hosted MCP

## Setup

1. Get your credentials: github.com → Settings → Developer settings → Personal access tokens → Generate new token
2. Add to Aerostack: **Project → Secrets → Add Secret**

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Yes | GitHub Personal Access Token with required scopes |

## Proxy URL

`https://api.githubcopilot.com/mcp/`

All requests are forwarded to GitHub's official MCP server. New tools added by GitHub are available immediately — no Aerostack update needed.
