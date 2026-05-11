# mcp-amazon-seller — Amazon Seller MCP Server

> Connect your Amazon Seller account to AI — manage catalog, FBA inventory, orders, reports, pricing, and financial events with natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-amazon-seller`

---

## What You Can Do

This MCP server gives AI agents access to Amazon Seller via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Amazon Seller directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_catalog_items` | Search the Amazon catalog for items by keywords |
| `get_catalog_item` | Get details for a specific catalog item by ASIN |
| `list_inventory` | List FBA inventory summaries |
| `list_orders` | List orders from a marketplace |
| `get_order` | Get details for a specific order |
| `get_order_items` | Get the items in a specific order |
| `list_reports` | List available reports |
| `get_report` | Get a specific report by ID |
| `create_report` | Request creation of a new report |
| `list_financial_events` | List financial events for the seller account |
| `get_pricing` | Get pricing for one or more ASINs |
| `list_feed_submissions` | List recent feed submissions |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `AMAZON_SP_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Amazon Seller"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `AMAZON_SP_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Amazon Seller tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-amazon-seller \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AMAZON-SP-ACCESS-TOKEN: your-amazon-sp-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_catalog_items","arguments":{}}}'
```

## License

MIT
