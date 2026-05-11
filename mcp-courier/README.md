# mcp-courier — Courier MCP Server

> Multi-channel notification delivery via Courier — send notifications across email, SMS, push, Slack, and more.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-courier`

---

## What You Can Do

This MCP server gives AI agents access to Courier via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Courier directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `send` | Send a notification via Courier. Supports email, push, SMS, and other channels through templates or inline content. |
| `get_message` | Get delivery status and details of a sent Courier message by message ID. |
| `list_messages` | List recently sent messages and their delivery statuses. |
| `get_profile` | Get recipient profile data stored in Courier by recipient ID. |
| `upsert_profile` | Create or update a recipient profile in Courier. |
| `list_templates` | List available Courier notification templates. |
| `list_brands` | List brand themes/configurations in Courier. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `COURIER_API_KEY` | Yes | Your COURIER API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Courier"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `COURIER_API_KEY`

Once added, every AI agent in your workspace can use Courier tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-courier \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-COURIER-API-KEY: your-courier-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send","arguments":{}}}'
```

## License

MIT
