# mcp-milvus — Milvus MCP Server

> Vector database operations via Milvus — create collections, insert vectors, run similarity search for AI applications.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-milvus`

---

## What You Can Do

This MCP server gives AI agents access to Milvus via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Milvus directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_collections` | List all collections in the Milvus/Zilliz database |
| `describe_collection` | Get detailed schema and metadata for a collection |
| `create_collection` | Create a new vector collection with specified dimensions |
| `drop_collection` | Drop (delete) a collection and all its data |
| `insert` | Insert entities/vectors into a collection |
| `search` | Search for similar vectors in a collection using ANN (Approximate Nearest Neighbor) |
| `query` | Query entities from a collection using a scalar filter expression |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MILVUS_ENDPOINT` | Yes | See provider documentation |
| `MILVUS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Milvus"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `MILVUS_ENDPOINT`
- `MILVUS_TOKEN`

Once added, every AI agent in your workspace can use Milvus tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-milvus \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MILVUS-ENDPOINT: your-milvus-endpoint' \
  -H 'X-Mcp-Secret-MILVUS-TOKEN: your-milvus-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_collections","arguments":{}}}'
```

## License

MIT
