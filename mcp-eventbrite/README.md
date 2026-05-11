# mcp-eventbrite — Eventbrite MCP Server

> Full Eventbrite integration — manage events, organizations, attendees, orders, and venues for event ticketing and management.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-eventbrite`

---

## What You Can Do

This MCP server gives AI agents access to Eventbrite via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Eventbrite directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_organizations` | List all organizations the authenticated user belongs to. |
| `list_events` | List events for an organization. |
| `get_event` | Get detailed information about a specific event. |
| `create_event` | Create a new event in an organization. |
| `update_event` | Update event details. |
| `publish_event` | Publish an event to make it publicly visible. |
| `cancel_event` | Cancel a live event. |
| `list_attendees` | List attendees for an event. |
| `get_attendee` | Get details of a specific attendee. |
| `list_orders` | List orders for an event. |
| `list_venues` | List venues for an organization. |
| `get_event_summary` | Get summary statistics for an event including sales and attendance. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `EVENTBRITE_TOKEN` | Yes | Your Eventbrite private OAuth token — found in Account Settings → Developer Links → API Keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Eventbrite"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `EVENTBRITE_TOKEN`

Once added, every AI agent in your workspace can use Eventbrite tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-eventbrite \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-EVENTBRITE-TOKEN: your-eventbrite-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_organizations","arguments":{}}}'
```

## License

MIT
