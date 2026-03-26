# mcp-qdrant — Qdrant MCP Server

> Search, upsert, and manage vector collections in your Qdrant database from your AI agents.

Qdrant is the open-source vector search engine built for AI applications — powering semantic search, RAG pipelines, and recommendation systems at scale. This MCP server gives your AI agents direct access to your Qdrant instance: creating collections, upserting vectors with payloads, running similarity searches, and managing points — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-qdrant`

---

## What You Can Do

- Create and manage vector collections with configurable dimensions and distance metrics
- Upsert points with vectors and metadata payloads for semantic indexing
- Run similarity searches against your vectors to power RAG retrieval and recommendations
- Scroll, count, and filter points to explore and audit your vector data

## Available Tools

| Tool | Description |
|------|-------------|
| `list_collections` | List all collections in the database |
| `get_collection` | Get collection info including vector count, config, and status |
| `create_collection` | Create a new collection with vector size and distance metric |
| `delete_collection` | Delete a collection and all its data |
| `upsert_points` | Upsert points (vectors + payload) into a collection |
| `search` | Search for similar vectors with filters and score thresholds |
| `get_points` | Get points by their IDs |
| `delete_points` | Delete points by IDs or filter |
| `scroll` | Scroll through points with optional filter and pagination |
| `count` | Count points in a collection with optional filter |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `QDRANT_URL` | Yes | Your Qdrant instance URL (e.g. `https://xyz.us-east4-0.gcp.cloud.qdrant.io:6333`) | [cloud.qdrant.io](https://cloud.qdrant.io) → Your Cluster → copy **Cluster URL** |
| `QDRANT_API_KEY` | Yes | Qdrant API key for authentication | [cloud.qdrant.io](https://cloud.qdrant.io) → Your Cluster → **Data Access Control** → create or copy **API Key** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Qdrant"** and click **Add to Workspace**
3. Add `QDRANT_URL` and `QDRANT_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Qdrant tools automatically — no per-user setup needed.

### Example Prompts

```
"List all collections in my Qdrant database"
"Create a new collection called 'documents' with 1536-dimensional vectors using cosine distance"
"Search the 'documents' collection for vectors similar to this embedding, return top 5 results"
"Count how many points are in the 'products' collection where category is 'electronics'"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-qdrant \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-QDRANT-URL: https://your-cluster.cloud.qdrant.io:6333' \
  -H 'X-Mcp-Secret-QDRANT-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_collections","arguments":{}}}'
```

## License

MIT
