# mcp-jira — Jira MCP Server

> Create, search, update issues, manage sprints, boards, and projects in Jira.

Jira is the industry-standard issue tracker and agile project management tool for software teams. This MCP server gives your AI agents the ability to search issues with JQL, create and update tickets, manage sprint workflows, transition issue statuses, and add comments — turning Jira into an AI-native agile command center.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-jira`

---

## What You Can Do

- Search issues with full JQL support — find bugs assigned to you, overdue tasks, sprint backlogs, or any custom query
- Create and update issues programmatically — file bugs from error alerts, create tasks from Slack messages, bulk-update labels
- Transition issues through your workflow — move tickets from To Do to In Progress to Done without leaving your AI chat
- Comment on issues to leave notes, status updates, or automated reports directly on the relevant ticket
- List projects and browse sprints to get a bird's-eye view of your team's work

## Setup

### Step 1: Generate a Jira API Token

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token** → give it a label (e.g., "Aerostack") → **Create**
3. Copy the token immediately (you cannot view it again)

### Step 2: Find Your Jira URL

Your Jira Cloud URL looks like `https://yourteam.atlassian.net`. You can find it in your browser address bar when viewing any Jira page.

### Step 3: Add to Aerostack Workspace

1. Go to your Aerostack workspace → **Add Server** → search **"Jira"**
2. Enter your three secrets when prompted:
   - `JIRA_URL` — your Jira Cloud URL (e.g. `https://yourteam.atlassian.net`)
   - `JIRA_EMAIL` — the email address of your Atlassian account
   - `JIRA_API_TOKEN` — the API token you created in Step 1
3. Click **Test** to verify the connection

## Available Tools

| Tool | Description |
|------|-------------|
| `search_issues` | Search issues using JQL (Jira Query Language) |
| `get_issue` | Get full issue details by key, including comments and changelog |
| `create_issue` | Create a new issue with project, type, summary, description, assignee, priority, labels |
| `update_issue` | Update fields on an existing issue |
| `add_comment` | Add a comment to an issue |
| `transition_issue` | Change issue status (e.g. To Do → In Progress → Done) |
| `list_projects` | List all accessible Jira projects |
| `get_board_sprints` | Get sprints for a board (active, closed, or future) |
| `get_sprint_issues` | Get all issues in a specific sprint |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_URL` | Yes | Jira Cloud URL (e.g. `https://yourteam.atlassian.net`) |
| `JIRA_EMAIL` | Yes | Atlassian account email address |
| `JIRA_API_TOKEN` | Yes | API token from [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens) |

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Wrong email or API token | Verify email matches your Atlassian account; regenerate the API token |
| `404 Not Found` | Wrong JIRA_URL or issue key doesn't exist | Check the URL includes `https://` and the correct subdomain |
| `Transition not found` | Target status not available from current state | Use `get_issue` to see `available_transitions` for the current status |
| `Field not found` | Custom field ID mismatch | Jira custom field IDs vary per instance; check your Jira admin settings |

## Example Prompts

```
"Search Jira for all open bugs in the PLATFORM project assigned to me"
"Create a new Bug in project DEV: 'Login page returns 500 on Safari' with priority High"
"Move PROJ-456 to In Progress and add a comment saying I've started working on it"
"Show me the current sprint for board 42 with all issues and their story points"
"Find all issues updated in the last 24 hours in project CORE"
```

## Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-jira \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-JIRA-URL: https://yourteam.atlassian.net' \
  -H 'X-Mcp-Secret-JIRA-EMAIL: you@example.com' \
  -H 'X-Mcp-Secret-JIRA-API-TOKEN: your-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_issues","arguments":{"jql":"project = DEV AND status = Open ORDER BY created DESC"}}}'
```

## License

MIT
