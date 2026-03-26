# mcp-supabase — Supabase MCP Server

> Query your Supabase PostgreSQL database and manage storage buckets from your AI agents.

Supabase is the open-source Firebase alternative built on PostgreSQL — used by thousands of startups and teams as their primary application database. This MCP server gives your AI agents direct read/write access to your Supabase project: selecting, inserting, updating, and deleting rows, calling stored procedures, and listing files in storage buckets — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-supabase`

---

## What You Can Do

- Query any table in your Supabase database with filters to pull live app data into agent workflows
- Insert or update rows to write results back to your database as part of automation pipelines
- Call stored procedures (RPC functions) to execute complex business logic already defined in your database
- List files in Supabase storage buckets to audit assets or chain into file processing workflows

## Available Tools

| Tool | Description |
|------|-------------|
| `list_tables` | Introspect available tables and their columns |
| `select` | Run a SELECT query on a table with optional filters |
| `insert` | Insert one or more rows into a table |
| `update` | Update rows matching a filter condition |
| `delete` | Delete rows matching a filter condition |
| `rpc` | Call a Supabase database function (stored procedure) |
| `storage_list` | List files in a storage bucket |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL | [app.supabase.com](https://app.supabase.com) → Your Project → **Settings** → **API** → copy **Project URL** |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key | Same page → copy **anon public** key under **Project API keys** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Supabase"** and click **Add to Workspace**
3. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Supabase tools automatically — no per-user setup needed.

### Example Prompts

```
"List all tables in my Supabase database and describe their columns"
"Select all rows from the orders table where status is pending, ordered by created_at descending"
"Insert a new row into the notifications table with user_id 42 and message: Your report is ready"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-supabase \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SUPABASE-URL: https://yourproject.supabase.co' \
  -H 'X-Mcp-Secret-SUPABASE-ANON-KEY: your-anon-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_tables","arguments":{}}}'
```

## License

MIT
