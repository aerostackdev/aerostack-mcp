# mcp-basecamp — Basecamp MCP Server

> Manage projects, to-dos, messages, schedules, and campfire chats in Basecamp.

Basecamp is the all-in-one project management and team communication platform. This MCP server gives your AI agents the ability to list and inspect projects, create and complete to-dos, post messages to message boards, and read schedule entries — making Basecamp a first-class integration for automated project management workflows.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-basecamp`

---

## What You Can Do

- List all projects in your Basecamp account and inspect their tools (dock) to find message boards, to-do sets, and schedules
- Create to-do items with assignees and due dates, and mark them complete when work is done
- Post messages to project message boards for announcements, status updates, or automated reports
- Read schedule entries to check upcoming events, deadlines, and milestones

## Setup (Important — read before using)

### Step 1: Get a Basecamp OAuth Access Token

Basecamp 4 uses OAuth 2 for authentication. You need a valid access token:

1. Register an integration at [launchpad.37signals.com/integrations](https://launchpad.37signals.com/integrations)
2. Complete the OAuth 2 flow to obtain an access token
3. Alternatively, for personal use, you can use a personal access token from the integration settings

> **Important:** Basecamp requires a `User-Agent` header on all API requests. This MCP server sends `AerostackMCP (hello@aerostack.dev)` automatically.

### Step 2: Find Your Account ID

Your Basecamp account ID is the number in your Basecamp URL:

```
https://3.basecamp.com/YOUR_ACCOUNT_ID/projects
```

For example, if your URL is `https://3.basecamp.com/4567890/projects`, your account ID is `4567890`.

### Step 3: Add to Aerostack Workspace

1. Go to your Aerostack workspace → **Add Server** → search **"Basecamp"**
2. Paste your `BASECAMP_ACCESS_TOKEN` when prompted
3. Paste your `BASECAMP_ACCOUNT_ID` when prompted
4. Click **Test** to verify the connection

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all active (or archived/trashed) projects in the account |
| `get_project` | Get project details including its dock (message board ID, to-do set ID, schedule ID) |
| `list_todolists` | List all to-do lists in a project's to-do set |
| `get_todolist` | Get a to-do list with its items |
| `create_todo` | Create a new to-do with optional assignees and due date |
| `complete_todo` | Mark a to-do item as completed |
| `list_messages` | List messages on a project's message board |
| `create_message` | Post a new message to a project's message board |
| `list_schedule_entries` | List schedule entries (events) for a project |

### Workflow: Finding IDs

Basecamp's API is hierarchical. To create a to-do, you need the **to-do set ID** from the project dock:

1. Call `list_projects` to get the project ID
2. Call `get_project` with the project ID — the dock array contains entries like `{ name: "todoset", id: 12345 }`
3. Use that `todoset` ID as `todoset_id` in `list_todolists`
4. Use a to-do list ID from the results as `todolist_id` in `create_todo`

The same pattern applies for message boards (`message_board` in dock) and schedules (`schedule` in dock).

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `BASECAMP_ACCESS_TOKEN` | Yes | Basecamp OAuth 2 access token |
| `BASECAMP_ACCOUNT_ID` | Yes | Your Basecamp account ID (number from URL) |

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `HTTP 401` | Access token is expired or invalid | Re-authenticate via OAuth 2 and update the token |
| `HTTP 403` | Token doesn't have access to this project | Verify the token's account has access to the project |
| `HTTP 404` | Wrong account ID, project ID, or resource ID | Double-check all IDs — use `list_projects` and `get_project` to discover correct IDs |
| `HTTP 429` | Rate limited (50 requests per 10 seconds) | Wait and retry — Basecamp enforces strict rate limits |

## Example Prompts

```
"List all my Basecamp projects and show me the to-do lists in the Marketing project"
"Create a to-do in the Q2 Launch list: Review landing page copy, due next Friday"
"Mark the 'Update DNS records' to-do as complete"
"Post a message to the Engineering message board with this week's deploy summary"
"Show me all schedule entries for the Product Roadmap project"
```

## Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-basecamp \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-BASECAMP-ACCESS-TOKEN: your-oauth-token' \
  -H 'X-Mcp-Secret-BASECAMP-ACCOUNT-ID: 4567890' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

## License

MIT
