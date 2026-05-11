# mcp-productboard — Productboard MCP Server

> Full Productboard integration — manage features, components, products, notes, and releases for product roadmap planning.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-productboard`

---

## What You Can Do

This MCP server gives AI agents access to Productboard via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Productboard directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_features` | List features from Productboard with optional filters |
| `get_feature` | Get details of a specific Productboard feature |
| `create_feature` | Create a new feature in Productboard |
| `update_feature` | Update an existing Productboard feature |
| `delete_feature` | Delete a Productboard feature |
| `list_components` | List all components in Productboard |
| `get_component` | Get details of a specific Productboard component |
| `list_products` | List all products in Productboard |
| `get_product` | Get details of a specific Productboard product |
| `list_notes` | List notes associated with a feature in Productboard |
| `create_note` | Create a new note/customer feedback in Productboard |
| `list_releases` | List all releases in Productboard |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `PRODUCTBOARD_ACCESS_TOKEN` | Yes | Your Productboard access token — create one in your Productboard workspace under Settings → API Access → Access tokens |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Productboard"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `PRODUCTBOARD_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Productboard tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-productboard \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PRODUCTBOARD-ACCESS-TOKEN: your-productboard-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_features","arguments":{}}}'
```

## License

MIT
