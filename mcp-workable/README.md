# mcp-workable — Workable MCP Server

> Manage jobs, candidates, interviews, ratings, and hiring pipelines in Workable ATS.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-workable`

---

## What You Can Do

This MCP server gives AI agents access to Workable via 18 tools. Connect it to any Aerostack workspace and your agents can interact with Workable directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_jobs` | List jobs in Workable |
| `get_job` | Get a specific job by shortcode |
| `list_candidates` | List candidates in Workable |
| `create_candidate` | Create a new candidate for a job in Workable |
| `get_candidate` | Get a specific candidate by ID |
| `update_candidate_stage` | Move a candidate to a different stage |
| `list_stages` | List pipeline stages in Workable |
| `list_members` | List team members in Workable |
| `list_departments` | List departments in Workable |
| `list_pipelines` | List pipelines in Workable |
| `post_comment` | Post a comment on a candidate |
| `list_comments` | List comments for a candidate |
| `rate_candidate` | Rate a candidate (1-5) |
| `add_tag` | Add tags to a candidate |
| `schedule_interview` | Schedule an interview for a candidate |
| `list_events` | List events for a candidate |
| `archive_candidate` | Archive (delete) a candidate |
| `search_candidates` | Search for candidates by query |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `WORKABLE_API_KEY` | Yes | Your WORKABLE API KEY from the service's developer settings |
| `WORKABLE_SUBDOMAIN` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Workable"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `WORKABLE_API_KEY`
- `WORKABLE_SUBDOMAIN`

Once added, every AI agent in your workspace can use Workable tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-workable \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-WORKABLE-API-KEY: your-workable-api-key' \
  -H 'X-Mcp-Secret-WORKABLE-SUBDOMAIN: your-workable-subdomain' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_jobs","arguments":{}}}'
```

## License

MIT
