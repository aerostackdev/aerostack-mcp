# mcp-crisp — Crisp MCP Server

> Crisp customer support MCP — manage conversations, messages, and operators via the Crisp REST API

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-crisp`

---

## What You Can Do

This MCP server gives AI agents access to Crisp via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Crisp directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_conversations` | List open conversations for the website |
| `get_conversation` | Get conversation details by session ID |
| `send_message` | Send a message in a conversation |
| `list_messages` | List messages in a conversation |
| `resolve_conversation` | Resolve (close) a conversation |
| `assign_conversation` | Assign a conversation to an agent |
| `list_operators` | List all operators for the website |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `CRISP_IDENTIFIER` | Yes | See provider documentation |
| `CRISP_KEY` | Yes | See provider documentation |
| `CRISP_WEBSITE_ID` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Crisp"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `CRISP_IDENTIFIER`
- `CRISP_KEY`
- `CRISP_WEBSITE_ID`

Once added, every AI agent in your workspace can use Crisp tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-crisp \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CRISP-IDENTIFIER: your-crisp-identifier' \
  -H 'X-Mcp-Secret-CRISP-KEY: your-crisp-key' \
  -H 'X-Mcp-Secret-CRISP-WEBSITE-ID: your-crisp-website-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_conversations","arguments":{}}}'
```

## License

MIT
