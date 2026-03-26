# mcp-coda — Coda MCP Server

> Access docs, tables, rows, formulas, and automations in Coda — AI-native doc-database hybrid for any agent.

Coda is the all-in-one doc that combines the flexibility of documents with the power of spreadsheets and databases. This MCP server gives your AI agents full read/write access to your Coda workspace — listing docs, querying table rows, inserting and updating data, and inspecting formulas and controls. Connect it once and every agent in your workspace can work with your Coda data.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-coda`

---

## What You Can Do

- List and search your Coda docs, then drill into any doc's tables, formulas, and controls
- Query table rows with filters and sorting — great for CRM lookups, project tracking, or inventory checks
- Insert new rows or update existing ones from agent workflows — automate data entry that currently requires opening Coda
- Inspect named formulas and controls to understand doc logic before making changes

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Health check — verifies the server and API token are working |
| `list_docs` | List Coda docs accessible to the authenticated user, with optional search |
| `get_doc` | Get detailed information about a specific Coda doc |
| `list_tables` | List all tables in a Coda doc |
| `get_table_rows` | Get rows from a table with optional query filter, sort, and limit |
| `insert_rows` | Insert one or more rows into a Coda table |
| `update_row` | Update an existing row in a Coda table |
| `delete_row` | Delete a row from a Coda table |
| `list_formulas` | List all named formulas in a Coda doc |
| `list_controls` | List all controls (buttons, sliders, inputs) in a Coda doc |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `CODA_API_TOKEN` | Yes | API token for Coda API v1 | [coda.io/account](https://coda.io/account) → **API settings** → **Generate API token** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Coda"** and click **Add to Workspace**
3. Add your `CODA_API_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call Coda tools automatically — no per-user setup needed.

### Example Prompts

```
"List all my Coda docs that mention 'Q2 Planning'"
"Show me the rows in the Tasks table where Status is 'In Progress'"
"Add a new row to the Bugs table with title 'Login timeout' and priority 'High'"
"What formulas are defined in my Sprint Tracker doc?"
"Delete the row with ID i-abc123 from the Inventory table"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-coda \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CODA-API-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_docs","arguments":{}}}'
```

## License

MIT
