# mcp-microsoft-graph

MCP server for Microsoft 365 — covers Teams messaging, Outlook email, Calendar events, and OneDrive file management via the [Microsoft Graph API](https://learn.microsoft.com/en-us/graph/overview).

Deployed as a Cloudflare Worker, integrated with the Aerostack gateway.

---

## Secrets

| Secret | Description |
|--------|-------------|
| `MICROSOFT_ACCESS_TOKEN` | Microsoft Graph API access token. Obtain via Azure AD OAuth2 or the Microsoft Identity Platform. Requires the appropriate Microsoft 365 / Entra ID scopes for Teams, Mail, Calendars, and Files. |

The token is injected at the Aerostack gateway layer via the request header `X-Mcp-Secret-MICROSOFT-ACCESS-TOKEN`. Never hardcode tokens in source.

### Getting a Token

Obtain an access token via [Azure AD OAuth2 / Microsoft Identity Platform](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow). Required scopes:

- `Team.ReadBasic.All` — list joined teams
- `Channel.ReadBasic.All` — list channels
- `ChannelMessage.Send`, `ChannelMessage.Read.All` — send and read channel messages
- `Mail.Send`, `Mail.Read`, `Mail.ReadWrite` — send, list, read, reply to email
- `Calendars.ReadWrite` — list, create, update, delete calendar events
- `Files.ReadWrite` — list and search OneDrive files

---

## Tools

### Teams (4 tools)

| Tool | Description |
|------|-------------|
| `list_teams` | List all Microsoft Teams the user has joined |
| `list_team_channels` | List channels in a team |
| `send_teams_message` | Send a message to a Teams channel (text or HTML) |
| `list_team_messages` | List recent messages from a Teams channel |

### Outlook Email (4 tools)

| Tool | Description |
|------|-------------|
| `send_email` | Send an email via Outlook (supports multiple recipients and CC) |
| `list_emails` | List emails from inbox, sent items, or drafts with optional search |
| `get_email` | Get a full email including body by message ID |
| `reply_to_email` | Reply to an existing email message |

### Calendar (4 tools)

| Tool | Description |
|------|-------------|
| `list_calendar_events` | List calendar events with optional date range filter |
| `create_calendar_event` | Create a new calendar event with attendees and timezone support |
| `update_calendar_event` | Update an existing calendar event's details |
| `delete_calendar_event` | Delete a calendar event by ID |

### OneDrive (2 tools)

| Tool | Description |
|------|-------------|
| `list_drive_files` | List files and folders in OneDrive root or a specific folder |
| `search_drive_files` | Search OneDrive files and folders by keyword |
