# mcp-firecrawl — Firecrawl Web Scraping MCP Server

> Scrape web pages, crawl entire sites, extract structured data, and search the web — AI-native web data extraction for RAG pipelines.

Give your AI agents the ability to read any web page. Scrape JavaScript-rendered pages to clean markdown, crawl entire sites with depth control, extract structured data with natural language prompts, discover all URLs on a domain, and search the web with scraped results — perfect for RAG, research, and data pipelines.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-firecrawl`

---

## What You Can Do

- Scrape any web page to clean markdown (handles JS-rendered content)
- Crawl entire websites with configurable depth and path filters
- Extract structured data using natural language or JSON schema
- Map all URLs on a website (sitemap discovery)
- Search the web and get scraped content from top results
- Get page metadata, links, and optional screenshots

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify Firecrawl API connectivity |
| `scrape` | Scrape a page to markdown/HTML with JS rendering support |
| `crawl` | Start an async crawl of an entire site (returns job ID) |
| `crawl_status` | Check crawl progress and retrieve results |
| `map` | Discover all URLs on a website without scraping |
| `extract` | Extract structured data using prompts or JSON schema |
| `search` | Search the web and return scraped content from results |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `FIRECRAWL_API_KEY` | Yes | Firecrawl API Key | firecrawl.dev → Sign up → Dashboard → API Keys → Copy key |

> **Free tier:** 500 credits/month. Each scrape = 1 credit, crawl = 1 credit per page. See firecrawl.dev/pricing for details.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Firecrawl"** and click **Add to Workspace**
3. Add `FIRECRAWL_API_KEY` under **Project → Secrets**

### Example Prompts

```
"Scrape the Hacker News front page and summarize the top stories"
"Crawl docs.example.com up to depth 3 and include only /api/* paths"
"Extract all product names and prices from this product listing page"
"Map all URLs on stripe.com/docs"
"Search the web for 'best practices for RAG pipelines 2026' and summarize"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-firecrawl \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FIRECRAWL-API-KEY: fc-xxxxxxxxxxxx' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"scrape","arguments":{"url":"https://example.com"}}}'
```

## Security Notes

- Firecrawl API keys are injected at the Aerostack gateway layer — never stored in the worker
- HTML content is truncated to 50KB to prevent oversized responses
- Crawl results are async — start with `crawl` then poll with `crawl_status`
- Firecrawl handles robots.txt and rate limiting on the target sites

## License

MIT
