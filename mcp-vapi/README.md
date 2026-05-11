# mcp-vapi — Vapi MCP Server

> AI voice agent infrastructure via Vapi — create assistants, manage calls, configure phone numbers, and build voice apps.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-vapi`

---

## What You Can Do

This MCP server gives AI agents access to Vapi via 9 tools. Connect it to any Aerostack workspace and your agents can interact with Vapi directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_assistants` | List all voice assistants in your Vapi account with their configurations, voices, and models. |
| `get_assistant` | Get full configuration details for a specific Vapi voice assistant including voice, model, and first message settings. |
| `create_assistant` | Create a new Vapi voice assistant with a model, voice, and first message configuration. |
| `update_assistant` | Update configuration of an existing Vapi voice assistant. Only provided fields are updated. |
| `delete_assistant` | Delete a Vapi voice assistant. This action cannot be undone. |
| `list_calls` | List recent calls made through Vapi with status, duration, and transcript availability. |
| `get_call` | Get details about a specific call including full transcript, recording URL, duration, and cost. |
| `create_call` | Initiate an outbound phone call using a Vapi assistant to a customer phone number. |
| `list_phone_numbers` | List all provisioned phone numbers in your Vapi account with their providers and capabilities. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `VAPI_API_KEY` | Yes | Your VAPI API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Vapi"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `VAPI_API_KEY`

Once added, every AI agent in your workspace can use Vapi tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-vapi \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-VAPI-API-KEY: your-vapi-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_assistants","arguments":{}}}'
```

## License

MIT
