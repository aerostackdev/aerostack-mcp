# mcp-hookdeck — Hookdeck MCP Server

> Webhook infrastructure via Hookdeck — manage sources, connections, destinations, and retry failed deliveries.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-hookdeck`

---

## What You Can Do

This MCP server gives AI agents access to Hookdeck via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Hookdeck directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_connections` | List webhook connections in Hookdeck |
| `get_connection` | Get details of a specific Hookdeck connection |
| `create_connection` | Create a new Hookdeck webhook connection |
| `pause_connection` | Pause a Hookdeck connection (stops forwarding events) |
| `resume_connection` | Resume a paused Hookdeck connection |
| `list_events` | List webhook events in Hookdeck |
| `get_event` | Get details of a specific Hookdeck webhook event |
| `retry_event` | Retry a failed Hookdeck webhook event |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `HOOKDECK_API_KEY` | Yes | Your HOOKDECK API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Hookdeck"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `HOOKDECK_API_KEY`

Once added, every AI agent in your workspace can use Hookdeck tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-hookdeck \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-HOOKDECK-API-KEY: your-hookdeck-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_connections","arguments":{}}}'
```

## License

MIT
