# mcp-snowflake — Snowflake Data Warehouse MCP Server

> Run SQL queries, list databases, schemas, tables, and inspect column definitions on Snowflake — AI-native cloud data warehouse access.

Give your AI agents full access to Snowflake. Execute SQL with CTEs, window functions, semi-structured data, and time travel. Browse databases, schemas, and tables, inspect column definitions, and manage virtual warehouses.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-snowflake`

---

## What You Can Do

- Run standard SQL queries with full Snowflake syntax
- List all databases, schemas, and tables
- Inspect table column definitions with types, nullable, defaults, and comments
- Browse virtual warehouses with size, state, and auto-suspend settings
- Auto-limit queries to prevent accidental full-table scans

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify Snowflake connectivity and version |
| `list_databases` | List all databases with owner and retention days |
| `list_schemas` | List schemas in a database |
| `list_tables` | List tables in a schema with row count, size, and cluster keys |
| `describe_table` | Get column definitions — name, type, nullable, default, comment |
| `query` | Execute SQL and return results (auto-adds LIMIT if missing) |
| `list_warehouses` | List virtual warehouses with size, state, auto-suspend |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `SNOWFLAKE_ACCOUNT` | Yes | Snowflake account identifier (e.g. "xy12345.us-east-1") | app.snowflake.com → Admin → Accounts → your account locator |
| `SNOWFLAKE_USERNAME` | Yes | Login username | Your Snowflake username (or create a service user) |
| `SNOWFLAKE_PASSWORD` | Yes | Login password | Your Snowflake password |
| `SNOWFLAKE_WAREHOUSE` | No | Virtual warehouse name (default: COMPUTE_WH) | SHOW WAREHOUSES in Snowflake |
| `SNOWFLAKE_DATABASE` | No | Default database for queries | SHOW DATABASES in Snowflake |

> **Best practice:** Create a dedicated service user with a role scoped to read-only access on specific databases.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Snowflake"** and click **Add to Workspace**
3. Add `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USERNAME`, `SNOWFLAKE_PASSWORD`, and optionally `SNOWFLAKE_WAREHOUSE` and `SNOWFLAKE_DATABASE` under **Project → Secrets**

### Example Prompts

```
"List all databases in my Snowflake account"
"Show me the tables in the ANALYTICS schema of the PROD database"
"Describe the columns of the EVENTS table"
"Run: SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) FROM events GROUP BY 1 ORDER BY 1 DESC LIMIT 30"
"What warehouses are running right now?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-snowflake \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SNOWFLAKE-ACCOUNT: xy12345.us-east-1' \
  -H 'X-Mcp-Secret-SNOWFLAKE-USERNAME: myuser' \
  -H 'X-Mcp-Secret-SNOWFLAKE-PASSWORD: mypassword' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_databases","arguments":{}}}'
```

## Security Notes

- Snowflake credentials are injected at the Aerostack gateway layer — never stored in the worker
- Query results are limited to 10,000 rows maximum per call
- LIMIT is auto-appended if not present in the SQL to prevent runaway queries
- Create a dedicated read-only role and service user for production use

## License

MIT
