# mcp-calendly — Calendly MCP Server

> Automate scheduling operations across your Calendly account — manage events, invitees, scheduling links, and webhooks from any AI agent.

Calendly is the leading scheduling automation platform used by millions of professionals. This MCP server exposes the complete Calendly v2 API to your agents: read and manage scheduled events, generate single-use scheduling links, subscribe to booking webhooks, and pull invitee data — all without manual intervention.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-calendly`

---

## What You Can Do

- Pull all upcoming and past scheduled events and their invitees for reporting or CRM sync
- Generate single-use scheduling links for prospects without sharing your main calendar link
- Subscribe to booking events via webhooks to trigger downstream workflows automatically
- Build a scheduling assistant that checks availability and surfaces open booking slots

## Available Tools

| Tool | Description |
|------|-------------|
| get_current_user | Get the authenticated Calendly user's profile, timezone, and scheduling URL |
| get_organization | Get details of the organization including plan and stage |
| list_event_types | List all active event types with scheduling URLs and durations |
| get_event_type | Get full details of a specific event type by UUID |
| get_event_type_availability | Get available time slots for an event type within a 7-day window |
| list_scheduled_events | List scheduled events filtered by status and date range |
| get_scheduled_event | Get full details of a specific scheduled event by UUID |
| list_event_invitees | List all invitees for a specific scheduled event |
| cancel_event | Cancel a scheduled event and notify all invitees with a reason |
| get_invitee | Get full details of a specific invitee including Q&A responses |
| create_scheduling_link | Create a single-use or limited-use scheduling link for an event type |
| list_scheduling_links | List all scheduling links owned by the current user |
| list_webhooks | List all webhook subscriptions for the organization |
| create_webhook | Subscribe to real-time events (invitee.created, invitee.canceled, etc.) at a URL |
| delete_webhook | Delete a webhook subscription by UUID |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| CALENDLY_API_TOKEN | Yes | Personal Access Token or OAuth token | [calendly.com/integrations/api_webhooks](https://calendly.com/integrations/api_webhooks) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Calendly"** and click **Add to Workspace**
3. Add your `CALENDLY_API_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can manage Calendly scheduling automatically — no per-user setup needed.

### Example Prompts

```
"Show me all meetings scheduled for this week"
"Generate a single-use scheduling link for my 30-minute intro call and send it to the prospect"
"Set up a webhook to notify our CRM whenever a new meeting is booked"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-calendly \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CALENDLY-API-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_scheduled_events","arguments":{"status":"active"}}}'
```

## License

MIT
