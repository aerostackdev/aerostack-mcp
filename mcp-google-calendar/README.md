# mcp-google-calendar — Google Calendar MCP Server

> Create, update, and query Google Calendar events through natural language.

Google Calendar is the scheduling backbone for millions of teams and individuals. This MCP server gives your AI agents full access to create, list, update, and delete calendar events — enabling scheduling automation, meeting summaries, and calendar management without opening Google Calendar. The `quick_add` tool even parses natural language like "Lunch with Bob at noon tomorrow" into a properly structured event.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-google-calendar`

---

## What You Can Do

- Schedule meetings and create calendar events from natural language input without manually filling out forms
- List upcoming events for a date range to give an AI agent awareness of your schedule when planning tasks
- Update or delete events in response to changes — useful for automated scheduling workflows that react to external triggers
- Use quick_add to create events from plain text, letting users say "team standup every weekday at 9am" and get it on the calendar

## Available Tools

| Tool | Description |
|------|-------------|
| `list_calendars` | List all calendars for the authenticated user |
| `list_events` | List events in a calendar with optional time range filter |
| `get_event` | Get details of a specific event by ID |
| `create_event` | Create a new calendar event with attendees and timezone support |
| `update_event` | Update an existing event (partial patch) |
| `delete_event` | Delete a calendar event |
| `quick_add` | Quick-add an event from natural language text |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `GOOGLE_ACCESS_TOKEN` | Yes | Google OAuth2 access token with Calendar scope | [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials** → OAuth 2.0 → generate token with `https://www.googleapis.com/auth/calendar` scope. Use OAuth Playground at [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground) for quick testing. |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Google Calendar"** and click **Add to Workspace**
3. Add your `GOOGLE_ACCESS_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call Google Calendar tools automatically — no per-user setup needed.

### Example Prompts

```
"What meetings do I have tomorrow between 9am and 5pm Pacific?"
"Schedule a 30-minute product review for next Monday at 2pm with alice@company.com and bob@company.com"
"Cancel all events on my calendar tagged as Optional for this Friday"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-google-calendar \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: your-oauth-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_calendars","arguments":{}}}'
```

## License

MIT
