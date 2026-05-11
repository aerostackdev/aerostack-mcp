# mcp-jira-cloud — Jira Cloud MCP Server

> Full Jira Cloud integration — manage projects, issues, sprints, boards, comments, transitions, and user assignments for agile project management.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-jira-cloud`

---

## What You Can Do

This MCP server gives AI agents access to Jira Cloud via 16 tools. Connect it to any Aerostack workspace and your agents can interact with Jira Cloud directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects in the Jira account. |
| `get_project` | Get project details by project key. |
| `list_issues` | Search issues using JQL query. |
| `get_issue` | Get full issue details by issue key. |
| `create_issue` | Create a new Jira issue. |
| `update_issue` | Update issue summary, priority, or assignee. |
| `delete_issue` | Permanently delete an issue. |
| `transition_issue` | Move an issue to a new status by transitioning it. |
| `list_transitions` | List available status transitions for an issue. |
| `add_comment` | Add a comment to an issue. |
| `list_comments` | List comments on an issue. |
| `assign_issue` | Assign an issue to a user by account ID. |
| `search_users` | Search for users by query string. |
| `list_sprints` | List active and future sprints for a board. |
| `get_board` | Get agile board details by ID. |
| `list_boards` | List all agile boards in the account. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_EMAIL` | Yes | Your Atlassian account email address |
| `JIRA_API_TOKEN` | Yes | Your Jira API token — found in Atlassian Account Settings → Security → API tokens |
| `JIRA_DOMAIN` | Yes | Your Jira subdomain (e.g. 'mycompany' for mycompany.atlassian.net) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Jira Cloud"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_DOMAIN`

Once added, every AI agent in your workspace can use Jira Cloud tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-jira-cloud \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-JIRA-EMAIL: your-jira-email' \
  -H 'X-Mcp-Secret-JIRA-API-TOKEN: your-jira-api-token' \
  -H 'X-Mcp-Secret-JIRA-DOMAIN: your-jira-domain' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

## License

MIT
