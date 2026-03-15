# mcp-planetscale — PlanetScale MCP Server

> Manage MySQL databases, branches, and deploy requests on PlanetScale from your AI agents.

PlanetScale is the serverless MySQL platform built for scale, with Git-style branching for schema changes. This MCP server exposes PlanetScale's management API — letting your AI agents list databases, inspect branches, create feature branches for schema work, and manage deploy requests to promote changes to production safely.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-planetscale`

---

## What You Can Do

- List all databases in your PlanetScale organization and inspect branch status without using the PlanetScale dashboard
- Create feature branches for schema changes as part of a database migration workflow
- List and create deploy requests to promote schema changes through the safe deploy pipeline
- Monitor branch state to confirm migrations have completed before triggering downstream steps

## Available Tools

| Tool | Description |
|------|-------------|
| `list_databases` | List all databases in an organization |
| `get_database` | Get details of a specific database |
| `list_branches` | List branches of a database |
| `get_branch` | Get details of a specific branch |
| `create_branch` | Create a new branch from a parent branch |
| `list_deploy_requests` | List deploy requests for a database |
| `create_deploy_request` | Create a deploy request to merge schema changes |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `PLANETSCALE_TOKEN` | Yes | PlanetScale service token in `{id}:{token}` format | [app.planetscale.com](https://app.planetscale.com) → Your Organization → **Settings** → **Service tokens** → **New service token** → grant database access permissions → copy both the token ID and token value, format as `id:token` |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"PlanetScale"** and click **Add to Workspace**
3. Add your `PLANETSCALE_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call PlanetScale tools automatically — no per-user setup needed.

### Example Prompts

```
"List all databases in my PlanetScale organization and show their branch counts"
"Create a new branch called add-user-preferences from the main branch of my app-db database"
"Show me all open deploy requests for the app-db database"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-planetscale \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PLANETSCALE-TOKEN: your-token-id:your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_databases","arguments":{"org":"my-org"}}}'
```

## License

MIT
