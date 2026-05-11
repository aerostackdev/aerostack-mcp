# mcp-apify — Apify MCP Server

> Run web scraping and automation actors on Apify — trigger runs, get results, manage datasets and key-value stores.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-apify`

---

## What You Can Do

This MCP server gives AI agents access to Apify via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Apify directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_actors` | List user |
| `get_actor` | Get details of a specific Apify actor |
| `run_actor` | Start a run of an Apify actor with optional input |
| `get_run` | Get status and details of an Apify actor run |
| `abort_run` | Abort a running Apify actor run |
| `list_datasets` | List user |
| `get_dataset_items` | Get items from an Apify dataset |
| `list_key_value_stores` | List user |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `APIFY_API_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Apify"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `APIFY_API_TOKEN`

Once added, every AI agent in your workspace can use Apify tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-apify \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-APIFY-API-TOKEN: your-apify-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_actors","arguments":{}}}'
```

## License

MIT
