# Grafana Cloud Observability MCP

> Official proxy MCP — Dashboards, alerting, Loki logs, Tempo traces, Prometheus metrics via Grafana's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-grafana`

---

## Overview

Grafana Cloud Observability is a proxy MCP server that forwards requests directly to the official Grafana MCP endpoint at `https://mcp.grafana.com/mcp`. All tools are maintained by Grafana Labs — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Grafana Cloud)
**Auth:** Bearer token via `GRAFANA_API_TOKEN`

> **Self-hosted Grafana?** Use your instance-specific endpoint: `https://<stack-id>.grafana.net/api/mcp`

## Available Tools

- **list_dashboards** — List all dashboards with title, folder, tags, and URL for quick navigation
- **get_dashboard** — Retrieve a specific dashboard by UID with all panels, variables, and data sources
- **query_loki_logs** — Query logs from Loki using LogQL with label and line filters
- **list_alerts** — List all alerting rules with status, labels, and notification channels
- **query_prometheus** — Execute PromQL queries for metric analysis with time range support

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `GRAFANA_API_TOKEN` | Yes | Grafana Cloud API Token or Service Account Token | grafana.com → My Account → Access Policies → Create token |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Grafana Cloud Observability"**
3. Enter your `GRAFANA_API_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can query Grafana tools automatically.

## Usage

### Example Prompts

```
"Show me all dashboards tagged with 'kubernetes'"
"Query Loki for error logs from the payment service in the last hour"
"List all firing alerts and summarize what's broken"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-grafana \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GRAFANA-API-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_loki_logs","arguments":{"query":"{app=\"nginx\"} |= \"error\""}}}'
```

## License

MIT
