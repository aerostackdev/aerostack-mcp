# mcp-algolia — Algolia Search MCP Server

> Search indexes, manage records, browse data, and configure ranking in Algolia from any AI agent.

Algolia is a hosted search-as-a-service platform with instant full-text search, typo tolerance, faceting, and custom ranking. This MCP server gives your AI agents direct access to search queries, record management, index browsing, and settings configuration — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-algolia`

---

## What You Can Do

- Search any index with text queries, filters, facets, and pagination
- List all indexes with entry counts and sizes
- Browse/iterate all records in an index with cursor-based pagination
- Add or update records in batch
- Get or delete individual records by objectID
- View and update index settings (searchable attributes, ranking, facets)

## Available Tools

| Tool | Description |
|------|-------------|
| `search` | Query an index with filters, facets, and pagination |
| `list_indexes` | List all indexes with stats (entries, size, last updated) |
| `get_index_settings` | Get the full configuration for an index |
| `browse_index` | Iterate all records with cursor-based pagination |
| `add_records` | Batch add or update records in an index |
| `delete_record` | Delete a record by objectID |
| `get_record` | Get a single record by objectID |
| `set_settings` | Update index config (searchable attributes, ranking, etc.) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `ALGOLIA_APP_ID` | Yes | Your Algolia Application ID | [dashboard.algolia.com](https://dashboard.algolia.com) → **Settings** → **API Keys** → **Application ID** |
| `ALGOLIA_API_KEY` | Yes | Algolia Admin API Key (or scoped key with search + addObject + deleteObject + settings + browse permissions) | [dashboard.algolia.com](https://dashboard.algolia.com) → **Settings** → **API Keys** → **Admin API Key** or create a scoped key |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Algolia"** and click **Add to Workspace**
3. Add `ALGOLIA_APP_ID` and `ALGOLIA_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can search and manage your Algolia indexes automatically.

### Example Prompts

```
"List all my Algolia indexes"
"Search the products index for 'wireless headphones' with filter 'price < 100'"
"Browse all records in the users index"
"Add a new product record with name 'Widget Pro' and price 29.99"
"Get the settings for the articles index"
"Update the products index to make 'brand' and 'category' searchable attributes"
"Delete the record with objectID 'product_123' from the products index"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-algolia \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ALGOLIA-APP-ID: YOUR_APP_ID' \
  -H 'X-Mcp-Secret-ALGOLIA-API-KEY: YOUR_API_KEY' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search","arguments":{"index":"products","query":"headphones"}}}'
```

## Security Notes

- `ALGOLIA_APP_ID` and `ALGOLIA_API_KEY` are injected at the Aerostack gateway layer — never stored in this worker's code
- Use a scoped API key with minimal permissions for production (search, browse, addObject, deleteObject, settings)
- The Admin API Key has full access — prefer scoped keys when possible

## License

MIT
