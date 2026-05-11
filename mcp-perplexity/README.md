# mcp-perplexity — Perplexity MCP Server

> Search the web, do deep research, and get AI-synthesized answers with citations using Perplexity AI's sonar models.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-perplexity`

---

## What You Can Do

This MCP server gives AI agents access to Perplexity via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Perplexity directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `search` | Search the web with Perplexity AI and get a synthesized answer with citations |
| `chat` | Chat with Perplexity AI with multi-turn conversation support and web search |
| `deep_research` | Perform deep multi-step research on a topic using Perplexity sonar-deep-research model |
| `search_with_reasoning` | Search with step-by-step reasoning using Perplexity sonar-reasoning model |
| `search_recent` | Search for recent news and information filtered by time range |
| `search_domains` | Search with domain filtering — include or exclude specific websites |
| `get_models` | Get a list of available Perplexity AI models with descriptions and pricing |
| `check_usage` | Check token usage by making a minimal request and returning usage info |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `PERPLEXITY_API_KEY` | Yes | Your PERPLEXITY API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Perplexity"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `PERPLEXITY_API_KEY`

Once added, every AI agent in your workspace can use Perplexity tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-perplexity \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PERPLEXITY-API-KEY: your-perplexity-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search","arguments":{}}}'
```

## License

MIT
