# mcp-github — GitHub MCP Server

GitHub is a code hosting platform for version control and collaboration. This MCP server enables managing repositories, issues, and pull requests via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| list_repos | List repositories for the authenticated user |
| get_repo | Get details of a specific repository |
| list_issues | List issues in a repository with optional filters |
| create_issue | Create a new issue in a repository |
| get_issue | Get details of a specific issue |
| search_repos | Search GitHub repositories by query |
| create_pr_comment | Add a comment to a pull request |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| GITHUB_TOKEN | X-Mcp-Secret-GITHUB-TOKEN | GitHub personal access token or OAuth token |

## Usage

Health check:

```bash
curl https://mcp-github.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-github.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-github.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-github.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GITHUB-TOKEN: <your-token>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_repos","arguments":{}}}'
```

## Deploy

```bash
cd MCP/mcp-github
npm run deploy
```
