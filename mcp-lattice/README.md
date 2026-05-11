# mcp-lattice — Lattice MCP Server

> People management via Lattice — manage goals, 1:1s, reviews, and employee feedback.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-lattice`

---

## What You Can Do

This MCP server gives AI agents access to Lattice via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Lattice directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_users` | List all users in the Lattice organization. |
| `get_user` | Get user profile details by user ID from Lattice. |
| `list_goals` | List goals in Lattice with pagination. |
| `get_goal` | Get detailed information about a specific goal by ID. |
| `create_goal` | Create a new goal in Lattice. |
| `update_goal` | Update an existing goal in Lattice. Provide only the fields to change. |
| `list_review_cycles` | List performance review cycles in Lattice. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `LATTICE_API_KEY` | Yes | Your LATTICE API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Lattice"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `LATTICE_API_KEY`

Once added, every AI agent in your workspace can use Lattice tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-lattice \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LATTICE-API-KEY: your-lattice-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_users","arguments":{}}}'
```

## License

MIT
