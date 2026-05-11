# mcp-clerk — Clerk MCP Server

> Clerk identity platform — manage users, organizations, bans, and invitations for your application.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-clerk`

---

## What You Can Do

This MCP server gives AI agents access to Clerk via 10 tools. Connect it to any Aerostack workspace and your agents can interact with Clerk directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_users` | List all users in your Clerk application. |
| `get_user` | Get full user details by ID including email, name, metadata, and OAuth connections. |
| `create_user` | Create a new user in Clerk. At least one email address or username is required. |
| `update_user` | Update user fields. Provide only the fields to change. |
| `delete_user` | Permanently delete a user. This action cannot be undone. |
| `ban_user` | Ban a user from the application. Banned users cannot sign in. |
| `unban_user` | Remove a ban from a user, restoring their ability to sign in. |
| `list_organizations` | List all organizations in your Clerk application. |
| `get_organization` | Get organization details by ID including name, slug, and membership count. |
| `create_invitation` | Create an email invitation to join the application. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `CLERK_SECRET_KEY` | Yes | Your Clerk secret key — starts with sk_test_ or sk_live_, found in Clerk Dashboard → API Keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Clerk"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `CLERK_SECRET_KEY`

Once added, every AI agent in your workspace can use Clerk tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-clerk \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CLERK-SECRET-KEY: your-clerk-secret-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_users","arguments":{}}}'
```

## License

MIT
