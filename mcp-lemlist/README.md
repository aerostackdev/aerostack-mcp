# mcp-lemlist — Lemlist MCP Server

> Automate cold email outreach with Lemlist — manage campaigns, leads, sequences, and track engagement metrics from AI.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-lemlist`

---

## What You Can Do

This MCP server gives AI agents access to Lemlist via 16 tools. Connect it to any Aerostack workspace and your agents can interact with Lemlist directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_campaigns` | List all Lemlist campaigns |
| `get_campaign` | Get a specific campaign by ID |
| `create_campaign` | Create a new Lemlist campaign |
| `pause_campaign` | Pause a running campaign |
| `resume_campaign` | Resume a paused campaign |
| `export_campaign_results` | Export leads and stats from a campaign |
| `list_leads_in_campaign` | List leads in a campaign |
| `add_lead_to_campaign` | Add a lead to a campaign |
| `delete_lead_from_campaign` | Remove a lead from a campaign |
| `get_lead_activity` | Get activity history for a lead in a campaign |
| `list_all_leads` | List all leads across all campaigns |
| `get_lead` | Get a lead by email with campaign history |
| `unsubscribe_lead` | Unsubscribe a lead from all campaigns |
| `list_senders` | List all email senders in the account |
| `get_team` | Get team info including plan and credits |
| `get_campaign_stats` | Get statistics for a campaign |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `LEMLIST_API_KEY` | Yes | Your LEMLIST API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Lemlist"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `LEMLIST_API_KEY`

Once added, every AI agent in your workspace can use Lemlist tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-lemlist \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LEMLIST-API-KEY: your-lemlist-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_campaigns","arguments":{}}}'
```

## License

MIT
