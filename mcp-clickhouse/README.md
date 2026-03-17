# mcp-clickhouse — ClickHouse MCP Server

> Execute SQL queries, explore schemas, and analyze data in your ClickHouse database from your AI agents.

ClickHouse is the fastest open-source columnar database for real-time analytics — used by teams processing billions of rows for dashboards, observability, and data pipelines. This MCP server gives your AI agents direct access to your ClickHouse instance: running arbitrary SQL, exploring database schemas, inserting data, and monitoring system health — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-clickhouse`

---

## What You Can Do

- Run any SQL query against your ClickHouse database and get structured JSON results
- Explore database schemas — list databases, tables, and describe column types
- Insert rows into tables as part of data pipeline or automation workflows
- Monitor your ClickHouse instance with system metrics and table size reports
- Count rows with optional WHERE filters for quick data validation

## Available Tools

| Tool | Description |
|------|-------------|
| `query` | Execute any SQL query (SELECT, SHOW, DESCRIBE, etc.) |
| `list_databases` | List all databases in the ClickHouse instance |
| `list_tables` | List all tables in a specific database |
| `describe_table` | Show columns, types, and defaults for a table |
| `insert` | Insert rows into a table using VALUES syntax |
| `count` | Count rows in a table with optional WHERE filter |
| `show_create` | Show the CREATE TABLE statement for a table |
| `system_metrics` | Retrieve current ClickHouse system metrics |
| `table_sizes` | Show table sizes (rows, compressed/uncompressed) from system.parts |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `CLICKHOUSE_URL` | Yes | Your ClickHouse HTTP endpoint | Self-hosted: `http://localhost:8123`. ClickHouse Cloud: `https://xxx.clickhouse.cloud:8443` from your cloud console |
| `CLICKHOUSE_USER` | Yes | ClickHouse username | Default is `default` for self-hosted. ClickHouse Cloud: check your cloud console credentials |
| `CLICKHOUSE_PASSWORD` | Yes | ClickHouse password | Set during installation or from your ClickHouse Cloud console |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"ClickHouse"** and click **Add to Workspace**
3. Add `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, and `CLICKHOUSE_PASSWORD` under **Project → Secrets**

Once added, every AI agent in your workspace can call ClickHouse tools automatically — no per-user setup needed.

### Example Prompts

```
"List all databases and tables in my ClickHouse instance"
"Show me the top 10 largest tables by compressed size"
"Run SELECT count() FROM analytics.events WHERE event_date = today()"
"Describe the schema of the default.users table"
"Show me current ClickHouse system metrics"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-clickhouse \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CLICKHOUSE-URL: https://xxx.clickhouse.cloud:8443' \
  -H 'X-Mcp-Secret-CLICKHOUSE-USER: default' \
  -H 'X-Mcp-Secret-CLICKHOUSE-PASSWORD: your-password' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_databases","arguments":{}}}'
```

## License

MIT
