# mcp-squarespace — Squarespace MCP Server

> Connect your Squarespace website to AI — manage products, orders, inventory, pages, and blog posts with natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-squarespace`

---

## What You Can Do

This MCP server gives AI agents access to Squarespace via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Squarespace directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_products` | List products in the Squarespace store |
| `get_product` | Get a product by ID |
| `list_orders` | List orders from the store |
| `get_order` | Get a specific order by ID |
| `fulfill_order` | Mark an order as fulfilled and optionally send notification |
| `list_inventory` | List inventory for store variants |
| `update_inventory` | Update inventory quantities for product variants |
| `list_pages` | List pages on the Squarespace website |
| `get_page` | Get a specific page by ID |
| `list_blog_posts` | List blog posts from the website |
| `get_blog_post` | Get a specific blog post by ID |
| `get_website` | Get general website information |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SQUARESPACE_API_KEY` | Yes | Your SQUARESPACE API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Squarespace"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `SQUARESPACE_API_KEY`

Once added, every AI agent in your workspace can use Squarespace tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-squarespace \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SQUARESPACE-API-KEY: your-squarespace-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_products","arguments":{}}}'
```

## License

MIT
