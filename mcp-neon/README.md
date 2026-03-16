# mcp-neon — Neon PostgreSQL MCP Server

> Query and write to your Neon serverless PostgreSQL database from any AI agent.

Neon is a serverless Postgres platform with branching, autoscaling, and a native HTTP SQL API. This MCP server gives your AI agents direct read/write access to your Neon database: selecting rows, inserting records, updating data, deleting rows, and running raw parameterized SQL — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-neon`

---

## What You Can Do

- Query any table with filters, ordering, and pagination
- Insert one or multiple rows in a single call
- Update rows matching any SQL condition
- Delete rows safely (WHERE clause always required)
- Run raw parameterized SQL for complex queries
- Introspect your schema — list tables and their columns

## Available Tools

| Tool | Description |
|------|-------------|
| `list_tables` | List all tables with column names and types |
| `select` | Query rows with optional WHERE, ORDER BY, LIMIT |
| `insert` | Insert one or more rows, returns inserted records |
| `update` | Update rows matching a WHERE condition |
| `delete` | Delete rows matching a WHERE condition |
| `run_sql` | Execute any parameterized SQL query |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string | [console.neon.tech](https://console.neon.tech) → Your Project → **Connection Details** → copy **Connection string** |

Connection string format: `postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Neon"** and click **Add to Workspace**
3. Add `DATABASE_URL` under **Project → Secrets**

Once added, every AI agent in your workspace can query your Neon database automatically.

### Example Prompts

```
"List all tables in my database and describe their columns"
"Select the last 10 customers who signed up, ordered by created_at"
"Insert a new support ticket for customer_id 42 with subject 'Login issue'"
"Update the status to closed for all tickets older than 30 days"
"How many active users do I have?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-neon \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DATABASE-URL: postgresql://user:pass@ep-xxx.neon.tech/dbname' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_tables","arguments":{}}}'
```

## Security Notes

- `DATABASE_URL` is injected at the Aerostack gateway layer — never stored in this worker's code
- `update` and `delete` tools always require a `where` clause — full-table mutations are blocked
- `run_sql` supports parameterized queries (`$1`, `$2`, ...) — use params array to prevent SQL injection

## License

MIT
