# mcp-vercel -- Vercel MCP Server

Cloudflare Worker implementing the MCP (Model Context Protocol) for Vercel.
Manages projects, deployments, domains, and environment variables through the Vercel REST API.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all Vercel projects for the authenticated user or team |
| `get_project` | Get details of a specific project (framework, build config, repo link) |
| `list_deployments` | List deployments for a project with state and commit info |
| `get_deployment` | Get full deployment details including build errors and regions |
| `list_domains` | List all custom domains configured for a project |
| `add_domain` | Add a custom domain to a project |
| `list_env_vars` | List environment variables for a project (values are redacted) |
| `create_env_var` | Create a new encrypted environment variable |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| `VERCEL_TOKEN` | `X-Mcp-Secret-VERCEL-TOKEN` | Vercel API token with project read/write scope |

## Usage

Health check:

```bash
curl https://mcp-vercel.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-vercel.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-vercel.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool (list projects):

```bash
curl -X POST https://mcp-vercel.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-VERCEL-TOKEN: <your-token>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_projects","arguments":{"limit":5}}}'
```

Call a tool (get deployment):

```bash
curl -X POST https://mcp-vercel.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-VERCEL-TOKEN: <your-token>' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_deployment","arguments":{"deploymentId":"dpl_abc123"}}}'
```

## Deploy

```bash
cd MCP/mcp-vercel
npm run deploy
```
