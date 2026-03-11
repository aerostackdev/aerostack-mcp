# mcp-linear — Linear MCP Server

Linear is a project management tool built for software teams. This MCP server enables managing issues, projects, and teams via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| list_issues | List issues with optional team/state filters |
| get_issue | Get full details of an issue including comments |
| create_issue | Create a new issue in a team |
| update_issue | Update an issue's title, description, or state |
| list_teams | List all teams in the workspace |
| list_projects | List all projects |
| add_comment | Add a comment to an issue |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| LINEAR_API_KEY | X-Mcp-Secret-LINEAR-API-KEY | Linear API key from account settings |

## Usage

Health check:

```bash
curl https://mcp-linear.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-linear.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-linear.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-linear.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LINEAR-API-KEY: <your-token>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_teams","arguments":{}}}'
```

## Deploy

```bash
cd MCP/mcp-linear
npm run deploy
```
