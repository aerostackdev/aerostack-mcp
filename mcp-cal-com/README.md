# mcp-cal-com — Cal.com MCP Server

> Let AI agents manage your entire scheduling workflow — create event types, check availability, book meetings, and handle cancellations automatically.

Cal.com is the open-source scheduling infrastructure used by thousands of businesses. This MCP server gives your agents full control over the Cal.com API: managing bookable event types, checking real-time availability, creating and rescheduling bookings, and tracking no-shows — all without human intervention.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-cal-com`

---

## What You Can Do

- Check real-time availability and book meetings on behalf of users or customers
- Create and manage event types (e.g. "30-min demo", "1-hour consultation") programmatically
- Reschedule or cancel bookings with reason tracking for CRM integration
- Build automated scheduling workflows that react to leads, form submissions, or Slack messages

## Available Tools

| Tool | Description |
|------|-------------|
| list_event_types | List all bookable event types for the authenticated user |
| get_event_type | Get full details of a specific event type by ID |
| create_event_type | Create a new bookable event type with duration, slug, and locations |
| delete_event_type | Delete an event type by ID |
| list_bookings | List bookings with optional status and attendee email filters |
| get_booking | Get full details of a specific booking by UID |
| create_booking | Create a new booking for an event type with attendee details |
| reschedule_booking | Reschedule an existing booking to a new start time |
| cancel_booking | Cancel a booking with an optional cancellation reason |
| mark_no_show | Mark the host as a no-show on a booking |
| get_availability | Get available time slots for an event type within a date range |
| get_busy_times | Get blocked time periods for a user — useful for conflict detection |
| list_schedules | List all recurring availability schedules for the authenticated user |
| get_me | Get the authenticated Cal.com user's profile and settings |
| update_me | Update the authenticated user's time zone, name, or time format |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| CAL_COM_API_KEY | Yes | Cal.com API key | [app.cal.com](https://app.cal.com) → Settings → Developer → API Keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Cal.com"** and click **Add to Workspace**
3. Add your `CAL_COM_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can book and manage meetings automatically — no per-user setup needed.

### Example Prompts

```
"Check availability for a 30-minute call next Tuesday and book the first open slot for john@example.com"
"Show me all upcoming bookings for this week"
"Cancel the meeting with uid abc123xyz — the client requested a reschedule"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-cal-com \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CAL-COM-API-KEY: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_availability","arguments":{"event_type_id":123,"start_time":"2024-08-13T00:00:00Z","end_time":"2024-08-20T23:59:59Z"}}}'
```

## License

MIT
