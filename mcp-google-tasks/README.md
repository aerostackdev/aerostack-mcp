# mcp-google-tasks — Google Tasks MCP Server

> Manage Google Tasks — create, update, and organize task lists and tasks with full CRUD operations.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-google-tasks`

---

## What You Can Do

This MCP server gives AI agents access to Google Tasks via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Google Tasks directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_task_lists` | List all task lists for the authenticated user |
| `get_task_list` | Get a specific task list by ID |
| `create_task_list` | Create a new task list |
| `update_task_list` | Update a task list title |
| `delete_task_list` | Delete a task list |
| `list_tasks` | List tasks in a task list |
| `get_task` | Get a specific task |
| `create_task` | Create a new task in a task list |
| `update_task` | Update an existing task |
| `complete_task` | Mark a task as completed |
| `delete_task` | Delete a task |
| `clear_completed_tasks` | Clear all completed tasks from a task list |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Google Tasks"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `GOOGLE_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Google Tasks tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-google-tasks \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: your-google-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_task_lists","arguments":{}}}'
```

## License

MIT
