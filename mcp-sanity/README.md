# mcp-sanity — Sanity MCP Server

> Connect your Sanity.io CMS to AI — run GROQ queries, manage documents, explore schemas, and administer projects with natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-sanity`

---

## What You Can Do

This MCP server gives AI agents access to Sanity via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Sanity directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `query` | Run a GROQ query against the Sanity dataset |
| `get_document` | Get a document by its ID |
| `create_document` | Create a new document in Sanity |
| `patch_document` | Update specific fields in an existing document |
| `delete_document` | Delete a document from Sanity |
| `list_projects` | List all Sanity projects accessible with the current token |
| `get_project` | Get details about a Sanity project |
| `list_datasets` | List datasets in a Sanity project |
| `list_schemas` | List all document types defined in the dataset |
| `count_documents` | Count documents of a specific type |
| `list_recent_documents` | List recently updated documents of a given type |
| `get_api_stats` | Get API usage statistics and project details |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SANITY_API_TOKEN` | Yes | Personal access token or service token from the provider |
| `SANITY_PROJECT_ID` | Yes | See provider documentation |
| `SANITY_DATASET` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Sanity"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `SANITY_API_TOKEN`
- `SANITY_PROJECT_ID`
- `SANITY_DATASET`

Once added, every AI agent in your workspace can use Sanity tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-sanity \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SANITY-API-TOKEN: your-sanity-api-token' \
  -H 'X-Mcp-Secret-SANITY-PROJECT-ID: your-sanity-project-id' \
  -H 'X-Mcp-Secret-SANITY-DATASET: your-sanity-dataset' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query","arguments":{}}}'
```

## License

MIT
