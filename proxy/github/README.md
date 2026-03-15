# GitHub API MCP

> Official proxy MCP — GitHub repos, PRs, issues, branches, code search via GitHub's official hosted MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-github`

---

## Overview

GitHub API is a proxy MCP server that forwards requests directly to the official GitHub MCP endpoint at `https://api.githubcopilot.com/mcp/`. All tools are maintained by GitHub — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by GitHub)
**Auth:** Bearer token via `GITHUB_PERSONAL_ACCESS_TOKEN`

## Available Tools

- **list_repos** — List repositories for the authenticated user or a specified organization, with sorting and filtering options
- **get_repo** — Get detailed information about a GitHub repository including stats, topics, and default branch
- **create_issue** — Create a new GitHub issue in a repository with title, body, labels, and assignees
- **list_pull_requests** — List pull requests for a repository filtered by state, base branch, or head branch
- **search_code** — Search for code across GitHub repositories using GitHub's code search syntax

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Yes | GitHub Personal Access Token with required scopes | github.com → Settings → Developer settings → Personal access tokens → Generate new token |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"GitHub API"**
3. Enter your `GITHUB_PERSONAL_ACCESS_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use GitHub tools automatically.

## Usage

### Example Prompts

```
"List all my GitHub items and summarize the most recent ones"
"Find anything related to [keyword] in GitHub"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-github \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GITHUB-PERSONAL-ACCESS-TOKEN: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_repos","arguments":{}}}'
```

## License

MIT
