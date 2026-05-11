# mcp-messagebird — Messagebird MCP Server

> MessageBird omnichannel messaging MCP — send SMS, manage messages and contacts via the MessageBird REST API

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-messagebird`

---

## What You Can Do

This MCP server gives AI agents access to Messagebird via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Messagebird directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `send_message` | Send an SMS message |
| `get_message` | Get a message by ID |
| `list_messages` | List sent messages |
| `delete_message` | Delete a message by ID |
| `get_balance` | Get the account balance |
| `list_contacts` | List contacts |
| `create_contact` | Create a new contact |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MESSAGEBIRD_API_KEY` | Yes | Your MESSAGEBIRD API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Messagebird"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `MESSAGEBIRD_API_KEY`

Once added, every AI agent in your workspace can use Messagebird tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-messagebird \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MESSAGEBIRD-API-KEY: your-messagebird-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_message","arguments":{}}}'
```

## License

MIT
