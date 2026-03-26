# mcp-gitlab — GitLab MCP Server

> Manage projects, issues, merge requests, pipelines, branches, and code search on GitLab — AI-native DevOps platform access.

Give your AI agents full access to GitLab. Browse projects, manage issues and merge requests, monitor CI/CD pipelines, search code, read files, and track branches — works with gitlab.com and self-hosted instances.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-gitlab`

---

## What You Can Do

- List and search projects with statistics
- Create and filter issues by state, labels, assignee, and milestone
- List and inspect merge requests with diff stats, conflicts, and pipeline status
- Monitor CI/CD pipelines by status, branch, or tag
- List branches with protected/merged status
- Search code across repositories
- Read file contents from any branch or commit

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify GitLab connectivity and show authenticated user |
| `list_projects` | List accessible projects with stars, forks, and activity |
| `get_project` | Get project details with statistics and description |
| `list_issues` | List issues with state, label, assignee, and search filters |
| `create_issue` | Create a new issue with title, description, labels, assignees |
| `list_merge_requests` | List MRs with state, branch, and author filters |
| `get_merge_request` | Get MR details — diff stats, conflicts, reviewers, pipeline |
| `list_pipelines` | List CI/CD pipelines with status and ref filters |
| `list_branches` | List branches with protected/merged status |
| `search_code` | Search code by keyword across a project |
| `get_file` | Read a file from the repository by path and branch |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `GITLAB_TOKEN` | Yes | GitLab Personal Access Token with `api` scope | gitlab.com → Preferences → Access Tokens → Add new token → select `api` scope |
| `GITLAB_URL` | No | GitLab instance URL (default: https://gitlab.com) | For self-hosted: your GitLab instance URL (e.g. https://gitlab.company.com) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"GitLab"** and click **Add to Workspace**
3. Add `GITLAB_TOKEN` and optionally `GITLAB_URL` under **Project → Secrets**

### Example Prompts

```
"List all my GitLab projects sorted by last activity"
"Show open issues labeled 'bug' in the frontend project"
"Create an issue: 'Fix login timeout' with label 'bug' in group/backend"
"List open merge requests targeting the main branch"
"Show me the last 5 pipeline runs for the API project — any failures?"
"Search for 'database_url' across the backend repository"
"Read the docker-compose.yml file from the main branch"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-gitlab \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GITLAB-TOKEN: glpat-xxxxxxxxxxxx' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{"owned":true}}}'
```

## Security Notes

- GitLab tokens are injected at the Aerostack gateway layer — never stored in the worker
- Works with both gitlab.com and self-hosted GitLab instances via GITLAB_URL
- File contents over 100KB are truncated to prevent oversized responses
- Use tokens with minimal scopes — `read_api` is sufficient for read-only operations

## License

MIT
