# mcp-planetscale

PlanetScale MCP server for Aerostack. Manage databases, branches, and deploy requests via the PlanetScale API.

## Tools

| Tool | Description | Method |
|------|-------------|--------|
| `list_databases` | List all databases in an organization | GET |
| `get_database` | Get details of a specific database | GET |
| `list_branches` | List branches of a database | GET |
| `get_branch` | Get details of a specific branch | GET |
| `create_branch` | Create a new branch from a parent branch | POST |
| `list_deploy_requests` | List deploy requests for a database | GET |
| `create_deploy_request` | Create a deploy request to merge schema changes | POST |

## Secrets

| Env Var | Header | Format | Description |
|---------|--------|--------|-------------|
| `PLANETSCALE_TOKEN` | `X-Mcp-Secret-PLANETSCALE-TOKEN` | `{service_token_id}:{service_token}` | PlanetScale service token |

Create a service token in PlanetScale dashboard under **Settings > Service tokens**. The token value passed to the gateway should be in the format `id:token`.

## Deploy

```bash
npm run build
npm run deploy
```

## Local Development

```bash
npm run dev
```

## Example Requests

### Health Check

```bash
curl http://localhost:8787/health
```

### Initialize

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

### List Tools

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### List Databases

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-PLANETSCALE-TOKEN: your_id:your_token" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_databases","arguments":{"org":"my-org"}}}'
```

### Get Database Details

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-PLANETSCALE-TOKEN: your_id:your_token" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_database","arguments":{"org":"my-org","database":"my-db"}}}'
```

### List Branches

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-PLANETSCALE-TOKEN: your_id:your_token" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_branches","arguments":{"org":"my-org","database":"my-db"}}}'
```

### Create Branch

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-PLANETSCALE-TOKEN: your_id:your_token" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"create_branch","arguments":{"org":"my-org","database":"my-db","name":"feature-users","parent_branch":"main"}}}'
```

### Create Deploy Request

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-PLANETSCALE-TOKEN: your_id:your_token" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"create_deploy_request","arguments":{"org":"my-org","database":"my-db","branch":"feature-users","into_branch":"main"}}}'
```
