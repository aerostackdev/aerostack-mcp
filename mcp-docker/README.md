# mcp-docker — Docker Hub MCP Server

> Search Docker Hub images, inspect tags, view manifests, and manage repositories — AI-native container registry access.

Give your AI agents access to Docker Hub. Search millions of container images, compare tags and architectures, inspect vulnerability reports, view Dockerfiles, and manage your repositories — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-docker`

---

## What You Can Do

- Search Docker Hub for container images by keyword
- Get repository details with description, stars, and pull counts
- List and inspect tags with architecture variants and compressed sizes
- View Dockerfiles for automated build images
- Check vulnerability scan summaries (Docker Scout)
- List all repositories for a user or organization

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify Docker Hub connectivity |
| `search_images` | Search images by keyword with official/community filter |
| `get_repository` | Get repo details — description, stars, pulls, last updated |
| `list_tags` | List tags with digest, size, architecture, and OS info |
| `get_tag` | Get tag details — multi-arch images, digests, timestamps |
| `list_repos` | List repos for a user/org with pull counts |
| `get_dockerfile` | View the Dockerfile for an image tag |
| `get_vulnerabilities` | Vulnerability scan summary (critical/high/medium/low) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `DOCKER_USERNAME` | Yes | Docker Hub username | hub.docker.com → your username |
| `DOCKER_PASSWORD` | Yes | Docker Hub password or Personal Access Token | hub.docker.com → Account Settings → Security → New Access Token (recommended over password) |

> **Best practice:** Use a Personal Access Token instead of your password. Tokens can be scoped to read-only access.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Docker"** and click **Add to Workspace**
3. Add `DOCKER_USERNAME` and `DOCKER_PASSWORD` under **Project → Secrets**

### Example Prompts

```
"Search Docker Hub for the most popular Node.js images"
"Show me all tags for the official postgres image"
"What architectures are available for nginx:alpine?"
"List my Docker Hub repositories sorted by most pulled"
"Check vulnerabilities for python:3.12-slim"
"Show me the Dockerfile for node:22-alpine"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-docker \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DOCKER-USERNAME: myuser' \
  -H 'X-Mcp-Secret-DOCKER-PASSWORD: dckr_pat_xxxx' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_images","arguments":{"query":"nginx","is_official":true}}}'
```

## Security Notes

- Docker Hub credentials are injected at the Aerostack gateway layer — never stored in the worker
- Use Personal Access Tokens instead of passwords for better security
- Vulnerability data requires Docker Scout to be enabled on the repository
- Dockerfile retrieval only works for images built via Docker Hub automated builds

## License

MIT
