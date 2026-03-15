# Linear Project Management MCP

> Official proxy MCP — Issues, projects, cycles, teams, roadmap via Linear's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-linear`

---

## Overview

Linear Project Management is a proxy MCP server that forwards requests directly to the official Linear MCP endpoint at `https://mcp.linear.app/mcp`. All tools are maintained by Linear — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Linear)
**Auth:** Bearer token via `LINEAR_API_KEY`

## Available Tools

- **list_issues** — List Linear issues with optional filters for team, state, assignee, label, or priority
- **create_issue** — Create a new Linear issue in a team with title, description, priority, and label assignments
- **update_issue** — Update an existing Linear issue's title, state, assignee, priority, or estimate
- **list_teams** — List all Linear teams in the workspace with their IDs, names, and workflow states
- **get_viewer** — Get the authenticated user's Linear profile including ID, name, email, and team memberships

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `LINEAR_API_KEY` | Yes | Linear Personal API Key | linear.app → Settings → API → Personal API Keys → Create key |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Linear Project Management"**
3. Enter your `LINEAR_API_KEY` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Linear tools automatically.

## Usage

### Example Prompts

```
"List all my Linear items and summarize the most recent ones"
"Find anything related to [keyword] in Linear"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-linear \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LINEAR-API-KEY: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_issues","arguments":{}}}'
```

## License

MIT
