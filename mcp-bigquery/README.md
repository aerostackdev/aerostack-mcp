# mcp-bigquery — Google BigQuery MCP Server

> Run SQL queries, list datasets and tables, inspect schemas, and export results from Google BigQuery — AI-native data warehouse access.

Give your AI agents full access to Google BigQuery. Execute standard SQL with CTEs, joins, window functions. Browse datasets and tables, inspect column schemas, estimate query costs with dry runs, and track long-running jobs.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-bigquery`

---

## What You Can Do

- Run standard SQL queries with full BigQuery syntax
- List all datasets and tables in a GCP project
- Inspect table schemas with column types, modes, and descriptions
- Estimate query costs with dry run mode before executing
- Track long-running query jobs by ID
- Query views and materialized views

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify BigQuery connectivity by listing datasets |
| `list_datasets` | List all datasets with ID, location, and description |
| `list_tables` | List tables in a dataset with type, row count, and size |
| `get_table_schema` | Get full column schema — names, types, modes, nested fields |
| `query` | Execute SQL query and return results (supports dry_run for cost estimation) |
| `get_job` | Get status and stats of a BigQuery job by ID |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Yes | Full JSON key file content for a GCP service account with BigQuery access | console.cloud.google.com → IAM & Admin → Service Accounts → Create → Keys → Add Key → JSON |
| `GOOGLE_PROJECT_ID` | Yes | Google Cloud project ID (e.g. "my-project-123") | console.cloud.google.com → Dashboard → Project info → Project ID |

> **Required roles:** `BigQuery Data Viewer` + `BigQuery Job User` for read-only. Add `BigQuery Data Editor` for write operations.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"BigQuery"** and click **Add to Workspace**
3. Add `GOOGLE_SERVICE_ACCOUNT_JSON` (paste the full JSON) and `GOOGLE_PROJECT_ID` under **Project → Secrets**

### Example Prompts

```
"List all datasets in my BigQuery project"
"Show me the schema of the events table in the analytics dataset"
"Run: SELECT user_id, COUNT(*) as count FROM analytics.events GROUP BY 1 ORDER BY 2 DESC LIMIT 20"
"How much would it cost to query the full orders table? Do a dry run first."
"Show me yesterday's top 10 products by revenue from the sales dataset"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-bigquery \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GOOGLE-SERVICE-ACCOUNT-JSON: {"type":"service_account",...}' \
  -H 'X-Mcp-Secret-GOOGLE-PROJECT-ID: my-project-123' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query","arguments":{"sql":"SELECT 1 AS test"}}}'
```

## Security Notes

- Service account credentials are injected at the Aerostack gateway layer — never stored in the worker
- Query results are limited to 10,000 rows maximum per call
- Use dry_run mode to estimate costs before executing expensive queries
- BigQuery charges $6.25 per TB scanned — always use LIMIT and filter by partitioned columns

## License

MIT
