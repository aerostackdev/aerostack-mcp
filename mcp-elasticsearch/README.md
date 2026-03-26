# mcp-elasticsearch — Elasticsearch MCP Server

> Search, index, and manage documents in your Elasticsearch cluster from your AI agents.

Elasticsearch is the distributed search and analytics engine powering search at scale — from full-text search and log analytics to vector similarity and real-time aggregations. This MCP server gives your AI agents direct access to your Elasticsearch cluster: searching documents with the full Query DSL, indexing and updating records, managing indices and mappings, and monitoring cluster health — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-elasticsearch`

---

## What You Can Do

- Search documents across any index using Elasticsearch Query DSL — full-text, term, range, bool, and more
- Index, update, and delete documents to keep your search data current from agent workflows
- Bulk index large batches of documents in a single request for efficient data loading
- Create and manage indices with custom mappings and settings for new data sources
- Monitor cluster health and inspect index mappings to understand your data topology

## Available Tools

| Tool | Description |
|------|-------------|
| `list_indices` | List all indices with health, doc count, and size |
| `get_mapping` | Get field mappings for an index |
| `search` | Search documents using Elasticsearch Query DSL |
| `index_document` | Index (create or replace) a document |
| `get_document` | Get a document by ID |
| `update_document` | Partially update a document by ID |
| `delete_document` | Delete a document by ID |
| `bulk` | Bulk index/update/delete operations in one request |
| `count` | Count documents matching an optional query |
| `create_index` | Create an index with optional mappings and settings |
| `delete_index` | Delete an index and all its documents |
| `cluster_health` | Get cluster health status (green/yellow/red) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `ELASTICSEARCH_URL` | Yes | Your Elasticsearch cluster URL | Elastic Cloud: **Deployments** → your deployment → **Copy endpoint** (e.g. `https://my-deploy.es.us-east-1.aws.elastic.cloud:9243`). Self-hosted: your cluster's base URL. |
| `ELASTICSEARCH_API_KEY` | Yes | Elasticsearch API key for authentication | Kibana: **Stack Management** → **API Keys** → **Create API key** → copy the Base64-encoded key |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Elasticsearch"** and click **Add to Workspace**
3. Add `ELASTICSEARCH_URL` and `ELASTICSEARCH_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Elasticsearch tools automatically — no per-user setup needed.

### Example Prompts

```
"List all indices in my Elasticsearch cluster and show their doc counts"
"Search the products index for items matching 'wireless headphones' sorted by price ascending"
"Index a new document into the logs index with level: error and message: Connection timeout"
"Get the cluster health and show me any yellow or red indices"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-elasticsearch \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ELASTICSEARCH-URL: https://my-deploy.es.us-east-1.aws.elastic.cloud:9243' \
  -H 'X-Mcp-Secret-ELASTICSEARCH-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_indices","arguments":{}}}'
```

## License

MIT
