# mcp-gemini — Gemini MCP Server

> Google Gemini AI — generate content, embed text, count tokens, and run system-instructed completions.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-gemini`

---

## What You Can Do

This MCP server gives AI agents access to Gemini via 6 tools. Connect it to any Aerostack workspace and your agents can interact with Gemini directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `generate_content` | Generate content using a Gemini model. Supports text generation with optional temperature and token controls. Default model is gemini-2.0-flash. |
| `list_models` | List all available Gemini models with their capabilities, token limits, and supported generation methods. |
| `get_model` | Get detailed information about a specific Gemini model including token limits and supported methods. |
| `count_tokens` | Count the number of tokens in a prompt without generating a response. Useful for estimating costs. |
| `embed_content` | Generate text embeddings using text-embedding-004 model. Returns a 768-dimensional embedding vector for semantic search, clustering, or similarity tasks. |
| `generate_with_system` | Generate content with a system instruction that sets the model persona and context. More powerful than a regular system prompt in many use cases. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Your GEMINI API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Gemini"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `GEMINI_API_KEY`

Once added, every AI agent in your workspace can use Gemini tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-gemini \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GEMINI-API-KEY: your-gemini-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"generate_content","arguments":{}}}'
```

## License

MIT
