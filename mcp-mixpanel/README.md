# mcp-mixpanel — Mixpanel MCP Server

> Track events, set user properties, and query insights reports and funnels from your AI agents.

Mixpanel is the product analytics platform built for understanding user behavior in depth. This MCP server lets your AI agents send events into Mixpanel, enrich user profiles with properties, and pull insights reports and funnel analysis on demand — turning your analytics data into live input for agent reasoning and reporting workflows.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-mixpanel`

---

## What You Can Do

- Track backend events into Mixpanel from server-side workflows without touching your frontend tracking code
- Query insights reports for any event over any date range — ask "how many users completed onboarding this week?"
- Get funnel conversion data by funnel ID to measure drop-off between key steps
- Look up individual user profiles to understand behavior history before taking automated actions

## Available Tools

| Tool | Description |
|------|-------------|
| `track_event` | Track a custom event for a user |
| `set_user_properties` | Set user profile properties ($email, $name, custom fields) |
| `increment_property` | Increment a numeric user property |
| `get_user_profile` | Get a user's profile and all their stored properties |
| `get_insights_report` | Get an insights analytics report for an event over a date range |
| `get_funnel` | Get funnel conversion data by funnel ID |
| `export_events` | Export raw events (up to first 100) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `MIXPANEL_TOKEN` | Yes | Project token for event ingestion | [mixpanel.com](https://mixpanel.com) → Your Project → **Settings** → **Project Details** → copy **Project Token** |
| `MIXPANEL_SERVICE_ACCOUNT_USERNAME` | Yes | Service account username for query API | [mixpanel.com](https://mixpanel.com) → **Organization Settings** → **Service Accounts** → Create service account → copy username |
| `MIXPANEL_SERVICE_ACCOUNT_SECRET` | Yes | Service account secret for query API | Same screen as above → copy secret (shown once) |
| `MIXPANEL_PROJECT_ID` | Yes | Numeric project ID for query API | [mixpanel.com](https://mixpanel.com) → Your Project → **Settings** → **Project Details** → copy **Project ID** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Mixpanel"** and click **Add to Workspace**
3. Add all four secrets under **Project → Secrets**

Once added, every AI agent in your workspace can call Mixpanel tools automatically — no per-user setup needed.

### Example Prompts

```
"How many users triggered the 'checkout_completed' event in the last 30 days?"
"Set the plan property to enterprise for user u_12345 in Mixpanel"
"Get the funnel report for funnel ID 98765 for this month"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-mixpanel \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MIXPANEL-TOKEN: your-project-token' \
  -H 'X-Mcp-Secret-MIXPANEL-SERVICE-ACCOUNT-USERNAME: your-sa-username' \
  -H 'X-Mcp-Secret-MIXPANEL-SERVICE-ACCOUNT-SECRET: your-sa-secret' \
  -H 'X-Mcp-Secret-MIXPANEL-PROJECT-ID: your-project-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_insights_report","arguments":{"event":"page_view","from_date":"2024-01-01","to_date":"2024-01-31"}}}'
```

## License

MIT
