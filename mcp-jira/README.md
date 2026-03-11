# mcp-jira — Jira MCP Server

Jira is an issue tracking and project management tool by Atlassian. This MCP server enables searching issues, creating tasks, and managing workflows via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| search_issues | Search issues using JQL query |
| get_issue | Get full details of an issue |
| create_issue | Create a new issue in a project |
| add_comment | Add a comment to an issue |
| list_projects | List all accessible projects |
| transition_issue | Transition an issue to a new status |
| get_project_statuses | Get available statuses for a project |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| JIRA_EMAIL | X-Mcp-Secret-JIRA-EMAIL | Atlassian account email |
| JIRA_API_TOKEN | X-Mcp-Secret-JIRA-API-TOKEN | Jira API token from account settings |
| JIRA_DOMAIN | X-Mcp-Secret-JIRA-DOMAIN | Your Jira domain (e.g. yourcompany.atlassian.net) |

## Usage

Health check:

```bash
curl https://mcp-jira.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-jira.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-jira.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-jira.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-JIRA-EMAIL: <your-email>' \
  -H 'X-Mcp-Secret-JIRA-API-TOKEN: <your-token>' \
  -H 'X-Mcp-Secret-JIRA-DOMAIN: <your-domain>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

## Deploy

```bash
cd MCP/mcp-jira
npm run deploy
```
