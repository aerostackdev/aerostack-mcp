# mcp-webflow — Webflow MCP Server

> Manage Webflow sites, CMS collections, items, and publish deployments from your AI agents.

Webflow is the visual web development platform used by designers and marketers to build and manage content-rich websites without writing code. This MCP server exposes the Webflow API v2 — letting your AI agents create and update CMS items, publish sites, and manage collection content, making it possible to automate content operations that would otherwise require logging into Webflow and editing manually.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-webflow`

---

## What You Can Do

- Create and update CMS collection items to publish new blog posts, product listings, or team members from external data sources or AI-generated content
- Publish a Webflow site to production from an automated workflow after content is reviewed and approved
- List and inspect CMS collections and their field schemas so agents know the exact structure before writing data
- Manage CMS content at scale — bulk create, update, or delete items across collections

## Available Tools

| Tool | Description |
|------|-------------|
| `list_sites` | List all Webflow sites accessible to the authenticated user |
| `get_site` | Get detailed information about a specific Webflow site |
| `publish_site` | Publish a Webflow site to one or all domains |
| `list_collections` | List all CMS collections for a Webflow site |
| `get_collection` | Get a specific CMS collection including its full field schema |
| `list_items` | List items in a CMS collection |
| `get_item` | Get a specific CMS collection item |
| `create_item` | Create a new item in a CMS collection |
| `update_item` | Update an existing CMS collection item |
| `delete_item` | Delete a CMS collection item |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `WEBFLOW_API_TOKEN` | Yes | Webflow API token for authentication | [webflow.com/dashboard/account/integrations](https://webflow.com/dashboard/account/integrations) → **Generate API Token** → copy the token. Alternatively, create a Site-specific token under **Site Settings** → **Integrations** → **API Access**. |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Webflow"** and click **Add to Workspace**
3. Add your `WEBFLOW_API_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call Webflow tools automatically — no per-user setup needed.

### Example Prompts

```
"Create a new blog post CMS item on my Webflow site with the title and body from this draft"
"List all items in the Team Members collection and update Sarah's title to VP of Engineering"
"Publish my company website to production after verifying the last CMS item was created successfully"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-webflow \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-WEBFLOW-API-TOKEN: your-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_sites","arguments":{}}}'
```

## License

MIT
