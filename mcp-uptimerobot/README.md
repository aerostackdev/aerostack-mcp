# mcp-uptimerobot — Uptimerobot MCP Server

> Full UptimeRobot integration — manage monitors, alert contacts, and public status pages for website uptime monitoring.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-uptimerobot`

---

## What You Can Do

This MCP server gives AI agents access to Uptimerobot via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Uptimerobot directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_account_details` | Get UptimeRobot account details including plan and limits |
| `list_monitors` | List all monitors in the UptimeRobot account |
| `get_monitor` | Get details of a specific UptimeRobot monitor including logs |
| `create_monitor` | Create a new UptimeRobot monitor |
| `update_monitor` | Update an existing UptimeRobot monitor |
| `delete_monitor` | Delete a UptimeRobot monitor |
| `pause_monitor` | Pause a UptimeRobot monitor (set status to paused) |
| `resume_monitor` | Resume a paused UptimeRobot monitor |
| `list_alert_contacts` | List all alert contacts configured in UptimeRobot |
| `create_alert_contact` | Create a new alert contact in UptimeRobot |
| `delete_alert_contact` | Delete an alert contact from UptimeRobot |
| `get_public_status_pages` | List all public status pages in UptimeRobot |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `UPTIMEROBOT_API_KEY` | Yes | Your UptimeRobot API key — found in My Settings → API Settings in your UptimeRobot dashboard |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Uptimerobot"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `UPTIMEROBOT_API_KEY`

Once added, every AI agent in your workspace can use Uptimerobot tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-uptimerobot \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-UPTIMEROBOT-API-KEY: your-uptimerobot-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_account_details","arguments":{}}}'
```

## License

MIT
