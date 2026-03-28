# mcp-google-meet — Google Meet MCP Server

> Create Google Meet spaces, schedule calendar meetings with Meet links, manage participants, recordings, and transcripts from any AI agent.

Google Meet is Google's enterprise video conferencing platform, deeply integrated with Google Calendar and Google Workspace. This MCP server gives your agents complete access to the Google Meet REST API and Google Calendar API: creating instant or scheduled meetings, managing spaces and conferences, listing participants, retrieving recordings and transcripts, and full calendar event CRUD.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-google-meet`

---

## What You Can Do

- Create Google Meet spaces instantly and return meeting links for sharing
- Schedule Google Calendar events with Meet links and attendee invites
- Retrieve post-meeting participant lists and duration for CRM sync or compliance
- Access cloud recordings and AI transcripts from completed meetings
- Manage and update meetings without touching the Google Calendar UI

## Available Tools

| Tool | Description |
|------|-------------|
| create_space | Create a new Google Meet space — returns meetingUri and meetingCode |
| get_space | Get Meet space details by resource name or meeting code |
| end_active_conference | End an active conference, disconnecting all participants |
| list_conferences | List past conferences in a Meet space |
| get_conference | Get conference details including start/end time |
| list_participants | List participants in a conference session |
| get_participant | Get participant details: display name, join/leave time |
| list_recordings | List recordings for a conference |
| get_recording | Get a recording with download URI and timestamps |
| create_meeting_event | Create a Calendar event with a Google Meet link |
| get_event | Get a Calendar event including the Meet link |
| list_upcoming_meetings | List upcoming Calendar events with Meet links |
| update_meeting_event | Update a Calendar event (title, time, attendees) |
| delete_meeting_event | Delete a meeting from Calendar with cancellation notifications |
| list_transcripts | List transcripts for a conference |
| get_transcript | Get a transcript with speaker turns and timestamps |
| _ping | Verify credentials by fetching primary calendar info |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| GOOGLE_ACCESS_TOKEN | Yes | Google OAuth 2.0 access token with Meet and Calendar scopes | [Google OAuth Playground](https://developers.google.com/oauthplayground/) or your Google Workspace OAuth app |

### Required OAuth Scopes

Your access token must include these scopes:

- `https://www.googleapis.com/auth/calendar` — Create and manage calendar events
- `https://www.googleapis.com/auth/calendar.events` — Read/write calendar events
- `https://www.googleapis.com/auth/meetings.space.created` — Manage created Meet spaces
- `https://www.googleapis.com/auth/meetings.space.readonly` — Read Meet space data

### Getting an Access Token

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the **Google Meet API** and **Google Calendar API**
4. Create OAuth 2.0 credentials (Desktop app or Web app)
5. Use [OAuth Playground](https://developers.google.com/oauthplayground/) to get an access token with the required scopes
6. For production, use a service account with domain-wide delegation or implement the OAuth flow in your application

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Google Meet"** and click **Add to Workspace**
3. Add your `GOOGLE_ACCESS_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can create and manage Google Meet sessions automatically.

### Example Prompts

```
"Create a Google Meet space for our team standup and share the link"
"Schedule a 1-hour product review on April 5th at 2pm EST with alice@example.com and bob@example.com"
"List all participants from yesterday's all-hands meeting"
"Get the transcript from our latest product demo call"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-google-meet \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: your-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_meeting_event","arguments":{"summary":"Team Sync","start":"2026-04-01T14:00:00Z","end":"2026-04-01T15:00:00Z","attendees":["alice@example.com"]}}}'
```

## License

MIT
