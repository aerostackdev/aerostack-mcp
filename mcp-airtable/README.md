# mcp-airtable — Airtable MCP Server

Airtable is a flexible spreadsheet-database hybrid for organizing data. This MCP server enables managing bases, tables, and records via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| list_bases | List all accessible bases |
| list_tables | List tables in a base with field schemas |
| list_records | List records in a table with optional filter |
| get_record | Get a single record by ID |
| create_record | Create a new record in a table |
| update_record | Update fields of an existing record |
| search_records | Search records using a formula filter |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| AIRTABLE_API_KEY | X-Mcp-Secret-AIRTABLE-API-KEY | Airtable personal access token |

## Usage

Health check:

```bash
curl https://mcp-airtable.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-airtable.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-airtable.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-airtable.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AIRTABLE-API-KEY: <your-token>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_bases","arguments":{}}}'
```

## Deploy

```bash
cd MCP/mcp-airtable
npm run deploy
```
