# mcp-playwright — Playwright MCP Server

> Automate browsers on the edge — navigate pages, fill forms, capture screenshots, extract content, and run end-to-end test flows.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-playwright`

---

## What You Can Do

This MCP server gives AI agents access to Playwright via 9 tools. Connect it to any Aerostack workspace and your agents can interact with Playwright directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `fetch_page` | Fetch a web page and return its rendered HTML content after JavaScript execution |
| `fetch_page_text` | Fetch a web page and return only its visible text content (no HTML tags) |
| `extract_links` | Extract all links from a web page with their text and href |
| `extract_structured` | Extract structured data from a page using CSS selectors |
| `extract_tables` | Extract HTML tables from a page as arrays of row objects |
| `screenshot` | Take a screenshot of a web page (returns base64 PNG) |
| `screenshot_element` | Take a screenshot of a specific element on a page |
| `evaluate_js` | Execute JavaScript on a page and return the result |
| `get_page_metadata` | Get page title, meta tags, Open Graph data, and canonical URL |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Playwright"** and click **Add to Workspace**

Once added, every AI agent in your workspace can use Playwright tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-playwright \
  -H 'Content-Type: application/json' \
 \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"fetch_page","arguments":{}}}'
```

## License

MIT
