# Vercel Deployments MCP

> Official proxy MCP — Deployments, projects, domains, env vars, logs via Vercel's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-vercel`

---

## Overview

Vercel Deployments is a proxy MCP server that forwards requests directly to the official Vercel MCP endpoint at `https://mcp.vercel.com`. All tools are maintained by Vercel — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Vercel)
**Auth:** Bearer token via `VERCEL_TOKEN`

## Available Tools

- **list_deployments** — List Vercel deployments for all projects or a specific project, with status and URL details
- **get_deployment** — Retrieve details of a specific Vercel deployment including build logs URL, status, and aliases
- **list_projects** — List all Vercel projects in the account or team with their framework, repo, and latest deployment info
- **get_project** — Get detailed information about a Vercel project including framework, git integration, and environment variables
- **create_deployment** — Trigger a new Vercel deployment for a project from a git branch, commit, or uploaded files

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `VERCEL_TOKEN` | Yes | Vercel Personal Access Token | vercel.com/account/tokens → Create Token |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Vercel Deployments"**
3. Enter your `VERCEL_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Vercel tools automatically.

## Usage

### Example Prompts

```
"List all my Vercel items and summarize the most recent ones"
"Find anything related to [keyword] in Vercel"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-vercel \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-VERCEL-TOKEN: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_deployments","arguments":{}}}'
```

## License

MIT
