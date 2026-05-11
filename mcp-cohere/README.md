# mcp-cohere — Cohere MCP Server

> Generate text, embed documents for semantic search, rerank results, classify inputs, summarize content, and detect language using Cohere's enterprise AI platform.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-cohere`

---

## What You Can Do

This MCP server gives AI agents access to Cohere via 10 tools. Connect it to any Aerostack workspace and your agents can interact with Cohere directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `chat` | Send a message to a Cohere model and get a response. Supports multi-turn conversation history and optional grounding with documents |
| `embed` | Generate embeddings for a list of texts using Cohere Embed. Useful for semantic search and similarity comparison |
| `rerank` | Rerank a list of documents by relevance to a query. Returns documents sorted by relevance score |
| `classify` | Classify texts into categories using few-shot examples. Provide example texts and their labels |
| `generate` | Generate text completions using Cohere Generate (single-turn, lower latency than chat) |
| `tokenize` | Tokenize text and return the token IDs and token strings for a given Cohere model |
| `detokenize` | Convert token IDs back to text using a Cohere model tokenizer |
| `detect_language` | Detect the language of one or more text inputs |
| `summarize` | Summarize a document or long text using Cohere Summarize with configurable length and format |
| `list_models` | List all available Cohere models with their capabilities, context lengths, and pricing |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `COHERE_API_KEY` | Yes | Your Cohere API key — found at dashboard.cohere.com/api-keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Cohere"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `COHERE_API_KEY`

Once added, every AI agent in your workspace can use Cohere tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-cohere \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-COHERE-API-KEY: your-cohere-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"chat","arguments":{}}}'
```

## License

MIT
