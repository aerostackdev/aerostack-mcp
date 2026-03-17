# mcp-mongodb — MongoDB Atlas MCP Server

> Query collections, insert documents, and run aggregation pipelines on your MongoDB Atlas database from your AI agents.

MongoDB Atlas is the cloud-hosted version of MongoDB — the most popular document database, used by millions of developers to store flexible JSON-like documents at scale. This MCP server gives your AI agents full CRUD access plus aggregation pipeline support through the Atlas Data API: finding, inserting, updating, and deleting documents across any database and collection in your cluster — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-mongodb`

---

## What You Can Do

- Query any collection in your MongoDB Atlas cluster with filters, sorting, and pagination to pull live data into agent workflows
- Insert, update, or delete documents to write results back to your database as part of automation pipelines
- Run aggregation pipelines to perform complex data transformations, grouping, and analytics directly on your cluster
- List databases and collections to explore your data model and discover available data sources

## Available Tools

| Tool | Description |
|------|-------------|
| `list_databases` | List all databases in the Atlas cluster |
| `list_collections` | List all collections in a database |
| `find_one` | Find a single document matching a filter |
| `find` | Find multiple documents with filter, sort, limit, skip, projection |
| `insert_one` | Insert a single document into a collection |
| `insert_many` | Insert multiple documents into a collection |
| `update_one` | Update a single document matching a filter |
| `update_many` | Update multiple documents matching a filter |
| `delete_one` | Delete a single document matching a filter |
| `delete_many` | Delete multiple documents matching a filter |
| `aggregate` | Run an aggregation pipeline on a collection |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `MONGODB_APP_ID` | Yes | Atlas Data API Application ID | [cloud.mongodb.com](https://cloud.mongodb.com) → Your Project → **App Services** → select your app → copy the **App ID** from the top of the page |
| `MONGODB_API_KEY` | Yes | Atlas Data API Key | Same project → **App Services** → **Authentication** → **API Keys** → create or copy an API key |
| `MONGODB_CLUSTER` | Yes | Cluster name (e.g. "Cluster0") | **Database** tab → your cluster name is shown at the top of the cluster card |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"MongoDB"** and click **Add to Workspace**
3. Add `MONGODB_APP_ID`, `MONGODB_API_KEY`, and `MONGODB_CLUSTER` under **Project → Secrets**

Once added, every AI agent in your workspace can call MongoDB tools automatically — no per-user setup needed.

### Example Prompts

```
"List all collections in my 'myapp' database"
"Find all orders in the orders collection where status is 'pending', sorted by createdAt descending"
"Insert a new user document with name 'Alice' and email 'alice@example.com' into the users collection"
"Run an aggregation pipeline on the events collection to group by event type and count occurrences"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-mongodb \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MONGODB-APP-ID: your-app-id' \
  -H 'X-Mcp-Secret-MONGODB-API-KEY: your-api-key' \
  -H 'X-Mcp-Secret-MONGODB-CLUSTER: Cluster0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find","arguments":{"database":"myapp","collection":"users","filter":{},"limit":10}}}'
```

## License

MIT
