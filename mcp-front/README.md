# mcp-front — Front MCP Server

> Full Front integration — manage shared inboxes, conversations, messages, contacts, and teammate assignments for collaborative customer support.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-front`

---

## What You Can Do

This MCP server gives AI agents access to Front via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Front directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_conversations` | List conversations in Front with optional status filters. |
| `get_conversation` | Get full details of a specific conversation. |
| `list_messages` | List all messages in a conversation. |
| `get_message` | Get a specific message by ID. |
| `send_reply` | Send a reply to a conversation. |
| `update_conversation` | Update conversation assignee, status, inbox, or tags. |
| `list_inboxes` | List all inboxes in the Front account. |
| `get_inbox` | Get details of a specific inbox. |
| `list_contacts` | List contacts with pagination. |
| `get_contact` | Get a contact by ID. |
| `create_contact` | Create a new contact in Front. |
| `update_contact` | Update a contact name or description. |
| `list_teammates` | List all teammates in the Front account. |
| `create_conversation_note` | Add an internal note to a conversation. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `FRONT_API_TOKEN` | Yes | Your Front API token — found in Settings → Developers → API Tokens |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Front"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `FRONT_API_TOKEN`

Once added, every AI agent in your workspace can use Front tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-front \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FRONT-API-TOKEN: your-front-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_conversations","arguments":{}}}'
```

## License

MIT
