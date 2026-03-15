# mcp-webflow

MCP server for Webflow — manage sites, CMS collections, items, and publish deployments via Webflow API v2.

Deployed as a Cloudflare Worker. Secrets injected via `X-Mcp-Secret-*` headers from the Aerostack gateway.

## Secret

| Header | Maps To |
|--------|---------|
| `X-Mcp-Secret-WEBFLOW-API-TOKEN` | Webflow API token (`Authorization: Bearer {token}`) |

## Tools (10)

| Tool | Description |
|------|-------------|
| `list_sites` | List all Webflow sites accessible to the authenticated user |
| `get_site` | Get detailed information about a specific Webflow site |
| `publish_site` | Publish a Webflow site to one or all domains |
| `list_collections` | List all CMS collections for a Webflow site |
| `get_collection` | Get a specific CMS collection including its field schema |
| `list_items` | List items in a CMS collection |
| `get_item` | Get a specific CMS collection item |
| `create_item` | Create a new item in a CMS collection |
| `update_item` | Update an existing CMS collection item |
| `delete_item` | Delete a CMS collection item |

## Deploy

```bash
npx wrangler deploy
```

## Test

```bash
npm test
```
