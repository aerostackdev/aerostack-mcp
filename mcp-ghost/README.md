# mcp-ghost — Ghost MCP Server

> Create, publish, and manage Ghost blog posts, pages, and members from your AI agents.

Ghost is the open-source publishing platform used by independent creators and media teams for newsletters, blogs, and membership sites. This MCP server connects your AI agents directly to your Ghost Admin API — enabling automated content creation, publishing workflows, and member management without logging into the Ghost dashboard.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-ghost`

---

## What You Can Do

- Draft and publish posts programmatically — useful for content pipelines that generate articles from data sources or external triggers
- Manage your publishing calendar by listing scheduled and draft posts and updating their status
- Add members to your Ghost site automatically as part of lead capture or CRM integration workflows
- Maintain your pages (About, Landing pages) with the same tools as posts

## Available Tools

| Tool | Description |
|------|-------------|
| `list_posts` | List posts, filterable by status (published, draft, scheduled) |
| `get_post` | Get a specific post with full HTML content |
| `create_post` | Create a new post (draft or published) |
| `update_post` | Update post fields (requires updated_at for conflict detection) |
| `delete_post` | Delete a post permanently |
| `publish_post` | Publish a draft post (shortcut for update with status=published) |
| `list_pages` | List pages, filterable by status |
| `list_members` | List members, filterable by email |
| `create_member` | Create a new member with optional labels |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `GHOST_URL` | Yes | Full URL of your Ghost site (e.g. `https://myblog.ghost.io`) | Your Ghost site URL — no trailing slash |
| `GHOST_ADMIN_API_KEY` | Yes | Admin API key in `{id}:{secret}` format | Ghost Admin → **Settings** → **Integrations** → **Add custom integration** → copy **Admin API Key** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Ghost"** and click **Add to Workspace**
3. Add `GHOST_URL` and `GHOST_ADMIN_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Ghost tools automatically — no per-user setup needed.

### Example Prompts

```
"List all draft posts on my Ghost blog and summarize what each one is about"
"Create a new draft post titled 'March Product Update' with the following content..."
"Add jane@example.com as a member with the label newsletter-subscriber"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-ghost \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GHOST-URL: https://myblog.ghost.io' \
  -H 'X-Mcp-Secret-GHOST-ADMIN-API-KEY: your-id:your-secret' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_posts","arguments":{"status":"draft"}}}'
```

## License

MIT
