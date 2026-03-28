# mcp-clickup — ClickUp MCP Server

> Automate your entire ClickUp workflow — manage workspaces, spaces, folders, lists, tasks, comments, time tracking, and members from any AI agent.

ClickUp is a comprehensive work management platform used by teams worldwide for project management, task tracking, and collaboration. This MCP server gives your agents complete access to the ClickUp REST API v2: navigating the full workspace hierarchy, creating and updating tasks with full field support, managing time tracking, searching tasks, and adding comments.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-clickup`

---

## What You Can Do

- Automatically create tasks and set priority, due dates, assignees, and tags from any external trigger
- Update task status as work progresses — integrate with CI/CD, support tickets, or approval workflows
- Track time programmatically — start and stop timers, retrieve time entries for reporting
- Search tasks across an entire workspace by keyword to find and act on relevant work
- Add comments to tasks to log updates, decisions, or status changes without touching the UI

## Available Tools

| Tool | Description |
|------|-------------|
| _ping | Verify credentials by fetching the authenticated user profile |
| get_workspaces | Get all workspaces (teams) for the authenticated user |
| get_spaces | Get all spaces in a workspace |
| create_space | Create a new space in a workspace |
| get_space | Get a specific space by ID |
| get_folders | Get all folders in a space |
| create_folder | Create a new folder in a space |
| get_lists | Get lists in a folder or space (folderless) |
| create_list | Create a list in a folder or space with optional due date and priority |
| get_list | Get a specific list by ID |
| get_task | Get full task details — name, description, status, priority, due date, assignees, tags |
| list_tasks | List tasks in a list with filters for status, assignee, due date, and priority |
| create_task | Create a task with name, description, priority, due date, assignees, tags, and status |
| update_task | Update task fields: name, description, status, priority, due date |
| delete_task | Permanently delete a task |
| add_task_comment | Add a comment to a task with optional assignee notification |
| get_task_comments | Get all comments on a task |
| set_task_custom_field | Set a custom field value on a task |
| start_time_entry | Start a time tracker on a task |
| stop_time_entry | Stop the running time tracker |
| get_time_entries | Get time entries for a workspace filtered by task or member |
| get_workspace_members | Get all members in a workspace |
| search_tasks | Search tasks across a workspace by query string |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| CLICKUP_API_TOKEN | Yes | Your ClickUp personal API token | Go to ClickUp → Profile avatar → **Settings** → **Apps** → **API Token** → Generate or copy your token |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"ClickUp"** and click **Add to Workspace**
3. Add your `CLICKUP_API_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can manage ClickUp tasks automatically — no per-user setup needed.

### Example Prompts

```
"Create a high-priority task called 'Fix auth bug' in the Backend Backlog list and assign it to user 12345"
"Get all open tasks in list abc123 that are due before end of this week"
"Start time tracking on task 9hz4k7 and add a comment saying 'starting investigation'"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-clickup \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CLICKUP-API-TOKEN: pk_your_api_token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_workspaces","arguments":{}}}'
```

## License

MIT
