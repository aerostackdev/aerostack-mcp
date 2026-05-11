# mcp-clockify — Clockify MCP Server

> Track time with Clockify — manage projects, clients, tasks, and generate summary reports via the Clockify API.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-clockify`

---

## What You Can Do

This MCP server gives AI agents access to Clockify via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Clockify directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_current_user` | Get the current authenticated Clockify user |
| `list_workspaces` | List all workspaces for the current user |
| `list_projects` | List projects in a workspace |
| `get_project` | Get a specific project by ID |
| `create_project` | Create a new project in a workspace |
| `list_clients` | List clients in a workspace |
| `list_time_entries` | List time entries for a user in a workspace |
| `get_time_entry` | Get a specific time entry by ID |
| `create_time_entry` | Create a new time entry |
| `update_time_entry` | Update an existing time entry |
| `delete_time_entry` | Delete a time entry |
| `list_tasks` | List tasks for a project |
| `create_task` | Create a new task for a project |
| `get_summary_report` | Get a summary report for a workspace |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOCKIFY_API_KEY` | Yes | Your CLOCKIFY API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Clockify"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `CLOCKIFY_API_KEY`

Once added, every AI agent in your workspace can use Clockify tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-clockify \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CLOCKIFY-API-KEY: your-clockify-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_current_user","arguments":{}}}'
```

## License

MIT
