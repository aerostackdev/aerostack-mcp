# mcp-mistral — Mistral MCP Server

> Chat with Mistral's frontier models, embed text, fill in code with Codestral, and manage fine-tuning jobs to train custom models on your data.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-mistral`

---

## What You Can Do

This MCP server gives AI agents access to Mistral via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Mistral directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `chat` | Send messages to a Mistral model and receive a response. Supports multi-turn conversations, system prompts, and JSON mode |
| `embed` | Generate text embeddings using Mistral Embed model for semantic search and similarity tasks |
| `fill_in_middle` | Fill in the middle of code using Codestral — provide prefix and suffix code, get completion |
| `list_models` | List all available Mistral models including fine-tuned and base models |
| `get_model` | Get details about a specific Mistral model by its ID |
| `upload_file` | Upload a file to Mistral for use in fine-tuning jobs. Returns a file ID |
| `list_files` | List all uploaded files in your Mistral account |
| `delete_file` | Delete an uploaded file from your Mistral account |
| `create_fine_tuning_job` | Create a fine-tuning job to train a custom Mistral model on your data |
| `list_fine_tuning_jobs` | List all fine-tuning jobs with their status, model, and created date |
| `get_fine_tuning_job` | Get details and current status of a specific fine-tuning job |
| `cancel_fine_tuning_job` | Cancel a running fine-tuning job |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MISTRAL_API_KEY` | Yes | Your Mistral API key — found at console.mistral.ai/api-keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Mistral"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `MISTRAL_API_KEY`

Once added, every AI agent in your workspace can use Mistral tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-mistral \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MISTRAL-API-KEY: your-mistral-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"chat","arguments":{}}}'
```

## License

MIT
