# mcp-cloudflare — Cloudflare MCP Server

Manage Cloudflare infrastructure including Workers, KV, R2, D1 databases, and account analytics via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| list_workers | List all Cloudflare Workers in the account |
| get_worker | Get details and script content of a specific Worker |
| list_kv_namespaces | List all KV namespaces |
| kv_get | Get a value from a KV namespace by key |
| kv_put | Set a value in a KV namespace |
| list_r2_buckets | List all R2 storage buckets |
| list_d1_databases | List all D1 databases |
| query_d1 | Run a SQL query against a D1 database |
| get_worker_logs | Get recent analytics for a Worker |
| get_account_analytics | Get account-level request analytics |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| CF_API_TOKEN | X-Mcp-Secret-CF-API-TOKEN | Cloudflare API token with appropriate permissions |
| CF_ACCOUNT_ID | X-Mcp-Secret-CF-ACCOUNT-ID | Your Cloudflare account ID |

## Usage

Health check:

```bash
curl https://mcp-cloudflare.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-cloudflare.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-cloudflare.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-cloudflare.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CF-API-TOKEN: <your-token>' \
  -H 'X-Mcp-Secret-CF-ACCOUNT-ID: <your-account-id>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_workers","arguments":{}}}'
```

## Deploy

```bash
cd MCP/mcp-cloudflare
npm run deploy
```
