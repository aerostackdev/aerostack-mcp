# mcp-pinecone — Pinecone MCP Server

> Query, upsert, and manage vectors in your Pinecone indexes from your AI agents.

Pinecone is the leading vector database for AI/ML applications — purpose-built for high-performance similarity search at scale. This MCP server gives your AI agents full access to your Pinecone indexes: querying vectors for semantic search and RAG, upserting embeddings, managing namespaces, and inspecting index statistics — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-pinecone`

---

## What You Can Do

- Query vectors by embedding or ID for semantic search, recommendation, and RAG retrieval workflows
- Upsert embeddings with metadata to build and maintain your vector knowledge base
- Manage indexes — list, describe, and inspect statistics across all your Pinecone indexes
- Delete vectors by ID, metadata filter, or wipe entire namespaces for data lifecycle management
- Paginate through vector IDs and fetch full vectors by ID for auditing and debugging

## Available Tools

| Tool | Description |
|------|-------------|
| `list_indexes` | List all indexes with status, dimension, metric, and host |
| `describe_index` | Get detailed info for a specific index (host, dimension, status) |
| `query` | Query vectors by embedding or ID with filters, topK, and metadata |
| `upsert` | Upsert vectors with IDs, values, and optional metadata |
| `fetch` | Fetch full vectors by their IDs |
| `delete_vectors` | Delete vectors by IDs, metadata filter, or delete all |
| `describe_stats` | Get index statistics — total vectors, per-namespace counts |
| `list_vectors` | List vector IDs in a namespace with pagination |
| `update_vector` | Update a vector's values or metadata by ID |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `PINECONE_API_KEY` | Yes | Your Pinecone API key | [app.pinecone.io](https://app.pinecone.io) → **API Keys** → copy your key |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Pinecone"** and click **Add to Workspace**
3. Add `PINECONE_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Pinecone tools automatically — no per-user setup needed.

### Example Prompts

```
"List all my Pinecone indexes and show their dimensions and status"
"Query my product-embeddings index for the top 5 vectors similar to this text embedding"
"Upsert these 3 document embeddings into the knowledge-base index with their source metadata"
"Show me the stats for my main index — how many vectors per namespace?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-pinecone \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PINECONE-API-KEY: your-pinecone-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_indexes","arguments":{}}}'
```

## License

MIT
