# mcp-wrike — Wrike MCP Server

> Manage Wrike projects and tasks — create folders, tasks, comments, and track time logs via the Wrike API.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-wrike`

---

## What You Can Do

This MCP server gives AI agents access to Wrike via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Wrike directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_current_user` | Get the current authenticated Wrike user |
| `list_folders` | List all folders and projects in the account |
| `get_folder` | Get a specific folder by ID |
| `create_folder` | Create a new folder inside a parent folder |
| `list_tasks` | List tasks in a folder |
| `get_task` | Get a specific task by ID |
| `create_task` | Create a new task in a folder |
| `update_task` | Update an existing task |
| `delete_task` | Delete a task |
| `list_contacts` | List all contacts in the account |
| `get_contact` | Get a specific contact by ID |
| `list_comments` | List comments on a task |
| `create_comment` | Add a comment to a task |
| `list_timelogs` | List time logs for a task |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `WRIKE_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Wrike"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `WRIKE_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Wrike tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-wrike \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-WRIKE-ACCESS-TOKEN: your-wrike-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_current_user","arguments":{}}}'
```

## License

MIT
