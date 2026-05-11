# mcp-auth0 — Auth0 MCP Server

> Full Auth0 Management API integration — manage users, connections, applications, roles, and logs for authentication and identity management.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-auth0`

---

## What You Can Do

This MCP server gives AI agents access to Auth0 via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Auth0 directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_users` | List users in the Auth0 tenant |
| `get_user` | Get details of a specific Auth0 user |
| `create_user` | Create a new Auth0 user |
| `update_user` | Update an Auth0 user |
| `delete_user` | Delete an Auth0 user |
| `list_connections` | List all connections in the Auth0 tenant |
| `get_connection` | Get details of a specific Auth0 connection |
| `list_applications` | List applications (clients) in the Auth0 tenant |
| `get_application` | Get details of a specific Auth0 application (client) |
| `list_roles` | List roles in the Auth0 tenant |
| `get_role` | Get details of a specific Auth0 role |
| `assign_role_to_user` | Assign a role to an Auth0 user |
| `get_user_roles` | Get roles assigned to an Auth0 user |
| `list_logs` | List recent Auth0 tenant logs |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH0_MANAGEMENT_TOKEN` | Yes | Your Auth0 Management API token — create one in the Auth0 Dashboard under Applications → APIs → Auth0 Management API → Test |
| `AUTH0_DOMAIN` | Yes | Your Auth0 domain (e.g. myapp.auth0.com) — found in the Auth0 Dashboard settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Auth0"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `AUTH0_MANAGEMENT_TOKEN`
- `AUTH0_DOMAIN`

Once added, every AI agent in your workspace can use Auth0 tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-auth0 \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AUTH0-MANAGEMENT-TOKEN: your-auth0-management-token' \
  -H 'X-Mcp-Secret-AUTH0-DOMAIN: your-auth0-domain' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_users","arguments":{}}}'
```

## License

MIT
