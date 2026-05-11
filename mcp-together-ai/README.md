# mcp-together-ai — Together AI MCP Server

> Run open-source LLMs, generate embeddings, create images, and fine-tune models using Together AI's inference platform.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-together-ai`

---

## What You Can Do

This MCP server gives AI agents access to Together AI via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Together AI directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `chat` | Send messages to any Together AI chat model (Llama, Mistral, Qwen, etc.) and receive a response. OpenAI-compatible interface |
| `complete` | Text completion (non-chat) for any Together AI base model. Send a prompt and receive a completion |
| `embed` | Generate text embeddings for semantic search and similarity using Together AI embedding models |
| `generate_image` | Generate images from text prompts using Together AI image models like FLUX |
| `list_models` | List all available Together AI models with type, pricing, and context length information |
| `get_model` | Get detailed information about a specific Together AI model by its ID |
| `upload_file` | Upload a file to Together AI for use in fine-tuning jobs. Pass content as base64 |
| `list_files` | List all uploaded files in your Together AI account |
| `delete_file` | Delete an uploaded file from your Together AI account |
| `create_fine_tuning_job` | Start a fine-tuning job to train a custom model on Together AI with your data |
| `list_fine_tuning_jobs` | List all fine-tuning jobs in your Together AI account |
| `get_fine_tuning_job` | Get the current status and details of a specific fine-tuning job |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `TOGETHER_API_KEY` | Yes | Together AI API key from https://api.together.xyz/settings/api-keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Together AI"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `TOGETHER_API_KEY`

Once added, every AI agent in your workspace can use Together AI tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-together-ai \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TOGETHER-API-KEY: your-together-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"chat","arguments":{}}}'
```

## License

MIT
