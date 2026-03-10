# mcp-railway — Railway MCP Server

Cloudflare Worker implementing the MCP protocol for Railway cloud platform operations. Provides tools to list projects, services, and deployments, read deployment logs and environment variables, and trigger redeploys via the Railway GraphQL API.

## Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all Railway projects for the authenticated user |
| `get_project` | Get project details including environments and services |
| `list_services` | List services in a Railway project |
| `list_deployments` | List recent deployments for a service (last 10) |
| `get_deployment_logs` | Get logs for a specific deployment |
| `list_variables` | List environment variables for a service in an environment |
| `redeploy_service` | Trigger a redeploy of a service in an environment |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| `RAILWAY_API_TOKEN` | `X-Mcp-Secret-RAILWAY-API-TOKEN` | Railway API token (create at railway.com/account/tokens) |

## Usage

Health check:

```bash
curl https://mcp-railway.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-railway.<your-domain> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-railway.<your-domain> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

List projects:

```bash
curl -X POST https://mcp-railway.<your-domain> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-RAILWAY-API-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

Get project details:

```bash
curl -X POST https://mcp-railway.<your-domain> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-RAILWAY-API-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_project","arguments":{"id":"project-uuid"}}}'
```

List deployments for a service:

```bash
curl -X POST https://mcp-railway.<your-domain> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-RAILWAY-API-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_deployments","arguments":{"serviceId":"service-uuid"}}}'
```

Redeploy a service:

```bash
curl -X POST https://mcp-railway.<your-domain> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-RAILWAY-API-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"redeploy_service","arguments":{"serviceId":"service-uuid","environmentId":"env-uuid"}}}'
```
