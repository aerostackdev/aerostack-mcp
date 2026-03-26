# Notion Workspace MCP

> Official proxy MCP — Pages, databases, blocks, search via Notion's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-notion`

---

## Overview

Notion Workspace is a proxy MCP server that forwards requests directly to the official Notion MCP endpoint at `https://mcp.notion.com/mcp`. All tools are maintained by Notion — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Notion)
**Auth:** Bearer token via `NOTION_API_KEY`

## Important: OAuth Token Required

Notion's MCP endpoint **requires an OAuth access token**. Internal integration tokens (`ntn_...`) will **NOT work** — you'll get a 401 "Invalid token format" error.

### How to Get a Notion OAuth Token

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"New integration"** → Set type to **Public** (not Internal)
3. Fill in the OAuth settings:
   - **Redirect URI:** Any URL you control (e.g., `https://yoursite.com/callback`)
   - **Integration type:** Public
4. Copy your **OAuth client ID** and **OAuth client secret**
5. Direct your browser to:
   ```
   https://api.notion.com/v1/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&owner=user&redirect_uri=YOUR_REDIRECT_URI
   ```
6. Authorize the integration → you'll be redirected with a `code` parameter
7. Exchange the code for a token:
   ```bash
   curl -X POST https://api.notion.com/v1/oauth/token \
     -H "Content-Type: application/json" \
     -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
     -d '{"grant_type": "authorization_code", "code": "YOUR_CODE", "redirect_uri": "YOUR_REDIRECT_URI"}'
   ```
8. Copy the `access_token` from the response — this is your `NOTION_API_KEY`

See: [developers.notion.com/docs/authorization](https://developers.notion.com/docs/authorization)

## Available Tools

- **search_pages** — Search across all Notion pages and databases accessible to the integration by title or content
- **get_page** — Retrieve a Notion page's properties and metadata by its page ID
- **create_page** — Create a new Notion page inside a parent page or database with properties and content blocks
- **update_page** — Update properties of an existing Notion page such as title, status, date, or any database property
- **query_database** — Query a Notion database with filters and sorting to retrieve matching page entries

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `NOTION_API_KEY` | Yes | Notion OAuth Access Token | See "How to Get a Notion OAuth Token" above |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Notion Workspace"**
3. Enter your OAuth access token as `NOTION_API_KEY` — stored encrypted, injected automatically
4. Click **Test** to verify the connection

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
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-notion \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-NOTION-API-KEY: your-oauth-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_pages","arguments":{"query":"test"}}}'
```

## License

MIT
