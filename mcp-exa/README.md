# mcp-exa — Exa MCP Server

> Semantic web search, page scraping, and similarity discovery for AI agents.

Exa is a search engine built for AI — it understands meaning, not just keywords. This MCP server lets your AI agents search the web semantically, scrape full page contents, and find similar pages to any URL. Perfect for RAG pipelines, research agents, competitive analysis, and content discovery workflows.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-exa`

---

## What You Can Do

- Search the web using natural language queries with semantic understanding — far better than keyword matching for AI use cases
- Scrape and extract clean text from any web page, with optional highlights and AI-generated summaries
- Find pages similar to a given URL for competitive research, alternative discovery, or content clustering
- Combine search + scrape in a single call to build RAG pipelines with minimal latency
- Filter results by domain, date range, and content category (news, research papers, GitHub repos, tweets, etc.)

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify Exa API connectivity (used internally by Aerostack) |
| `search` | Semantic or keyword web search with filters for domains, dates, and categories |
| `get_contents` | Get full text, highlights, or summaries from one or more URLs |
| `find_similar` | Find web pages similar to a given URL |
| `search_and_contents` | Combined search + content extraction in one call |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `EXA_API_KEY` | Yes | Exa API key for authentication | [dashboard.exa.ai](https://dashboard.exa.ai) → **API Keys** → create or copy key |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Exa"** and click **Add to Workspace**
3. Add `EXA_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Exa tools automatically — no per-user setup needed.

### Example Prompts

```
"Find recent research papers about transformer architectures published in 2024"
"Get the full text content of https://example.com/article"
"Find pages similar to https://stripe.com/docs/api"
"Search for AI startups and give me a summary of each result"
"Find news about Cloudflare Workers from the last 7 days"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-exa \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-EXA-API-KEY: your-exa-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search","arguments":{"query":"best practices for RAG pipelines","num_results":5}}}'
```

## License

MIT
