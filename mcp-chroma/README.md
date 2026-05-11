# mcp-chroma — Chroma MCP Server

> Vector database operations on Chroma — create collections, upsert documents, query by similarity for RAG pipelines.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-chroma`

---

## What You Can Do

This MCP server gives AI agents access to Chroma via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Chroma directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_collections` | List all collections in Chroma with an optional limit |
| `create_collection` | Create a new collection in Chroma |
| `get_collection` | Get a collection by name |
| `delete_collection` | Delete a collection by name |
| `add` | Add documents/embeddings to a collection |
| `query` | Query a collection by text or embedding vectors |
| `get` | Get documents from a collection by IDs or metadata filter |
| `delete` | Delete documents from a collection by IDs or metadata filter |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `CHROMA_URL` | Yes | See provider documentation |
| `CHROMA_API_KEY` | Yes | Your CHROMA API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Chroma"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `CHROMA_URL`
- `CHROMA_API_KEY`

Once added, every AI agent in your workspace can use Chroma tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-chroma \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CHROMA-URL: your-chroma-url' \
  -H 'X-Mcp-Secret-CHROMA-API-KEY: your-chroma-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_collections","arguments":{}}}'
```

## License

MIT
