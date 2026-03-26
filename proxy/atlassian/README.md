# Atlassian Cloud MCP

> Official proxy MCP — Jira issues, sprints, Confluence pages via Atlassian's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-atlassian`

---

## Overview

Atlassian Cloud is a proxy MCP server that forwards requests directly to the official Atlassian MCP endpoint at `https://mcp.atlassian.com/v1/mcp`. All tools are maintained by Atlassian — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Atlassian)
**Auth:** Bearer token via `ATLASSIAN_TOKEN`

## Available Tools

- **create_issue** — Create a new Jira issue in a specified project with summary, description, and issue type
- **get_issue** — Retrieve a Jira issue by its key, including status, assignee, comments, and linked issues
- **search_issues** — Search Jira issues using JQL (Jira Query Language) with optional pagination
- **update_issue** — Update fields of an existing Jira issue such as status, assignee, priority, or description
- **list_projects** — List all Jira projects accessible to the authenticated user in the Atlassian cloud instance
- **get_confluence_page** — Retrieve a Confluence page by ID, returning its title, body content, and metadata

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `ATLASSIAN_TOKEN` | Yes | Atlassian API Token | id.atlassian.com/manage-profile/security/api-tokens → Create API token |
| `ATLASSIAN_CLOUD_ID` | Yes | Your Atlassian Cloud ID (from site URL) | Found at admin.atlassian.com or in your Jira/Confluence site URL |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Atlassian Cloud"**
3. Enter your `ATLASSIAN_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Atlassian tools automatically.

## Usage

### Example Prompts

```
"List all my Atlassian items and summarize the most recent ones"
"Find anything related to [keyword] in Atlassian"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-atlassian \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ATLASSIAN-TOKEN: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_issue","arguments":{}}}'
```

## License

MIT
