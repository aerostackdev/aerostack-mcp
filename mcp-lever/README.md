# mcp-lever — Lever MCP Server

> Manage job postings, candidate opportunities, pipeline stages, tags, and hiring workflows in Lever ATS.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-lever`

---

## What You Can Do

This MCP server gives AI agents access to Lever via 18 tools. Connect it to any Aerostack workspace and your agents can interact with Lever directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_postings` | List job postings in Lever |
| `get_posting` | Get a specific job posting by ID |
| `list_opportunities` | List candidate opportunities in Lever |
| `create_opportunity` | Create a new candidate opportunity in Lever |
| `get_opportunity` | Get a specific opportunity by ID |
| `update_opportunity_stage` | Update the stage of an opportunity |
| `add_opportunity_note` | Add a note to an opportunity |
| `list_stages` | List all pipeline stages in Lever |
| `list_pipeline_stages` | List all pipeline stages (alias for list_stages) |
| `list_users` | List users in Lever |
| `list_tags` | List all tags in Lever |
| `add_tag_to_opportunity` | Add tags to an opportunity |
| `remove_tag_from_opportunity` | Remove tags from an opportunity |
| `list_feedback_forms` | List feedback for an opportunity |
| `advance_opportunity` | Advance an opportunity to a new stage |
| `archive_opportunity` | Archive an opportunity |
| `list_archive_reasons` | List available archive reasons |
| `get_opportunity_resume` | Get resumes for an opportunity |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `LEVER_API_KEY` | Yes | Your LEVER API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Lever"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `LEVER_API_KEY`

Once added, every AI agent in your workspace can use Lever tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-lever \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LEVER-API-KEY: your-lever-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_postings","arguments":{}}}'
```

## License

MIT
