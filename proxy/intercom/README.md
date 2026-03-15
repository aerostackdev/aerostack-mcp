# Intercom Messaging MCP

> Official proxy MCP — Conversations, contacts, tickets, articles via Intercom's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-intercom`

---

## Overview

Intercom Messaging is a proxy MCP server that forwards requests directly to the official Intercom MCP endpoint at `https://mcp.intercom.com/mcp`. All tools are maintained by Intercom — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Intercom)
**Auth:** Bearer token via `INTERCOM_ACCESS_TOKEN`

## Available Tools

- **list_conversations** — List Intercom conversations with optional filters for state, assignee, or date range
- **reply_to_conversation** — Send a reply message to an Intercom conversation from a team member or bot
- **create_contact** — Create a new Intercom contact (user or lead) with email, name, and custom attributes
- **search_contacts** — Search Intercom contacts using query operators on email, name, or custom attributes
- **get_contact** — Retrieve a single Intercom contact by ID with all attributes, tags, and conversation history

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `INTERCOM_ACCESS_TOKEN` | Yes | Intercom Access Token | app.intercom.com → Settings → Integrations → Developer Hub → New App → Authentication |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Intercom Messaging"**
3. Enter your `INTERCOM_ACCESS_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Intercom tools automatically.

## Usage

### Example Prompts

```
"List all my Intercom items and summarize the most recent ones"
"Find anything related to [keyword] in Intercom"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-intercom \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-INTERCOM-ACCESS-TOKEN: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_conversations","arguments":{}}}'
```

## License

MIT
