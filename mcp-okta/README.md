# mcp-okta — Okta MCP Server

> Full Okta integration — manage users, groups, applications, and sessions for enterprise identity and access management.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-okta`

---

## What You Can Do

This MCP server gives AI agents access to Okta via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Okta directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_users` | List users in the Okta organization with optional search |
| `get_user` | Get details of a specific Okta user |
| `create_user` | Create a new Okta user |
| `update_user` | Update an Okta user profile |
| `deactivate_user` | Deactivate an Okta user |
| `activate_user` | Activate an Okta user |
| `list_groups` | List groups in the Okta organization |
| `get_group` | Get details of a specific Okta group |
| `create_group` | Create a new Okta group |
| `add_user_to_group` | Add a user to an Okta group |
| `remove_user_from_group` | Remove a user from an Okta group |
| `list_applications` | List applications in the Okta organization |
| `get_application` | Get details of a specific Okta application |
| `list_user_sessions` | List active sessions for a specific Okta user |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `OKTA_API_TOKEN` | Yes | Your Okta API token — create one in the Okta Admin Console under Security → API → Tokens |
| `OKTA_DOMAIN` | Yes | Your Okta domain (e.g. dev-12345.okta.com) — found in the top of your Okta Admin Console |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Okta"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `OKTA_API_TOKEN`
- `OKTA_DOMAIN`

Once added, every AI agent in your workspace can use Okta tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-okta \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-OKTA-API-TOKEN: your-okta-api-token' \
  -H 'X-Mcp-Secret-OKTA-DOMAIN: your-okta-domain' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_users","arguments":{}}}'
```

## License

MIT
