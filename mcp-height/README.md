# mcp-height — Height MCP Server

> Full Height integration — manage task lists, tasks, custom fields, groups, users, and activity logs for collaborative project management.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-height`

---

## What You Can Do

This MCP server gives AI agents access to Height via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Height directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_lists` | List all task lists in the workspace. |
| `get_list` | Get details of a specific list. |
| `create_list` | Create a new task list. |
| `list_tasks` | List tasks in a specific list. |
| `get_task` | Get full details of a specific task. |
| `create_task` | Create a new task in a list. |
| `update_task` | Update task name, description, status, assignees, or due date. |
| `delete_task` | Permanently delete a task. |
| `list_users` | List all workspace members. |
| `list_groups` | List all groups in the workspace. |
| `search_tasks` | Search tasks by query string. |
| `list_activities` | List activity log for a task. |
| `create_field` | Create a custom field for a list. |
| `list_fields` | List custom fields for a list. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `HEIGHT_API_KEY` | Yes | Your Height API key — found in Settings → API |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Height"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `HEIGHT_API_KEY`

Once added, every AI agent in your workspace can use Height tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-height \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-HEIGHT-API-KEY: your-height-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_lists","arguments":{}}}'
```

## License

MIT
