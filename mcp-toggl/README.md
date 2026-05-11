# mcp-toggl — Toggl MCP Server

> Track time with Toggl — manage projects, start/stop timers, and generate summary reports via the Toggl Track API.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-toggl`

---

## What You Can Do

This MCP server gives AI agents access to Toggl via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Toggl directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_current_user` | Get the current authenticated Toggl user |
| `list_workspaces` | List all workspaces for the current user |
| `list_projects` | List active projects in a workspace |
| `get_project` | Get a specific project by ID |
| `create_project` | Create a new project in a workspace |
| `list_clients` | List all clients in a workspace |
| `list_time_entries` | List time entries within a date range |
| `get_current_timer` | Get the currently running timer, if any |
| `create_time_entry` | Create a new time entry |
| `stop_timer` | Stop a running time entry |
| `update_time_entry` | Update an existing time entry |
| `delete_time_entry` | Delete a time entry |
| `get_summary_report` | Get a summary report for a workspace over a date range |
| `list_tags` | List all tags in a workspace |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `TOGGL_API_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Toggl"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `TOGGL_API_TOKEN`

Once added, every AI agent in your workspace can use Toggl tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-toggl \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TOGGL-API-TOKEN: your-toggl-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_current_user","arguments":{}}}'
```

## License

MIT
