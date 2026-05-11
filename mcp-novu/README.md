# mcp-novu — Novu MCP Server

> Multi-channel notification infrastructure via Novu — trigger workflows, manage subscribers, and send notifications.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-novu`

---

## What You Can Do

This MCP server gives AI agents access to Novu via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Novu directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `trigger_event` | Trigger a Novu workflow/notification event for a subscriber. Specify the workflow ID, recipient subscriber, and event payload. |
| `bulk_trigger` | Trigger multiple Novu notification events in a single API call. |
| `cancel_event` | Cancel a scheduled or queued Novu notification event by transaction ID. |
| `list_subscribers` | List subscribers in your Novu environment with pagination. |
| `create_subscriber` | Create a new subscriber in Novu. |
| `get_subscriber` | Get a subscriber\ |
| `update_subscriber` | Update an existing subscriber\ |
| `delete_subscriber` | Delete a subscriber from Novu by subscriber ID. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `NOVU_API_KEY` | Yes | Your NOVU API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Novu"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `NOVU_API_KEY`

Once added, every AI agent in your workspace can use Novu tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-novu \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-NOVU-API-KEY: your-novu-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"trigger_event","arguments":{}}}'
```

## License

MIT
