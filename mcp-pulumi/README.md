# mcp-pulumi — Pulumi MCP Server

> Manage Pulumi stacks, resources, organizations, webhooks, and policy packs from your AI agent.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-pulumi`

---

## What You Can Do

This MCP server gives AI agents access to Pulumi via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Pulumi directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_organizations` | List organizations for the current Pulumi user |
| `list_stacks` | List stacks for a user, optionally filtered by organization and project |
| `get_stack` | Get details of a specific Pulumi stack |
| `create_stack` | Create a new Pulumi stack |
| `delete_stack` | Delete a Pulumi stack |
| `list_stack_resources` | List resources in a Pulumi stack deployment |
| `get_stack_updates` | Get update history for a Pulumi stack |
| `list_webhooks` | List webhooks for an organization |
| `create_webhook` | Create a webhook for an organization |
| `delete_webhook` | Delete a webhook from an organization |
| `get_policy_packs` | Get policy packs for an organization |
| `list_access_tokens` | List access tokens for the current user |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `PULUMI_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Pulumi"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `PULUMI_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Pulumi tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-pulumi \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PULUMI-ACCESS-TOKEN: your-pulumi-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_organizations","arguments":{}}}'
```

## License

MIT
