# mcp-openai — OpenAI MCP Server

> Access GPT chat completions, DALL-E image generation, embeddings, and moderation from your AI agents.

OpenAI's API powers the most widely-used AI capabilities in production: chat completions with GPT-4, image generation with DALL-E, text embeddings for semantic search, and content moderation. This MCP server wraps all of them in a single endpoint — letting your Aerostack agents use OpenAI's models as tools within multi-agent workflows, or expose them directly to end users.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-openai`

---

## What You Can Do

- Compose multi-model pipelines where one agent calls GPT-4o to generate text, then another calls DALL-E to generate an image from that text
- Generate embeddings for documents to enable semantic search or RAG workflows without a separate embedding service
- Run content moderation on user-generated text before storing or displaying it
- Inspect available models and fine-tuning job status from your workspace

## Available Tools

| Tool | Description |
|------|-------------|
| `chat_completion` | Create a chat completion using OpenAI models (GPT-4o, GPT-4, GPT-3.5, etc.) |
| `list_models` | List all available OpenAI models |
| `create_embedding` | Create text embeddings for semantic search or similarity |
| `create_image` | Generate an image using DALL-E 3 |
| `create_moderation` | Check text for policy violations |
| `list_files` | List uploaded files associated with the API key |
| `list_fine_tuning_jobs` | List fine-tuning jobs and their status |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for all API calls | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → **Create new secret key** → copy the key (shown once) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"OpenAI"** and click **Add to Workspace**
3. Add your `OPENAI_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call OpenAI tools automatically — no per-user setup needed.

### Example Prompts

```
"Use GPT-4o to write a product description for the following feature list..."
"Generate a DALL-E image of a futuristic dashboard UI with dark theme and neon accents"
"Create an embedding for this text and return the vector: 'customer churn prediction'"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-openai \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-OPENAI-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"chat_completion","arguments":{"messages":[{"role":"user","content":"Say hello in one sentence."}]}}}'
```

## License

MIT
