# Asana Project Management MCP

> Official proxy MCP — Tasks, projects, sections, comments, teams, custom fields via Asana's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-asana`

---

## Overview

Asana Project Management is a proxy MCP server that forwards requests directly to the official Asana MCP endpoint at `https://mcp.asana.com/v2/mcp`. All tools are maintained by Asana — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Asana)
**Auth:** Bearer token via `ASANA_ACCESS_TOKEN`

## Available Tools

- **search_tasks** — Search for tasks across all accessible workspaces and projects using keywords, assignee, or completion status
- **create_task** — Create a new task in a project with name, description, assignee, due date, and custom fields
- **get_task** — Retrieve a task by GID with all details including custom fields, subtasks, and comments
- **list_projects** — List all projects in a workspace or team with name, status, owner, and member details
- **update_task** — Update an existing task's name, description, assignee, due date, or completion status

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `ASANA_ACCESS_TOKEN` | Yes | Asana Personal Access Token or OAuth2 access token | app.asana.com → My Settings → Apps → Developer apps → Personal access tokens → Create new token |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Asana Project Management"**
3. Enter your `ASANA_ACCESS_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Asana tools automatically.

## Usage

### Example Prompts

```
"List all my incomplete tasks in the Engineering project"
"Create a task assigned to me due Friday: Review API documentation"
"Search for tasks related to onboarding across all projects"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-asana \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ASANA-ACCESS-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_tasks","arguments":{"workspace":"12345","query":"bug fix"}}}'
```

## License

MIT
