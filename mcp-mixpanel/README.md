# mcp-mixpanel

MCP server for [Mixpanel](https://mixpanel.com) — track events, set user properties, get insights reports, funnels, and raw event exports.

## Tools (7)

| Tool | Description |
|------|-------------|
| `track_event` | Track a custom event for a user |
| `set_user_properties` | Set user profile properties ($email, $name, etc.) |
| `increment_property` | Increment a numeric user property |
| `get_user_profile` | Get a user's profile and properties |
| `get_insights_report` | Get an insights analytics report for an event over a date range |
| `get_funnel` | Get funnel conversion data by funnel ID |
| `export_events` | Export raw events (up to first 100) |

## Required Secrets

| Secret Header | Description |
|---------------|-------------|
| `X-Mcp-Secret-MIXPANEL-TOKEN` | Project token (for event ingestion) |
| `X-Mcp-Secret-MIXPANEL-SERVICE-ACCOUNT-USERNAME` | Service account username (for query API) |
| `X-Mcp-Secret-MIXPANEL-SERVICE-ACCOUNT-SECRET` | Service account secret (for query API) |
| `X-Mcp-Secret-MIXPANEL-PROJECT-ID` | Project ID (for query API) |

## Auth

- Event ingestion (`/track`, `/engage`): uses project token in request body
- Query API: uses HTTP Basic auth with service account credentials

## Deploy

```bash
cd MCP/mcp-mixpanel
npm install
wrangler deploy
```
