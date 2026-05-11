# mcp-braze — Braze MCP Server

> Orchestrate enterprise customer engagement with Braze — track users, send messages, manage campaigns, and analyze segments from AI.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-braze`

---

## What You Can Do

This MCP server gives AI agents access to Braze via 16 tools. Connect it to any Aerostack workspace and your agents can interact with Braze directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `track_users` | Track user attributes, events, and purchases in Braze |
| `get_user_profile` | Export user profiles by external IDs |
| `delete_user` | Delete user profiles from Braze |
| `send_message` | Send a message to users via email, push, or SMS |
| `create_campaign` | Trigger a campaign send to recipients |
| `list_campaigns` | List all campaigns |
| `get_campaign` | Get details for a specific campaign |
| `list_segments` | List all audience segments |
| `get_segment_details` | Get details for a specific segment |
| `create_email_template` | Create a new email template |
| `list_email_templates` | List all email templates |
| `track_event` | Track a specific event for a user |
| `list_subscription_groups` | Get subscription group statuses for a user |
| `update_subscription_status` | Update subscription group status for a user |
| `send_transactional_email` | Send a transactional email via a campaign |
| `get_app_group_info` | Get app group info including timezone and currency |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `BRAZE_API_KEY` | Yes | Your BRAZE API KEY from the service's developer settings |
| `BRAZE_INSTANCE_URL` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Braze"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `BRAZE_API_KEY`
- `BRAZE_INSTANCE_URL`

Once added, every AI agent in your workspace can use Braze tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-braze \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-BRAZE-API-KEY: your-braze-api-key' \
  -H 'X-Mcp-Secret-BRAZE-INSTANCE-URL: your-braze-instance-url' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"track_users","arguments":{}}}'
```

## License

MIT
