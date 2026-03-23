# Datadog Observability MCP

> Official proxy MCP — Dashboards, monitors, logs, metrics, incidents, SLOs, APM traces via Datadog's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-datadog`

---

## Overview

Datadog Observability is a proxy MCP server that forwards requests directly to the official Datadog MCP endpoint at `https://mcp.datadoghq.com/api/unstable/mcp-server/mcp`. All tools are maintained by Datadog — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Datadog)
**Auth:** API Key + Application Key via `DD_API_KEY` and `DD_APP_KEY`

> **Regional endpoints:** EU: `mcp.datadoghq.eu`, US3: `mcp.us3.datadoghq.com`, US5: `mcp.us5.datadoghq.com`, AP1: `mcp.ap1.datadoghq.com`, GovCloud: `mcp.ddog-gov.com`

## Available Tools

- **list_dashboards** — List all Datadog dashboards with title, description, author, and layout type
- **get_dashboard** — Retrieve a specific dashboard by ID with all widgets and configuration
- **search_logs** — Search and filter log entries by query, time range, and facets
- **list_monitors** — List all monitors with name, type, status, and alert conditions
- **query_metrics** — Query metric timeseries data with aggregation, grouping, and formulas

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `DD_API_KEY` | Yes | Datadog API Key | app.datadoghq.com → Organization Settings → API Keys → New Key |
| `DD_APP_KEY` | Yes | Datadog Application Key | app.datadoghq.com → Organization Settings → Application Keys → New Key |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Datadog Observability"**
3. Enter your `DD_API_KEY` and `DD_APP_KEY` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can query Datadog tools automatically.

## Usage

### Example Prompts

```
"Show me all dashboards tagged with 'production'"
"Search logs for errors in the web service from the last hour"
"List all monitors that are currently alerting"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-datadog \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DD-API-KEY: your-api-key' \
  -H 'X-Mcp-Secret-DD-APP-KEY: your-app-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_logs","arguments":{"query":"service:web status:error"}}}'
```

## License

MIT
