# mcp-helpscout — Helpscout MCP Server

> Full Help Scout integration — manage conversations, mailboxes, customers, and tags for customer support operations.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-helpscout`

---

## What You Can Do

This MCP server gives AI agents access to Helpscout via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Helpscout directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_conversations` | List active conversations. Returns paginated conversation summaries. |
| `get_conversation` | Get full details of a conversation by ID. |
| `create_conversation` | Create a new email conversation. |
| `reply_to_conversation` | Reply to an existing conversation thread. |
| `update_conversation` | Update conversation status, assignee, or tags. |
| `delete_conversation` | Permanently delete a conversation. |
| `list_mailboxes` | List all mailboxes in the Help Scout account. |
| `get_mailbox` | Get details of a specific mailbox. |
| `list_customers` | List customers with pagination. |
| `get_customer` | Get customer details by ID. |
| `create_customer` | Create a new customer. |
| `update_customer` | Update an existing customer record. |
| `list_tags` | List all tags in the account. |
| `search_conversations` | Search conversations by query string. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `HELPSCOUT_ACCESS_TOKEN` | Yes | Your Help Scout OAuth access token — found in Settings → API & Integrations |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Helpscout"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `HELPSCOUT_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Helpscout tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-helpscout \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-HELPSCOUT-ACCESS-TOKEN: your-helpscout-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_conversations","arguments":{}}}'
```

## License

MIT
