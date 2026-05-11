# mcp-weaviate — Weaviate MCP Server

> Vector database operations via Weaviate — create schemas, add objects, run semantic search, and build RAG pipelines.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-weaviate`

---

## What You Can Do

This MCP server gives AI agents access to Weaviate via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Weaviate directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_collections` | List all collections/classes in the Weaviate schema |
| `get_collection` | Get the schema definition for a specific collection/class |
| `create_collection` | Create a new collection/class in the Weaviate schema |
| `delete_collection` | Delete a collection/class and all its objects from Weaviate |
| `add_objects` | Add one or more objects to a Weaviate collection. Uses batch endpoint for multiple objects. |
| `query_objects` | Query objects using the Weaviate GraphQL API. Provide a full GraphQL query string. |
| `get_object` | Get a specific object by its class and UUID |
| `delete_object` | Delete a specific object by its class and UUID |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `WEAVIATE_URL` | Yes | See provider documentation |
| `WEAVIATE_API_KEY` | Yes | Your WEAVIATE API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Weaviate"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `WEAVIATE_URL`
- `WEAVIATE_API_KEY`

Once added, every AI agent in your workspace can use Weaviate tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-weaviate \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-WEAVIATE-URL: your-weaviate-url' \
  -H 'X-Mcp-Secret-WEAVIATE-API-KEY: your-weaviate-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_collections","arguments":{}}}'
```

## License

MIT
