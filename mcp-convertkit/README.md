# mcp-convertkit — Convertkit MCP Server

> Grow your creator audience with ConvertKit (Kit) — manage subscribers, broadcasts, sequences, tags, and forms from AI.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-convertkit`

---

## What You Can Do

This MCP server gives AI agents access to Convertkit via 18 tools. Connect it to any Aerostack workspace and your agents can interact with Convertkit directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_subscribers` | List subscribers with optional filters |
| `get_subscriber` | Get a subscriber by ID |
| `create_subscriber` | Create a new subscriber |
| `update_subscriber` | Update an existing subscriber |
| `unsubscribe` | Unsubscribe a subscriber |
| `bulk_create_subscribers` | Create multiple subscribers at once |
| `list_broadcasts` | List broadcasts (email campaigns) |
| `get_broadcast` | Get a broadcast by ID |
| `create_broadcast` | Create a new broadcast |
| `list_forms` | List all forms |
| `add_subscriber_to_form` | Add a subscriber to a form |
| `list_sequences` | List all email sequences |
| `add_subscriber_to_sequence` | Add a subscriber to an email sequence |
| `list_tags` | List all tags |
| `create_tag` | Create a new tag |
| `tag_subscriber` | Add a tag to a subscriber |
| `remove_tag_from_subscriber` | Remove a tag from a subscriber |
| `get_account_info` | Get account information |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `CONVERTKIT_API_KEY` | Yes | Your CONVERTKIT API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Convertkit"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `CONVERTKIT_API_KEY`

Once added, every AI agent in your workspace can use Convertkit tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-convertkit \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CONVERTKIT-API-KEY: your-convertkit-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_subscribers","arguments":{}}}'
```

## License

MIT
