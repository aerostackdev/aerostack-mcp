# mcp-render — Render MCP Server

> List services, trigger deploys, manage environment variables, and view logs on Render from any AI agent.

Render is a unified cloud platform for deploying web services, static sites, cron jobs, and background workers from Git. This MCP server connects your AI agents to the Render REST API — letting them list services, check deploy status, trigger new deploys, manage environment variables, inspect custom domains, and pull logs, all from natural language without opening the Render dashboard.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-render`

---

## What You Can Do

- List all Render services with type and status filters to get a quick overview of your infrastructure
- Trigger deploys and optionally clear the build cache for a fresh start
- Check deploy status and history to see what shipped and when
- Manage environment variables — list, set, or delete without touching the dashboard
- View custom domains and their verification status
- Pull deploy logs to diagnose build or runtime failures

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify Render API connectivity (internal health check) |
| `list_services` | List all services with optional type/status filter |
| `get_service` | Get full details of a specific service |
| `list_deploys` | List recent deploys for a service |
| `trigger_deploy` | Trigger a new deploy (with optional cache clear) |
| `get_deploy` | Get details of a specific deploy |
| `list_env_vars` | List all environment variables for a service |
| `set_env_var` | Create or update an environment variable |
| `delete_env_var` | Delete an environment variable |
| `list_custom_domains` | List custom domains attached to a service |
| `get_service_logs` | Retrieve deploy logs for a service |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `RENDER_API_KEY` | Yes | Render API key for REST API authentication | [dashboard.render.com/account/settings](https://dashboard.render.com/account/settings) → **API Keys** → **Create API Key** → copy the key |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Render"** and click **Add to Workspace**
3. Add your `RENDER_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can manage your Render services automatically — no per-user setup needed.

### Example Prompts

```
"List all my Render services and show which ones are currently live"
"Trigger a deploy for my API service and clear the build cache"
"Show me the last 5 deploys for service srv-abc123 — did any fail?"
"What environment variables are set on my worker service?"
"Get the deploy logs for the most recent failed deploy on my web app"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-render \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-RENDER-API-KEY: rnd_your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_services","arguments":{}}}'
```

## Security Notes

- `RENDER_API_KEY` is injected at the Aerostack gateway layer — never stored in this worker's code
- The API key grants full account access — use a scoped API key if Render supports it
- Environment variable values are returned in plaintext; be mindful of sensitive values in AI agent responses

## License

MIT
