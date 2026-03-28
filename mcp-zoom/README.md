# mcp-zoom — Zoom MCP Server

> Automate Zoom meetings, webinars, users, and cloud recordings from any AI agent — full Server-to-Server OAuth support.

Zoom is the world's leading video communications platform. This MCP server gives your agents complete access to the Zoom REST API v2: creating and managing meetings, scheduling webinars, listing participants, retrieving cloud recordings, pulling usage reports, and more — all without user-level OAuth flows.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-zoom`

---

## What You Can Do

- Automatically create Zoom meetings from form submissions, calendar triggers, or AI chat
- Schedule webinars with full registration management
- Pull post-meeting participant lists and cloud recordings for compliance or CRM sync
- Get AI-generated meeting summaries for completed calls
- Manage users and account-level settings without manual Zoom admin UI interactions

## Available Tools

| Tool | Description |
|------|-------------|
| list_meetings | List meetings for the authenticated user (scheduled, live, upcoming) |
| get_meeting | Get full meeting details: topic, start time, join URL, password, agenda |
| create_meeting | Create a meeting with topic, schedule, duration, and settings |
| update_meeting | Update meeting topic, time, duration, or agenda |
| delete_meeting | Permanently delete a meeting |
| get_meeting_participants | Get participants from a past/ended meeting |
| get_meeting_recordings | Get cloud recordings for a specific meeting |
| list_past_meetings | List past meetings with summary statistics |
| list_webinars | List all scheduled webinars for the authenticated user |
| get_webinar | Get full webinar details and registrant count |
| create_webinar | Create a new webinar with topic, schedule, and agenda |
| get_webinar_registrants | Get registrants for a webinar (pending/approved/denied) |
| get_user | Get user profile by ID, email, or "me" for the authenticated user |
| list_users | List all users in the account |
| update_user | Update user profile fields (name, job title, department) |
| get_user_settings | Get user-level Zoom settings |
| get_account_reports | Get daily usage reports (meetings, participants, minutes) |
| get_meeting_summary | Get AI-generated summary for a completed meeting |
| list_recordings | List all cloud recordings for the account |
| delete_recording | Delete a specific cloud recording (trash or permanent) |
| _ping | Verify credentials by fetching the authenticated user profile |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| ZOOM_ACCOUNT_ID | Yes | Your Zoom account ID | [Zoom Marketplace](https://marketplace.zoom.us/) → Your App → App Credentials |
| ZOOM_CLIENT_ID | Yes | Server-to-Server OAuth app client ID | [Zoom Marketplace](https://marketplace.zoom.us/) → Develop → Build App → Server-to-Server OAuth |
| ZOOM_CLIENT_SECRET | Yes | Server-to-Server OAuth app client secret | Same as above — generated when you create the Server-to-Server OAuth app |

### Setting Up Server-to-Server OAuth

1. Go to [Zoom Marketplace](https://marketplace.zoom.us/) and sign in
2. Click **Develop** → **Build App**
3. Select **Server-to-Server OAuth** app type
4. Copy **Account ID**, **Client ID**, and **Client Secret**
5. Under **Scopes**, add: `meeting:read`, `meeting:write`, `webinar:read`, `webinar:write`, `user:read`, `user:write`, `report:read:admin`, `recording:read`, `recording:write`
6. Activate the app

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Zoom"** and click **Add to Workspace**
3. Add your `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, and `ZOOM_CLIENT_SECRET` under **Project → Secrets**

Once added, every AI agent in your workspace can create and manage Zoom meetings automatically.

### Example Prompts

```
"Create a Zoom meeting for tomorrow at 2pm ET titled 'Q2 Planning'"
"Get the participant list from our last all-hands meeting"
"List all cloud recordings from the past 30 days"
"Schedule a product launch webinar for April 15th at 6pm"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-zoom \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ZOOM-ACCOUNT-ID: your-account-id' \
  -H 'X-Mcp-Secret-ZOOM-CLIENT-ID: your-client-id' \
  -H 'X-Mcp-Secret-ZOOM-CLIENT-SECRET: your-client-secret' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_meeting","arguments":{"topic":"Team Standup","start_time":"2026-04-01T09:00:00Z","duration_minutes":15}}}'
```

## License

MIT
