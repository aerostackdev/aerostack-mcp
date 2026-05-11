# mcp-instantly — Instantly MCP Server

> Automate cold email campaigns with Instantly.ai — manage campaigns, leads, verify emails, and track analytics from AI.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-instantly`

---

## What You Can Do

This MCP server gives AI agents access to Instantly via 16 tools. Connect it to any Aerostack workspace and your agents can interact with Instantly directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_campaigns` | List all Instantly campaigns |
| `create_campaign` | Create a new campaign in Instantly |
| `get_campaign` | Get a specific campaign by ID |
| `update_campaign_status` | Update the status of a campaign |
| `delete_campaign` | Delete a campaign |
| `list_leads` | List leads, optionally filtered by campaign |
| `add_leads` | Add leads to a campaign |
| `move_leads` | Move leads to a different campaign |
| `delete_lead` | Delete a lead by ID |
| `get_lead_status` | Get status details for a lead |
| `list_accounts` | List email sending accounts |
| `get_campaign_analytics` | Get analytics overview for a campaign |
| `list_email_accounts` | List all email accounts with status and warmup info |
| `verify_email` | Verify a single email address |
| `bulk_verify_emails` | Verify multiple email addresses at once |
| `get_account_status` | Get status details for a specific email account |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `INSTANTLY_API_KEY` | Yes | Your INSTANTLY API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Instantly"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `INSTANTLY_API_KEY`

Once added, every AI agent in your workspace can use Instantly tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-instantly \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-INSTANTLY-API-KEY: your-instantly-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_campaigns","arguments":{}}}'
```

## License

MIT
