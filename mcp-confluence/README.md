# mcp-confluence — Confluence MCP Server

> Search pages, manage spaces, and create documentation in your Confluence wiki.

Confluence is the knowledge management hub for teams using Atlassian. This MCP server gives your AI agents the ability to search across your wiki, read and create pages, manage spaces, and add comments — making Confluence a natural knowledge source and documentation target for automated workflows and AI-driven agents.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-confluence`

---

## What You Can Do

- Search your entire wiki using CQL (Confluence Query Language) to find relevant documentation, runbooks, or meeting notes before an agent responds
- Read full page content including body HTML so agents can summarize, extract, or reference internal docs
- Create and update pages programmatically — generate post-mortems, deploy summaries, meeting notes, or API docs directly from agent workflows
- Browse spaces and page trees to discover knowledge structure and navigate hierarchies
- Add comments to pages as part of review workflows or automated feedback loops

## Setup

### Step 1: Get Your Confluence Cloud URL

Your Confluence URL looks like `https://yoursite.atlassian.net`. This is the base URL for all API calls.

### Step 2: Create an API Token

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**
3. Give it a label (e.g., "Aerostack MCP")
4. Copy the token — you won't be able to see it again

### Step 3: Add to Aerostack Workspace

1. Go to your Aerostack workspace → **Add Server** → search **"Confluence"**
2. Enter your three secrets when prompted:
   - `CONFLUENCE_URL` — your Atlassian site URL (e.g. `https://yoursite.atlassian.net`)
   - `CONFLUENCE_EMAIL` — the email address associated with your Atlassian account
   - `CONFLUENCE_API_TOKEN` — the API token you just created
3. Click **Test** to verify the connection

## Available Tools

| Tool | Description |
|------|-------------|
| `search_content` | Search Confluence content using CQL queries |
| `get_page` | Get a page by ID with full body content |
| `create_page` | Create a new page in a space |
| `update_page` | Update an existing page (requires current version number) |
| `list_spaces` | List all spaces in the instance |
| `get_space` | Get details for a specific space |
| `list_pages` | List pages in a space with sorting |
| `add_comment` | Add a footer comment to a page |
| `get_page_children` | Get child pages of a parent page |

## Configuration

| Variable | Required | How to Get |
|----------|----------|------------|
| `CONFLUENCE_URL` | Yes | Your Atlassian site URL (e.g. `https://yoursite.atlassian.net`) |
| `CONFLUENCE_EMAIL` | Yes | Your Atlassian account email address |
| `CONFLUENCE_API_TOKEN` | Yes | [id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |

## Example Prompts

```
"Search Confluence for our deployment runbook"
"Get the content of page 12345 and summarize the key points"
"Create a new page in the Engineering space titled 'Sprint 42 Retrospective' with a summary of this week's work"
"List all spaces and find which one contains our API documentation"
"Add a comment to the incident report page saying the root cause has been identified"
"Show me all child pages under our Architecture Decisions page"
```

## CQL Query Examples

CQL (Confluence Query Language) is used with the `search_content` tool:

| Query | What it finds |
|-------|--------------|
| `type=page AND text~"deploy guide"` | Pages containing "deploy guide" |
| `type=page AND space=ENG` | All pages in the ENG space |
| `type=page AND creator=currentUser()` | Pages you created |
| `type=page AND lastModified>now("-7d")` | Pages modified in the last 7 days |
| `type=page AND title="Runbook"` | Pages with exact title "Runbook" |
| `type=page AND label="production"` | Pages labeled "production" |

## Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-confluence \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CONFLUENCE-URL: https://yoursite.atlassian.net' \
  -H 'X-Mcp-Secret-CONFLUENCE-EMAIL: you@company.com' \
  -H 'X-Mcp-Secret-CONFLUENCE-API-TOKEN: your-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_content","arguments":{"cql":"type=page AND text~\"deploy guide\""}}}'
```

## Security Notes

- API tokens have the same permissions as your Atlassian account — use a service account with limited permissions for production
- Tokens do not expire automatically but can be revoked at any time from the Atlassian security settings
- All secrets are transmitted via `X-Mcp-Secret-*` headers and never stored by the MCP worker
- The worker uses Basic auth (email:token base64-encoded) as required by the Confluence Cloud REST API

## License

MIT
