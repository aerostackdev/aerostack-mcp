# mcp-mailerlite — Mailerlite MCP Server

> Manage email marketing with MailerLite — subscribers, groups, campaigns, automations, and custom fields from AI.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-mailerlite`

---

## What You Can Do

This MCP server gives AI agents access to Mailerlite via 18 tools. Connect it to any Aerostack workspace and your agents can interact with Mailerlite directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_subscribers` | List subscribers with optional status filter |
| `create_subscriber` | Create a new subscriber |
| `get_subscriber` | Get a subscriber by ID or email |
| `update_subscriber` | Update a subscriber |
| `delete_subscriber` | Delete a subscriber |
| `list_groups` | List all subscriber groups |
| `create_group` | Create a new subscriber group |
| `add_subscriber_to_group` | Add a subscriber to a group |
| `remove_subscriber_from_group` | Remove a subscriber from a group |
| `list_campaigns` | List campaigns with optional status filter |
| `get_campaign` | Get a campaign by ID |
| `create_campaign` | Create a new email campaign |
| `schedule_campaign` | Schedule a campaign for delivery |
| `get_campaign_stats` | Get subscriber activity stats for a campaign |
| `list_automations` | List all automations |
| `list_fields` | List all custom subscriber fields |
| `create_field` | Create a new custom subscriber field |
| `get_account_info` | Get account information |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MAILERLITE_API_KEY` | Yes | Your MAILERLITE API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Mailerlite"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `MAILERLITE_API_KEY`

Once added, every AI agent in your workspace can use Mailerlite tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-mailerlite \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MAILERLITE-API-KEY: your-mailerlite-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_subscribers","arguments":{}}}'
```

## License

MIT
