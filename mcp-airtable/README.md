# mcp-airtable — Airtable MCP Server

> Manage Airtable bases, tables, and records through natural language.

Airtable is the flexible database-spreadsheet hybrid teams use to track projects, CRM pipelines, inventory, and more. This MCP server gives your AI agents full read/write access to any base you connect — querying, creating, and updating records without anyone opening the Airtable UI. Connect it once and every agent in your workspace can work with your Airtable data.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-airtable`

---

## What You Can Do

- Query any Airtable table and filter records using Airtable formulas — great for CRM lookups, inventory checks, or task tracking
- Create and update records from agent workflows — automate data entry that currently requires manual work in Airtable
- Inspect base and table schemas so agents understand your data structure before writing to it
- Search across records to find matching entries by field value without needing exact record IDs

## Available Tools

| Tool | Description |
|------|-------------|
| `list_bases` | List all Airtable bases the authenticated user has access to |
| `list_tables` | List tables in a base with their field schemas |
| `list_records` | List records from a table with optional filtering and sorting |
| `get_record` | Get a single record by ID |
| `create_record` | Create a new record in a table |
| `update_record` | Update fields of an existing record |
| `search_records` | Search records using an Airtable formula filter |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `AIRTABLE_API_KEY` | Yes | Personal access token for Airtable API | [airtable.com](https://airtable.com) → Account → **Developer Hub** → **Personal access tokens** → Create token with `data.records:read`, `data.records:write`, `schema.bases:read` scopes |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Airtable"** and click **Add to Workspace**
3. Add your `AIRTABLE_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Airtable tools automatically — no per-user setup needed.

### Example Prompts

```
"List all records in the Leads table where Status is New"
"Create a new task in my Project Tracker base assigned to Sarah, due next Friday"
"Search the Inventory base for any products where stock quantity is less than 10"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-airtable \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AIRTABLE-API-KEY: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_bases","arguments":{}}}'
```

## License

MIT
