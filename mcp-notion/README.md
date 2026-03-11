# mcp-notion — Notion MCP Server

Notion is an all-in-one workspace for notes, databases, and collaboration. This MCP server enables searching pages, managing databases, and creating content via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| search | Search all pages and databases in the workspace |
| get_page | Get a page by ID with its properties |
| get_page_content | Get the block content of a page |
| create_page | Create a new page in a database or as a child of another page |
| update_page | Update page properties |
| query_database | Query a database with optional filters and sorts |
| append_content | Append blocks to a page |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| NOTION_TOKEN | X-Mcp-Secret-NOTION-TOKEN | Notion integration token |

## Usage

Health check:

```bash
curl https://mcp-notion.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-notion.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-notion.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-notion.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-NOTION-TOKEN: <your-token>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search","arguments":{"query":"meeting notes"}}}'
```

## Deploy

```bash
cd MCP/mcp-notion
npm run deploy
```
