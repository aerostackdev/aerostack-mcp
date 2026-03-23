# mcp-huggingface — Hugging Face MCP Server

> Search models, datasets, and Spaces on Hugging Face — browse trending AI models, check downloads, and run inference from any agent.

Give your AI agents access to the largest open-source AI model hub. Search 900K+ models and 200K+ datasets, inspect model cards and configs, browse Spaces, list repository files, and run serverless inference — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-huggingface`

---

## What You Can Do

- Search models by keyword, task, library, or author
- Get model details with tags, downloads, safetensors info, and model card
- Search datasets by keyword or author with download stats
- Browse Spaces (apps/demos) with SDK info and status
- Run serverless inference on any supported model
- List files in model repositories with LFS details

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify HF connectivity and show authenticated user |
| `search_models` | Search models by keyword, task, library, author |
| `get_model` | Get model details — tags, config, downloads, model card |
| `search_datasets` | Search datasets by keyword or author |
| `get_dataset` | Get dataset details — card, splits, features, downloads |
| `search_spaces` | Search Spaces (apps) by keyword |
| `run_inference` | Run inference on a model via serverless Inference API |
| `list_model_files` | List files in a model repo with sizes and LFS info |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `HUGGINGFACE_TOKEN` | Yes | Hugging Face User Access Token with read permissions | huggingface.co → Settings → Access Tokens → New token → select "Read" or "Fine-grained" |

> **For inference:** Your token needs `Inference` permission. Some models (gated) require accepting terms on the model page first.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Hugging Face"** and click **Add to Workspace**
3. Add `HUGGINGFACE_TOKEN` under **Project → Secrets**

### Example Prompts

```
"Search for the most popular text-generation models"
"Show me details about meta-llama/Llama-3-8B-Instruct"
"Find datasets related to code generation"
"What are the trending Spaces right now?"
"Run inference on meta-llama/Llama-3-8B-Instruct: 'Explain quantum computing in one sentence'"
"List the files in the stabilityai/stable-diffusion-xl-base-1.0 model"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-huggingface \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-HUGGINGFACE-TOKEN: hf_xxxxxxxxxxxx' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_models","arguments":{"query":"text-generation","sort":"downloads","limit":10}}}'
```

## Security Notes

- HF tokens are injected at the Aerostack gateway layer — never stored in the worker
- Inference API has rate limits based on your HF plan (free tier: limited, Pro: higher)
- Gated models require accepting terms on the model page before inference works
- Some models may not be available for serverless inference — check model page for availability

## License

MIT
