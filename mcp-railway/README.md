# mcp-railway — Railway MCP Server

> Manage Railway projects, services, deployments, and logs from your AI agents.

Railway is the developer-friendly cloud platform for deploying backends, databases, and services with zero infrastructure configuration. This MCP server connects your AI agents to the Railway API — letting them inspect projects, check deployment health, stream logs, review environment variables, and trigger redeploys, all from natural language without opening the Railway dashboard.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-railway`

---

## What You Can Do

- Check deployment status across all Railway services to quickly identify what's failing or outdated
- Stream deployment logs to diagnose production issues without leaving your chat interface
- Trigger redeploys for any service in any environment to roll out a fix or restart a crashed container
- Inspect environment variables for a service to verify configuration without granting dashboard access

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all Railway projects for the authenticated user |
| `get_project` | Get project details including environments and services |
| `list_services` | List services in a Railway project |
| `list_deployments` | List recent deployments for a service (last 10) |
| `get_deployment_logs` | Get logs for a specific deployment |
| `list_variables` | List environment variables for a service in an environment |
| `redeploy_service` | Trigger a redeploy of a service in an environment |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `RAILWAY_API_TOKEN` | Yes | Railway API token for GraphQL API authentication | [railway.com/account/tokens](https://railway.com/account/tokens) → **Create Token** → give it a name → copy the token |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Railway"** and click **Add to Workspace**
3. Add your `RAILWAY_API_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call Railway tools automatically — no per-user setup needed.

### Example Prompts

```
"List all my Railway projects and show the status of the most recent deployment for each"
"Get the last 100 log lines for the api-service deployment that failed 20 minutes ago"
"Redeploy the worker service in the production environment on the my-app project"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-railway \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-RAILWAY-API-TOKEN: your-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

## License

MIT
