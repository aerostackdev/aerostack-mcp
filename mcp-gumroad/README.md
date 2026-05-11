# mcp-gumroad — Gumroad MCP Server

> Gumroad creator economy platform — manage digital products, sales, subscribers, and offer codes.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-gumroad`

---

## What You Can Do

This MCP server gives AI agents access to Gumroad via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Gumroad directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_products` | List all products on your Gumroad account. |
| `get_product` | Get product details by ID including price, sales count, and description. |
| `list_sales` | List all sales for your Gumroad account. |
| `get_sale` | Get sale details by ID including buyer info, product, and amount. |
| `list_subscribers` | List subscribers for a specific product. |
| `list_offer_codes` | List all offer codes (discount codes) for a product. |
| `create_offer_code` | Create a discount offer code for a product. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GUMROAD_ACCESS_TOKEN` | Yes | Your Gumroad access token — obtained via Gumroad OAuth or from Settings → Advanced |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Gumroad"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `GUMROAD_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Gumroad tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-gumroad \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GUMROAD-ACCESS-TOKEN: your-gumroad-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_products","arguments":{}}}'
```

## License

MIT
