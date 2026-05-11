# mcp-omnisend — Omnisend MCP Server

> Drive ecommerce growth with Omnisend — manage contacts, campaigns, automations, segments, and track events from AI.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-omnisend`

---

## What You Can Do

This MCP server gives AI agents access to Omnisend via 16 tools. Connect it to any Aerostack workspace and your agents can interact with Omnisend directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_contacts` | List contacts with optional filters |
| `create_contact` | Create a new contact |
| `get_contact` | Get a contact by ID |
| `update_contact` | Update a contact |
| `delete_contact` | Delete a contact |
| `list_campaigns` | List campaigns |
| `get_campaign` | Get a campaign by ID |
| `list_automations` | List all automations |
| `track_event` | Track a custom event for a contact |
| `create_batch` | Create a batch operation for contacts |
| `get_batch_status` | Get the status of a batch operation |
| `list_segments` | List all audience segments |
| `get_segment_contacts` | Get contacts in a segment |
| `list_forms` | List all forms |
| `list_tags` | List all tags |
| `get_account_info` | Get account information |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `OMNISEND_API_KEY` | Yes | Your OMNISEND API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Omnisend"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `OMNISEND_API_KEY`

Once added, every AI agent in your workspace can use Omnisend tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-omnisend \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-OMNISEND-API-KEY: your-omnisend-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_contacts","arguments":{}}}'
```

## License

MIT
