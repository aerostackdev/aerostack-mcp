# mcp-microsoft-graph — Microsoft 365 MCP Server

> Send Teams messages, manage Outlook email, create calendar events, and browse OneDrive files.

Microsoft Graph is the unified API for Microsoft 365 — covering Teams, Outlook, Calendar, and OneDrive from a single token. This MCP server exposes 14 tools across all four services, letting your AI agents operate across your Microsoft 365 environment: posting to Teams channels, reading emails, scheduling meetings, and finding files stored in OneDrive.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-microsoft-graph`

---

## What You Can Do

- Post messages to Teams channels from automated workflows — send deploy notifications, alerts, or summaries directly into the right channel
- Read and reply to Outlook emails so AI agents can handle inbox triage, draft responses, or escalate threads
- Create and update calendar events for meeting scheduling automation that connects with HR, CRM, or project systems
- Search OneDrive files so agents can locate relevant documents before drafting reports or pulling data

## Available Tools

| Tool | Description |
|------|-------------|
| `list_teams` | List all Microsoft Teams the user has joined |
| `list_team_channels` | List channels in a team |
| `send_teams_message` | Send a message to a Teams channel (text or HTML) |
| `list_team_messages` | List recent messages from a Teams channel |
| `send_email` | Send an email via Outlook (supports multiple recipients and CC) |
| `list_emails` | List emails from inbox, sent items, or drafts with optional search |
| `get_email` | Get a full email including body by message ID |
| `reply_to_email` | Reply to an existing email message |
| `list_calendar_events` | List calendar events with optional date range filter |
| `create_calendar_event` | Create a new calendar event with attendees and timezone support |
| `update_calendar_event` | Update an existing calendar event's details |
| `delete_calendar_event` | Delete a calendar event by ID |
| `list_drive_files` | List files and folders in OneDrive root or a specific folder |
| `search_drive_files` | Search OneDrive files and folders by keyword |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `MICROSOFT_ACCESS_TOKEN` | Yes | Microsoft Graph API OAuth2 access token | [portal.azure.com](https://portal.azure.com) → **Azure Active Directory** → **App registrations** → Register app → **API permissions** → add Microsoft Graph delegated permissions (Team.ReadBasic.All, Mail.ReadWrite, Mail.Send, Calendars.ReadWrite, Files.ReadWrite) → generate token via OAuth2 authorization code flow |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Microsoft Graph"** and click **Add to Workspace**
3. Add your `MICROSOFT_ACCESS_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call Microsoft 365 tools automatically — no per-user setup needed.

### Example Prompts

```
"Post a message to the Engineering team's #deployments channel saying the v3.1 release is live"
"Search my Outlook inbox for emails from vendor@supplier.com in the last 7 days and summarize them"
"Schedule a 1-hour kickoff meeting on Thursday at 10am with the whole product team"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-microsoft-graph \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MICROSOFT-ACCESS-TOKEN: your-oauth-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_teams","arguments":{}}}'
```

## License

MIT
