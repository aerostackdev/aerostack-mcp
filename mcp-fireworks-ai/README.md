# mcp-fireworks-ai — Fireworks AI MCP Server

> Fast LLM inference via Fireworks AI — generate text, run chat completions, and access fine-tuned models at speed.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-fireworks-ai`

---

## What You Can Do

This MCP server gives AI agents access to Fireworks AI via 5 tools. Connect it to any Aerostack workspace and your agents can interact with Fireworks AI directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `chat_completion` | Fast chat completion using Fireworks AI. Supports Llama, Mixtral, and other open-source models with OpenAI-compatible API. Default model: llama-v3p1-8b-instruct. |
| `text_completion` | Raw text completion using Fireworks AI. Continues the provided prompt without chat formatting. |
| `create_embedding` | Generate text embeddings using Fireworks AI nomic-embed-text-v1.5. Returns dense vectors for semantic search, clustering, and similarity. |
| `list_models` | List all available models on Fireworks AI including chat, completion, embedding, and image generation models. |
| `image_generation` | Generate images using Stable Diffusion XL on Fireworks AI. Returns image URLs. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREWORKS_API_KEY` | Yes | Your FIREWORKS API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Fireworks AI"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `FIREWORKS_API_KEY`

Once added, every AI agent in your workspace can use Fireworks AI tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-fireworks-ai \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FIREWORKS-API-KEY: your-fireworks-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"chat_completion","arguments":{}}}'
```

## License

MIT
