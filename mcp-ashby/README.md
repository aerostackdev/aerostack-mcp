# mcp-ashby — Ashby MCP Server

> Manage job postings, candidates, applications, interview stages, and hiring workflows in Ashby ATS.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-ashby`

---

## What You Can Do

This MCP server gives AI agents access to Ashby via 18 tools. Connect it to any Aerostack workspace and your agents can interact with Ashby directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_job_postings` | List job postings in Ashby |
| `get_job_posting` | Get a specific job posting by ID |
| `list_candidates` | List candidates in Ashby |
| `create_candidate` | Create a new candidate in Ashby |
| `get_candidate` | Get a specific candidate by ID |
| `search_candidates` | Search candidates by email in Ashby |
| `list_applications` | List applications in Ashby |
| `get_application` | Get a specific application by ID |
| `create_application` | Create a new application in Ashby |
| `change_application_stage` | Move an application to a different interview stage |
| `list_interview_stages` | List interview stages for a job |
| `list_jobs` | List jobs in Ashby |
| `get_job` | Get a specific job by ID |
| `list_departments` | List departments in Ashby |
| `list_sources` | List candidate sources in Ashby |
| `add_note` | Add a note to a candidate |
| `list_notes` | List notes for a candidate |
| `list_users` | List users in Ashby |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ASHBY_API_KEY` | Yes | Your ASHBY API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Ashby"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `ASHBY_API_KEY`

Once added, every AI agent in your workspace can use Ashby tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-ashby \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ASHBY-API-KEY: your-ashby-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_job_postings","arguments":{}}}'
```

## License

MIT
