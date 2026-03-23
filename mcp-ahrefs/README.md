# mcp-ahrefs — Ahrefs MCP Server

> Analyze domains, backlinks, keywords, organic traffic, and competitor data via Ahrefs.

Ahrefs is one of the most comprehensive SEO toolsets available, used by marketers and developers to research backlinks, track keyword rankings, audit sites, and analyze competitors. This MCP server lets your AI agents query Ahrefs data directly — turning your SEO platform into a live intelligence source for agent-driven content strategy, competitor analysis, and link building.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-ahrefs`

---

## What You Can Do

- Check Domain Rating (DR) and URL Rating (UR) to assess authority of any website or page
- Pull backlink profiles and referring domains to understand a site's link equity and find link building opportunities
- Discover what keywords a domain ranks for organically, including position, volume, and traffic estimates
- Run keyword difficulty checks for content planning — know how hard a keyword is to rank for before writing
- Find the top pages on any domain sorted by organic traffic to identify competitor content strategies

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Health check — verifies the Ahrefs API token is valid |
| `get_domain_rating` | Get the Domain Rating (DR) score for a target domain (0-100 scale) |
| `get_backlinks` | Get backlinks pointing to a target domain or URL with anchor text and attributes |
| `get_organic_keywords` | Get organic keywords that a domain ranks for with position, volume, and traffic |
| `get_domain_overview` | Get comprehensive domain overview: traffic, keywords, DR, referring domains |
| `get_url_rating` | Get the URL Rating (UR) score for a specific page (0-100 scale) |
| `get_referring_domains` | Get referring domains linking to a target with DR and backlink counts |
| `get_keyword_difficulty` | Get keyword difficulty score, volume, CPC, and click data for a keyword |
| `get_top_pages` | Get top pages for a domain sorted by organic traffic |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `AHREFS_API_TOKEN` | Yes | Ahrefs API v3 Bearer token | [ahrefs.com](https://ahrefs.com) → **Account** → **API** → generate an API token (requires an active Ahrefs subscription) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Ahrefs"** and click **Add to Workspace**
3. Add `AHREFS_API_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call Ahrefs tools automatically — no per-user setup needed.

### Example Prompts

```
"What's the Domain Rating for shopify.com?"
"Show me the top 10 organic keywords that stripe.com ranks for in the US"
"Find the top pages on vercel.com by organic traffic"
"How hard is it to rank for 'best project management tools'?"
"Get the referring domains linking to ahrefs.com/blog/"
"Give me a backlink overview of my competitor example.com"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-ahrefs \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AHREFS-API-TOKEN: your-ahrefs-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_domain_rating","arguments":{"target":"ahrefs.com"}}}'
```

## Security Notes

- Your Ahrefs API token is never stored by the MCP server. It is passed per-request via the `X-Mcp-Secret-AHREFS-API-TOKEN` header by the Aerostack gateway.
- The token requires an active Ahrefs subscription. API usage counts against your Ahrefs plan's row limits.
- All requests are made server-side from Cloudflare Workers — your token is never exposed to the client.

## License

MIT
