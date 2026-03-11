# mcp-supabase — Supabase MCP Server

Supabase is an open-source Firebase alternative built on PostgreSQL. This MCP server enables querying databases and managing storage buckets via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| list_tables | Introspect available tables and their columns |
| select | Run a SELECT query on a table with optional filters |
| insert | Insert one or more rows into a table |
| update | Update rows matching a filter condition |
| delete | Delete rows matching a filter condition |
| rpc | Call a Supabase database function (stored procedure) |
| storage_list | List files in a storage bucket |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| SUPABASE_URL | X-Mcp-Secret-SUPABASE-URL | Your Supabase project URL |
| SUPABASE_ANON_KEY | X-Mcp-Secret-SUPABASE-ANON-KEY | Supabase anon/public key |

## Usage

Health check:

```bash
curl https://mcp-supabase.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-supabase.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-supabase.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-supabase.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SUPABASE-URL: <your-url>' \
  -H 'X-Mcp-Secret-SUPABASE-ANON-KEY: <your-key>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_tables","arguments":{}}}'
```

## Deploy

```bash
cd MCP/mcp-supabase
npm run deploy
```
