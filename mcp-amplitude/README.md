# mcp-amplitude — Amplitude MCP Server

> Track events, analyze funnels, and query user cohorts from your AI agents.

Amplitude is the product analytics platform used by thousands of teams to understand user behavior, measure retention, and run growth experiments. This MCP server lets your AI agents send events directly into Amplitude and query charts, funnels, and cohort data — turning your analytics platform into a live data source for agent reasoning.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-amplitude`

---

## What You Can Do

- Track product events and user properties from automated workflows without touching your frontend tracking code
- Pull funnel conversion data for any event sequence and any date range — ask "what's our signup-to-activation conversion this week?"
- Fetch cohort membership to target specific user groups in downstream actions (emails, notifications, etc.)
- Analyze daily/weekly event trends via segmentation charts to drive agent-generated product reports

## Available Tools

| Tool | Description |
|------|-------------|
| `track_event` | Track a custom event in Amplitude for a specific user |
| `identify_user` | Identify a user and set their properties in Amplitude |
| `get_user_activity` | Get recent event activity for a specific user |
| `list_cohorts` | List all cohorts defined in the Amplitude project |
| `get_cohort_members` | Get member user IDs for a specific cohort |
| `get_chart_data` | Get event segmentation chart data for an event and date range |
| `get_funnel_data` | Get funnel conversion data for a sequence of events |
| `export_events` | Initiate a raw event export from Amplitude for a date range |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `AMPLITUDE_API_KEY` | Yes | Project API key (used for event ingestion) | [app.amplitude.com](https://app.amplitude.com) → Your Project → **Settings** → **General** → copy **API Key** |
| `AMPLITUDE_SECRET_KEY` | Yes | Secret key (used for query API authentication) | Same page as API Key → copy **Secret Key** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Amplitude"** and click **Add to Workspace**
3. Add `AMPLITUDE_API_KEY` and `AMPLITUDE_SECRET_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Amplitude tools automatically — no per-user setup needed.

### Example Prompts

```
"What's our signup-to-purchase funnel conversion for the last 30 days?"
"Track a 'plan_upgraded' event for user u_98765 with property plan: enterprise"
"Show me daily active users for the 'dashboard_viewed' event this week"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-amplitude \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AMPLITUDE-API-KEY: your-api-key' \
  -H 'X-Mcp-Secret-AMPLITUDE-SECRET-KEY: your-secret-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_cohorts","arguments":{}}}'
```

## License

MIT
