# mcp-google-analytics — Google Analytics 4 MCP Server

> Run reports, query real-time data, list dimensions and metrics from Google Analytics 4 — AI-native web analytics access.

Give your AI agents full access to Google Analytics 4. Run standard reports with dimensions, metrics, date ranges, and filters. Query real-time active users, discover available dimensions/metrics, analyze funnels, and create pivot tables — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-google-analytics`

---

## What You Can Do

- Run standard GA4 reports with any combination of dimensions and metrics
- Query real-time data — active users, pages, countries right now
- Discover all available dimensions and metrics for your property (including custom ones)
- Analyze user funnels with drop-off rates across conversion steps
- Create pivot reports for cross-tabulated analytics breakdowns
- Filter, sort, and paginate report results

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify GA4 connectivity by fetching property metadata |
| `run_report` | Run a standard report with dimensions, metrics, date ranges, filters, and ordering |
| `get_realtime_report` | Get real-time data — active users, pages, countries from the last 30 minutes |
| `get_metadata` | List all available dimensions and metrics for the property (with optional text filter) |
| `run_funnel_report` | Analyze user drop-off across a sequence of funnel steps |
| `run_pivot_report` | Create a cross-tabulation pivot table of dimensions and metrics |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Yes | Full JSON key file content for a GCP service account with Analytics access | console.cloud.google.com → IAM & Admin → Service Accounts → Create → Keys → Add Key → JSON |
| `GA4_PROPERTY_ID` | Yes | GA4 property ID (numeric, e.g. "123456789") | analytics.google.com → Admin → Property Settings → Property ID |

> **Required roles:** Add the service account email as a **Viewer** on the GA4 property: analytics.google.com → Admin → Property Access Management → Add User.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Google Analytics"** and click **Add to Workspace**
3. Add `GOOGLE_SERVICE_ACCOUNT_JSON` (paste the full JSON) and `GA4_PROPERTY_ID` under **Project → Secrets**

### Example Prompts

```
"How many active users did my site get in the last 7 days?"
"Show me the top 10 pages by pageviews this month"
"What countries are my users coming from? Break down by device category"
"How many users are on my site right now? Show by page"
"What dimensions and metrics are available for my property?"
"Show me a funnel from page_view → add_to_cart → purchase for the last 30 days"
"Create a pivot report of sessions by country and device category"
"Compare organic vs paid traffic sources for the last 14 days"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-google-analytics \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GOOGLE-SERVICE-ACCOUNT-JSON: {"type":"service_account",...}' \
  -H 'X-Mcp-Secret-GA4-PROPERTY-ID: 123456789' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"run_report","arguments":{"metrics":["activeUsers","sessions"],"dimensions":["date"],"start_date":"7daysAgo","end_date":"today"}}}'
```

## Security Notes

- Service account credentials are injected at the Aerostack gateway layer — never stored in the worker
- Uses `analytics.readonly` OAuth scope — this MCP cannot modify your GA4 configuration
- Report results are limited to 10,000 rows maximum per call
- Real-time reports cover the last 30 minutes of activity only

## License

MIT
