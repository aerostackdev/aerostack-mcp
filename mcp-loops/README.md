# mcp-loops — Loops MCP Server

> Email marketing for SaaS via Loops — manage contacts, send transactional emails, trigger event flows.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-loops`

---

## What You Can Do

This MCP server gives AI agents access to Loops via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Loops directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `create_contact` | Create a new contact in Loops. Email is required. You can also set custom properties. |
| `update_contact` | Update an existing Loops contact by email. Only include fields you want to change. |
| `find_contact` | Find a Loops contact by their email address. |
| `delete_contact` | Delete a contact from Loops by email address. This action cannot be undone. |
| `send_event` | Send an event to Loops to trigger a Loop (automated email sequence) for a contact. |
| `send_transactional` | Send a transactional email to a contact via a Loops transactional template. |
| `list_mailing_lists` | List all mailing lists in your Loops account. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `LOOPS_API_KEY` | Yes | Your LOOPS API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Loops"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `LOOPS_API_KEY`

Once added, every AI agent in your workspace can use Loops tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-loops \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LOOPS-API-KEY: your-loops-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_contact","arguments":{}}}'
```

## License

MIT
