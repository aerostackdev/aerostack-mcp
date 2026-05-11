# mcp-contentful — Contentful MCP Server

> Connect your Contentful CMS to AI — manage entries, assets, content types, and spaces with natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-contentful`

---

## What You Can Do

This MCP server gives AI agents access to Contentful via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Contentful directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_spaces` | List all Contentful spaces accessible with the current token |
| `get_space` | Get details about a Contentful space |
| `list_content_types` | List content types in a space |
| `get_content_type` | Get a specific content type definition |
| `list_entries` | List entries in a space, optionally filtered by content type |
| `get_entry` | Get a specific entry by ID |
| `create_entry` | Create a new entry in Contentful |
| `update_entry` | Update an existing entry |
| `publish_entry` | Publish an entry to make it publicly available |
| `delete_entry` | Delete an entry from a space |
| `list_assets` | List assets in a space |
| `get_asset` | Get a specific asset by ID |
| `search_entries` | Search entries with a full-text query |
| `list_environments` | List environments in a space |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `CONTENTFUL_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |
| `CONTENTFUL_SPACE_ID` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Contentful"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `CONTENTFUL_ACCESS_TOKEN`
- `CONTENTFUL_SPACE_ID`

Once added, every AI agent in your workspace can use Contentful tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-contentful \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CONTENTFUL-ACCESS-TOKEN: your-contentful-access-token' \
  -H 'X-Mcp-Secret-CONTENTFUL-SPACE-ID: your-contentful-space-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_spaces","arguments":{}}}'
```

## License

MIT
