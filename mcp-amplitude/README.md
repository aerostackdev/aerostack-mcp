# mcp-amplitude

MCP server for [Amplitude](https://amplitude.com) — track events, identify users, get chart data, funnel analysis, and cohort management.

## Tools (8)

| Tool | Description |
|------|-------------|
| `track_event` | Track a custom event for a user |
| `identify_user` | Set user properties via the identify API |
| `get_user_activity` | Get recent event activity for a user |
| `list_cohorts` | List all cohorts in the project |
| `get_cohort_members` | Get member IDs for a specific cohort |
| `get_chart_data` | Get event segmentation chart data |
| `get_funnel_data` | Get funnel conversion data |
| `export_events` | Initiate a raw event export |

## Required Secrets

| Secret Header | Description |
|---------------|-------------|
| `X-Mcp-Secret-AMPLITUDE-API-KEY` | API key (used for ingestion + basic auth username) |
| `X-Mcp-Secret-AMPLITUDE-SECRET-KEY` | Secret key (basic auth password for query API) |

## Auth

- Event ingestion: API key in JSON body
- Identify API: API key as form field + base64-encoded identification
- Query API (chart, funnels, cohorts): HTTP Basic auth (API key:Secret key)

## Deploy

```bash
cd MCP/mcp-amplitude
npm install
wrangler deploy
```
