# mcp-freshservice — Freshservice MCP Server

> Full Freshservice integration — manage IT tickets, assets, agents, departments, requesters, and service desk workflows.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-freshservice`

---

## What You Can Do

This MCP server gives AI agents access to Freshservice via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Freshservice directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_tickets` | List tickets with pagination. |
| `get_ticket` | Get full ticket details by ID. |
| `create_ticket` | Create a new service ticket. |
| `update_ticket` | Update ticket fields: status, priority, agent, or group. |
| `delete_ticket` | Permanently delete a ticket. |
| `list_ticket_conversations` | List all conversations (notes and replies) on a ticket. |
| `reply_to_ticket` | Send a reply to a ticket. |
| `list_assets` | List IT assets with pagination. |
| `get_asset` | Get asset details by ID. |
| `list_agents` | List all agents in the account. |
| `get_agent` | Get agent details by ID. |
| `list_departments` | List all departments in the organization. |
| `list_requesters` | List requesters (end users) with pagination. |
| `get_ticket_activities` | Get all activity log entries for a ticket. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `FRESHSERVICE_API_KEY` | Yes | Your Freshservice API key — found in Profile Settings → API Key |
| `FRESHSERVICE_DOMAIN` | Yes | Your Freshservice subdomain (e.g. 'mycompany' for mycompany.freshservice.com) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Freshservice"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `FRESHSERVICE_API_KEY`
- `FRESHSERVICE_DOMAIN`

Once added, every AI agent in your workspace can use Freshservice tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-freshservice \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FRESHSERVICE-API-KEY: your-freshservice-api-key' \
  -H 'X-Mcp-Secret-FRESHSERVICE-DOMAIN: your-freshservice-domain' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_tickets","arguments":{}}}'
```

## License

MIT
