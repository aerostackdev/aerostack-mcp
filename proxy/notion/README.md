# Notion Workspace MCP

> Official proxy MCP — Pages, databases, blocks, search via Notion's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-notion`

---

## Overview

Notion Workspace is a proxy MCP server that forwards requests directly to the official Notion MCP endpoint at `https://mcp.notion.com/mcp`. All tools are maintained by Notion — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Notion)
**Auth:** Bearer token via `NOTION_API_KEY`

## Available Tools

- **search_pages** — Search across all Notion pages and databases accessible to the integration by title or content
- **get_page** — Retrieve a Notion page's properties and metadata by its page ID
- **create_page** — Create a new Notion page inside a parent page or database with properties and content blocks
- **update_page** — Update properties of an existing Notion page such as title, status, date, or any database property
- **query_database** — Query a Notion database with filters and sorting to retrieve matching page entries

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `NOTION_API_KEY` | Yes | Notion Integration Token | notion.so/my-integrations → New integration → Copy Internal Integration Token |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Notion Workspace"**
3. Enter your `NOTION_API_KEY` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Notion tools automatically.

## Usage

### Example Prompts

```
"List all my Notion items and summarize the most recent ones"
"Find anything related to [keyword] in Notion"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-notion \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-NOTION-API-KEY: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_pages","arguments":{}}}'
```

## License

MIT
