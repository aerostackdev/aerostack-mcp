# mcp-etsy — Etsy MCP Server

> Connect your Etsy shop to AI — browse listings, manage orders, view transactions, and search the Etsy marketplace with natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-etsy`

---

## What You Can Do

This MCP server gives AI agents access to Etsy via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Etsy directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_shop` | Get details about an Etsy shop by shop ID |
| `find_shops` | Find Etsy shops by name |
| `list_listings` | List active listings in an Etsy shop |
| `get_listing` | Get details about a specific Etsy listing |
| `get_listing_images` | Get images for an Etsy listing |
| `list_shop_receipts` | List receipts (orders) for a shop |
| `get_receipt` | Get a specific receipt from a shop |
| `list_transactions` | List transactions for a shop |
| `get_transaction` | Get a specific transaction from a shop |
| `find_all_listings` | Search all active Etsy listings by keywords |
| `get_shop_reviews` | Get reviews for an Etsy shop |
| `get_listing_inventory` | Get inventory details for a listing |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ETSY_API_KEY` | Yes | Your ETSY API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Etsy"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `ETSY_API_KEY`

Once added, every AI agent in your workspace can use Etsy tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-etsy \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ETSY-API-KEY: your-etsy-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_shop","arguments":{}}}'
```

## License

MIT
