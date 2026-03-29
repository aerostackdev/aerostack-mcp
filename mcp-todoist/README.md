# mcp-todoist — Todoist MCP Server

> Manage tasks, projects, sections, labels, and comments in Todoist from any AI agent — full access to the Todoist REST API v2.

Todoist is the world's most popular task manager, trusted by over 40 million people. This MCP server gives your AI agents complete control over Todoist: creating and completing tasks, organizing projects and sections, managing labels, and leaving comments — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-todoist`

---

## What You Can Do

- Create tasks from any trigger — emails, Slack messages, form submissions, or AI analysis
- Close and reopen tasks, set due dates using natural language like "next Monday at 9am"
- Organize work by creating projects, sections, and labels programmatically
- List overdue tasks, today's priorities, or filter by any Todoist filter expression
- Add comments to tasks for audit trails and handoff notes

## Available Tools

| Tool | Description |
|------|-------------|
| list_tasks | List active tasks with optional filters: project, section, label, or Todoist filter strings |
| get_task | Get a specific task by ID |
| create_task | Create a task with content, due date, priority, labels, and parent |
| update_task | Update task content, due date, labels, or priority |
| close_task | Mark a task as completed |
| delete_task | Permanently delete a task |
| list_projects | List all projects |
| get_project | Get a specific project by ID |
| create_project | Create a project with color, view style, and favorite flag |
| update_project | Update project name, color, view style, or favorite status |
| delete_project | Delete a project and all its tasks |
| list_sections | List sections in a project |
| get_section | Get a section by ID |
| create_section | Create a section in a project |
| delete_section | Delete a section (tasks move to project root) |
| list_comments | List comments on a task or project |
| create_comment | Add a comment to a task or project |
| list_labels | List all personal labels |
| create_label | Create a personal label |
| get_user | Get current user profile |
| reopen_task | Reopen a completed task |
| move_task | Move a task to a different project or section |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| TODOIST_API_TOKEN | Yes | Personal API token for authentication | Todoist → Settings → Integrations → Developer → API token |

Personal API tokens never expire and provide full access to the account's data.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Todoist"** and click **Add to Workspace**
3. Add your `TODOIST_API_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can manage tasks automatically.

### Example Prompts

```
"Create a task to review the Q1 report due next Friday with high priority"
"List all overdue tasks and close any that are already done"
"Create a new project called 'Product Launch' with board view and add three sections: Ideas, In Progress, Done"
"Move all tasks labeled 'urgent' to the top of my Inbox"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-todoist \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TODOIST-API-TOKEN: your-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_tasks","arguments":{"filter":"overdue"}}}'
```

### Filter Syntax Examples

Todoist supports a powerful filter language for `list_tasks`:

| Filter | Returns |
|--------|---------|
| `today` | Tasks due today |
| `overdue` | All overdue tasks |
| `p1` | Priority 1 (urgent) tasks |
| `#Work` | Tasks in "Work" project |
| `@shopping` | Tasks with "shopping" label |
| `assigned to: me` | Tasks assigned to you |
| `due before: +7 days` | Tasks due in the next 7 days |

## Rate Limits

Todoist allows 1,000 API requests per 15-minute window. For high-volume automations, batch operations where possible and use filters to reduce the number of calls needed.

## License

MIT
