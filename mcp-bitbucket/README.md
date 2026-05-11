# mcp-bitbucket — Bitbucket MCP Server

> Manage Bitbucket repositories, branches, pull requests, commits, and pipelines with natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-bitbucket`

---

## What You Can Do

This MCP server gives AI agents access to Bitbucket via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Bitbucket directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_repositories` | List repositories in a Bitbucket workspace |
| `get_repository` | Get details of a specific Bitbucket repository |
| `create_repository` | Create a new Bitbucket repository |
| `list_branches` | List branches in a Bitbucket repository |
| `get_branch` | Get details of a specific branch |
| `list_pull_requests` | List pull requests in a Bitbucket repository |
| `get_pull_request` | Get details of a specific pull request |
| `create_pull_request` | Create a new pull request in a Bitbucket repository |
| `merge_pull_request` | Merge a pull request |
| `list_commits` | List commits in a Bitbucket repository |
| `get_commit` | Get details of a specific commit |
| `list_pipelines` | List pipelines in a Bitbucket repository |
| `get_pipeline` | Get details of a specific pipeline |
| `create_pipeline` | Trigger a new pipeline in a Bitbucket repository |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `BITBUCKET_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Bitbucket"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `BITBUCKET_TOKEN`

Once added, every AI agent in your workspace can use Bitbucket tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-bitbucket \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-BITBUCKET-TOKEN: your-bitbucket-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_repositories","arguments":{}}}'
```

## License

MIT
