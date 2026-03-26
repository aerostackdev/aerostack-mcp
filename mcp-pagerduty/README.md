# mcp-pagerduty — PagerDuty MCP Server

> Manage incidents, on-call schedules, and escalation policies in PagerDuty from your AI agents.

PagerDuty is the leading incident response platform for real-time operations. This MCP server lets your AI agents list and triage incidents, acknowledge or resolve alerts, check who's on-call, create new incidents, and inspect escalation policies — turning PagerDuty into a live operational data source for intelligent incident workflows.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-pagerduty`

---

## What You Can Do

- List open incidents and triage by status, urgency, or time range
- Acknowledge or resolve incidents directly from agent workflows without opening the PagerDuty UI
- Check who is currently on-call for any escalation policy before routing alerts
- Create new incidents on a service when your monitoring agent detects an issue

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify API token connectivity (internal) |
| `list_incidents` | List incidents with status, urgency, and date filters |
| `get_incident` | Get full details for an incident by ID |
| `acknowledge_incident` | Acknowledge one or more triggered incidents |
| `resolve_incident` | Resolve one or more incidents |
| `list_services` | List all services with optional name search |
| `list_oncalls` | List current on-call entries across escalation policies |
| `create_incident` | Create a new incident on a specified service |
| `list_escalation_policies` | List escalation policies with optional name search |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `PAGERDUTY_API_KEY` | Yes | REST API v2 token | [app.pagerduty.com](https://app.pagerduty.com) → **Integrations** → **API Access Keys** → **Create New API Key** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"PagerDuty"** and click **Add to Workspace**
3. Add your API key under **Project → Secrets**

Once added, every AI agent in your workspace can call PagerDuty tools automatically — no per-user setup needed.

### Example Prompts

```
"List all triggered and acknowledged incidents"
"Who is currently on-call for the backend escalation policy?"
"Acknowledge incident P1234ABC — I'm looking into it"
"Create a high-urgency incident on the payments service: Stripe webhook failures spiking"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-pagerduty \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PAGERDUTY-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_incidents","arguments":{"statuses":["triggered","acknowledged"]}}}'
```

## License

MIT
