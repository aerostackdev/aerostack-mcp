# mcp-turso — Turso (LibSQL) MCP Server

> Execute SQL queries, manage tables, and interact with your Turso edge database from your AI agents.

Turso is the edge-native SQLite-compatible distributed database by ChiselStrike — designed for low-latency reads at the edge with embedded replicas and branching. This MCP server gives your AI agents direct read/write access to your Turso database: executing SQL, querying and mutating rows, describing schemas, and running batch transactions — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-turso`

---

## What You Can Do

- Execute arbitrary SQL statements against your Turso database for full control over reads and writes
- Run batch transactions to perform multiple operations atomically
- Inspect your schema by listing tables and describing column definitions
- Query tables with structured parameters (columns, filters, ordering, limits) without writing raw SQL
- Insert, update, and delete rows using simple structured inputs with parameterized queries

## Available Tools

| Tool | Description |
|------|-------------|
| `execute` | Execute a single SQL statement with optional parameterized args |
| `batch` | Execute multiple SQL statements in a batch/transaction |
| `list_tables` | List all user tables in the database |
| `describe_table` | Get column info (name, type, nullable, primary key) for a table |
| `query` | Shorthand SELECT with table, columns, where, order_by, limit |
| `insert` | Insert one or more rows into a table |
| `update` | Update rows matching a WHERE condition |
| `delete_rows` | Delete rows matching a WHERE condition |
| `count` | Count rows in a table with optional WHERE filter |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `TURSO_DATABASE_URL` | Yes | Your Turso database HTTP URL | [turso.tech/app](https://turso.tech/app) → Select database → copy **HTTP URL** (e.g. `https://mydb-myorg.turso.io`) |
| `TURSO_AUTH_TOKEN` | Yes | Turso database auth token | Run `turso db tokens create <db-name>` in the Turso CLI, or generate in the dashboard under **Database → Settings** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Turso"** and click **Add to Workspace**
3. Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call Turso tools automatically — no per-user setup needed.

### Example Prompts

```
"List all tables in my Turso database and describe their columns"
"Select all rows from the users table where role is admin, ordered by created_at descending"
"Insert a new row into the events table with name: signup and user_id: 42"
"Count how many orders have status pending"
"Run a batch: create a products table, then insert 3 sample rows"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-turso \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TURSO-DATABASE-URL: https://mydb-myorg.turso.io' \
  -H 'X-Mcp-Secret-TURSO-AUTH-TOKEN: your-auth-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_tables","arguments":{}}}'
```

## License

MIT
