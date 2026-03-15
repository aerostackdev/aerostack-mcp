# Sentry Error Monitoring MCP

> Official proxy MCP — Issues, events, releases, performance via Sentry's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-sentry`

---

## Overview

Sentry Error Monitoring is a proxy MCP server that forwards requests directly to the official Sentry MCP endpoint at `https://mcp.sentry.dev/mcp`. All tools are maintained by Sentry — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Sentry)
**Auth:** Bearer token via `SENTRY_AUTH_TOKEN`

## Available Tools

- **list_issues** — List Sentry error issues for a project with filtering by status, assignee, or date range
- **get_issue** — Retrieve full details of a Sentry issue including stack trace, user impact, and occurrence count
- **resolve_issue** — Mark a Sentry issue as resolved, optionally in the next release or a specific version
- **list_projects** — List all Sentry projects in the organization with their slugs, platforms, and team assignments
- **get_event** — Retrieve a specific Sentry event by ID with full exception details, breadcrumbs, and context

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `SENTRY_AUTH_TOKEN` | Yes | Sentry User Auth Token | sentry.io → Settings → Auth Tokens → Create New Token |
| `SENTRY_ORG_SLUG` | Yes | Your Sentry organization slug (found in org URL) | sentry.io → Settings → Organization → slug shown in URL |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Sentry Error Monitoring"**
3. Enter your `SENTRY_AUTH_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Sentry tools automatically.

## Usage

### Example Prompts

```
"List all my Sentry items and summarize the most recent ones"
"Find anything related to [keyword] in Sentry"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-sentry \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SENTRY-AUTH-TOKEN: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_issues","arguments":{}}}'
```

## License

MIT
