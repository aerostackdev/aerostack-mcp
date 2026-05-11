# mcp-wordpress — Wordpress MCP Server

> Connect your WordPress site to AI — manage posts, pages, categories, comments, and media with natural language using the WordPress REST API.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-wordpress`

---

## What You Can Do

This MCP server gives AI agents access to Wordpress via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Wordpress directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_posts` | List published posts from a WordPress site |
| `get_post` | Get a single WordPress post by ID |
| `create_post` | Create a new WordPress post |
| `update_post` | Update an existing WordPress post |
| `delete_post` | Delete a WordPress post permanently |
| `list_pages` | List pages on a WordPress site |
| `get_page` | Get a single WordPress page by ID |
| `create_page` | Create a new WordPress page |
| `list_categories` | List all categories on the WordPress site |
| `create_category` | Create a new category |
| `list_tags` | List tags on the WordPress site |
| `list_media` | List media files on the WordPress site |
| `list_comments` | List comments on a post |
| `get_site_settings` | Get WordPress site settings and configuration |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `WORDPRESS_USERNAME` | Yes | See provider documentation |
| `WORDPRESS_APP_PASSWORD` | Yes | See provider documentation |
| `WORDPRESS_DOMAIN` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Wordpress"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `WORDPRESS_USERNAME`
- `WORDPRESS_APP_PASSWORD`
- `WORDPRESS_DOMAIN`

Once added, every AI agent in your workspace can use Wordpress tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-wordpress \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-WORDPRESS-USERNAME: your-wordpress-username' \
  -H 'X-Mcp-Secret-WORDPRESS-APP-PASSWORD: your-wordpress-app-password' \
  -H 'X-Mcp-Secret-WORDPRESS-DOMAIN: your-wordpress-domain' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_posts","arguments":{}}}'
```

## License

MIT
