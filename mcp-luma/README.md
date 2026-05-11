# mcp-luma — Luma MCP Server

> Full Luma integration — manage events, calendars, guests, and community people for modern event management.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-luma`

---

## What You Can Do

This MCP server gives AI agents access to Luma via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Luma directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_events` | List upcoming events in the account. |
| `get_event` | Get details of a specific event by API ID. |
| `create_event` | Create a new event. |
| `update_event` | Update event details. |
| `list_guests` | List guests for an event. |
| `invite_guest` | Invite guests to an event by email. |
| `list_calendars` | List all calendars in the account. |
| `get_calendar` | Get details of a specific calendar. |
| `create_calendar` | Create a new calendar. |
| `list_calendar_events` | List events in a specific calendar. |
| `get_people` | List people in the community. |
| `get_person` | Get details of a person by email address. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `LUMA_API_KEY` | Yes | Your Luma API key — found in Settings → Integrations → API |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Luma"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `LUMA_API_KEY`

Once added, every AI agent in your workspace can use Luma tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-luma \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LUMA-API-KEY: your-luma-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_events","arguments":{}}}'
```

## License

MIT
