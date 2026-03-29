# mcp-newrelic — New Relic MCP Server

> Query APM metrics, run NRQL, manage dashboards, inspect alert incidents, and list infrastructure entities — all from any AI agent via the New Relic GraphQL API.

New Relic is a leading observability platform used by engineering and SRE teams worldwide to monitor applications, infrastructure, and user experience. This MCP server gives your agents full access to New Relic's NerdGraph GraphQL API: searching and inspecting entities, running arbitrary NRQL queries, using pre-built APM/infra metric shortcuts, managing dashboards, and inspecting alert policies and open incidents.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-newrelic`

---

## What You Can Do

- Run any NRQL query against your New Relic account for custom monitoring, alerting threshold analysis, or data extraction
- Get response time, throughput, and error rate for any APM application without writing NRQL
- Inspect CPU and memory usage for infrastructure hosts instantly
- List open incidents and alert policies to triage production issues
- Create, list, and delete dashboards programmatically

## Available Tools

| Tool | Description |
|------|-------------|
| `list_entities` | List entities by type: HOST, APPLICATION, BROWSER, MOBILE, MONITOR, DASHBOARD |
| `get_entity` | Get full entity details by GUID including tags and alert severity |
| `search_entities` | Search all entities by name substring |
| `get_golden_metrics` | Get golden metrics (response time, throughput, error rate) for an entity |
| `get_entity_tags` | Get all tags on a New Relic entity |
| `run_nrql` | Execute an arbitrary NRQL query against a New Relic account |
| `run_nrql_timeseries` | Run NRQL with TIMESERIES appended — returns time-bucketed chart data |
| `query_apm_metrics` | Pre-built APM query: response time + throughput for a named application |
| `query_error_rate` | Pre-built error rate query for a named application |
| `query_infrastructure` | Pre-built infra query: CPU and memory for a named host |
| `list_dashboards` | List all dashboards with optional name filter |
| `get_dashboard` | Get a dashboard by GUID including pages and widget count |
| `create_dashboard` | Create a new empty dashboard (PUBLIC_READ_WRITE) |
| `delete_dashboard` | Delete a dashboard by GUID (irreversible) |
| `list_alert_policies` | List alert policies for an account |
| `get_alert_conditions` | Get NRQL alert conditions for a specific alert policy |
| `list_incidents` | List open/active/closed alert incidents for an account |
| `get_incident_details` | Get detailed information about a specific incident |
| `list_accounts` | List all New Relic accounts accessible by the API key |
| `get_current_user` | Get the authenticated user associated with the API key |
| `get_account_info` | Get details for a specific account by ID |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `NEW_RELIC_API_KEY` | Yes | New Relic User API Key | New Relic → Profile → API Keys → Create a key (type: **User**). Do **not** use the License key. |

> The API key must be a **User** key, not a License (Ingest) key. User keys have read/write access to NerdGraph. License keys are for data ingestion only and will return 401.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"New Relic"** and click **Add to Workspace**
3. Add your `NEW_RELIC_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can query New Relic observability data automatically.

### Example Prompts

```
"Show me the response time and throughput for the checkout-service over the last hour"
"List all open alert incidents in account 1234567"
"Run a NRQL query to find the top 5 slowest database operations in the last 30 minutes"
"What's the error rate for payment-api over the past 24 hours?"
"Create a new New Relic dashboard called 'Platform Health'"
```

### Direct API Call

```bash
# Get current user (ping / auth check)
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-newrelic \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-NEW-RELIC-API-KEY: your-user-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_current_user","arguments":{}}}'

# Run a NRQL query
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-newrelic \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-NEW-RELIC-API-KEY: your-user-api-key' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"run_nrql","arguments":{"account_id":1234567,"nrql":"SELECT count(*) FROM Transaction SINCE 1 hour ago"}}}'

# Get APM metrics without writing NRQL
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-newrelic \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-NEW-RELIC-API-KEY: your-user-api-key' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"query_apm_metrics","arguments":{"account_id":1234567,"app_name":"checkout-service","since":"30 minutes ago"}}}'
```

## Technical Notes

- **GraphQL only.** New Relic has no REST API for most operations. All 21 tools POST to `https://api.newrelic.com/graphql`.
- **Auth header is `API-Key`**, not `Authorization: Bearer`. This is a New Relic-specific convention.
- NRQL is New Relic Query Language — similar to SQL. See [NRQL docs](https://docs.newrelic.com/docs/nrql/get-started/introduction-nrql-new-relics-query-language/).
- Entity GUIDs are base64-encoded strings like `MTIzNDU2N3xBUE18QVBQTElDQVRJT058MTIzNDU2Nzg5`. Use `list_entities` or `search_entities` to discover them.
- Account IDs are integers, visible in your New Relic URL or via `list_accounts`.

## License

MIT
