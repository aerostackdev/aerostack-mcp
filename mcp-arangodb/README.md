# mcp-arangodb — ArangoDB MCP Server

> Run AQL queries, traverse graphs, and manage documents in your ArangoDB database from your AI agents.

ArangoDB is the multi-model database that combines documents, graphs, and key-value storage in a single engine — used by enterprises for fraud detection, knowledge graphs, recommendation engines, and supply chain management. This MCP server gives your AI agents direct access to your ArangoDB instance: querying collections, inserting and updating documents, running AQL queries, traversing named graphs, and managing databases — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-arangodb`

---

## What You Can Do

- Run AQL queries with bind variables to pull live data into agent workflows
- Traverse named graphs to explore relationships between entities (social networks, dependency trees, knowledge graphs)
- Perform full document CRUD — get, insert, update, and delete documents in any collection
- Manage collections and databases across your multi-model data layer

## Available Tools

| Tool | Description |
|------|-------------|
| `list_databases` | List all accessible databases |
| `list_collections` | List all collections in a database |
| `create_collection` | Create a new document or edge collection |
| `get_document` | Retrieve a document by its key |
| `insert_document` | Insert a document into a collection |
| `update_document` | Partially update a document by key |
| `delete_document` | Delete a document by key |
| `aql_query` | Execute an AQL query with optional bind variables |
| `list_graphs` | List all named graphs |
| `traverse` | Perform a graph traversal from a start vertex |
| `collection_count` | Get the document count of a collection |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `ARANGODB_URL` | Yes | Your ArangoDB server URL (including port) | Your ArangoDB deployment URL, e.g. `https://xxx.arangodb.cloud:8529` |
| `ARANGODB_USERNAME` | Yes | Database username | Configured in your ArangoDB instance (default: `root`) |
| `ARANGODB_PASSWORD` | Yes | Database password | The password for the database user |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"ArangoDB"** and click **Add to Workspace**
3. Add `ARANGODB_URL`, `ARANGODB_USERNAME`, and `ARANGODB_PASSWORD` under **Project → Secrets**

Once added, every AI agent in your workspace can call ArangoDB tools automatically — no per-user setup needed.

### Example Prompts

```
"List all databases and collections in my ArangoDB instance"
"Run an AQL query to find all users who signed up in the last 7 days"
"Traverse the social graph starting from user/alice to find all friends within 2 hops"
"Insert a new document into the products collection with name: Widget and price: 9.99"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-arangodb \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ARANGODB-URL: https://your-instance.arangodb.cloud:8529' \
  -H 'X-Mcp-Secret-ARANGODB-USERNAME: root' \
  -H 'X-Mcp-Secret-ARANGODB-PASSWORD: your-password' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_databases","arguments":{}}}'
```

## License

MIT
