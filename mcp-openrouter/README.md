# mcp-openrouter — Openrouter MCP Server

> Unified LLM routing via OpenRouter — access 200+ models from one API with automatic fallbacks and cost controls.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-openrouter`

---

## What You Can Do

This MCP server gives AI agents access to Openrouter via 5 tools. Connect it to any Aerostack workspace and your agents can interact with Openrouter directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `chat_completion` | Send a chat completion request through OpenRouter. Routes to the specified model across 100+ LLM providers. OpenAI-compatible format. |
| `list_models` | List all available models on OpenRouter with pricing per token, context length, and provider info. |
| `get_model` | Get detailed information about a specific OpenRouter model including pricing, context length, and capabilities. |
| `get_credits` | Get current API key credit balance, usage limits, and rate limit information for the OpenRouter account. |
| `get_generation` | Get details about a specific generation/completion including tokens used, model, cost, and the full response. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | Your OPENROUTER API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Openrouter"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `OPENROUTER_API_KEY`

Once added, every AI agent in your workspace can use Openrouter tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-openrouter \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-OPENROUTER-API-KEY: your-openrouter-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"chat_completion","arguments":{}}}'
```

## License

MIT
