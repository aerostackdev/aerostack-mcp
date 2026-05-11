# mcp-replicate — Replicate MCP Server

> Run any AI model on Replicate — image generation, video, audio, language models — and manage predictions, deployments, and your model library.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-replicate`

---

## What You Can Do

This MCP server gives AI agents access to Replicate via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Replicate directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `run_model` | Run a Replicate model with a specific version and inputs. Returns prediction output or a prediction ID for async polling |
| `get_prediction` | Get the current status and output of a prediction by its ID |
| `cancel_prediction` | Cancel a prediction that is currently queued or in progress |
| `list_predictions` | List your recent predictions with status, model, and output URLs |
| `get_model` | Get details about a Replicate model: description, visibility, run count, and latest version |
| `list_model_versions` | List all available versions of a Replicate model with their creation dates and OpenAPI schemas |
| `get_model_version` | Get the OpenAPI input/output schema for a specific model version |
| `search_models` | Search Replicate public models by keyword, returning name, description, run count, and latest version |
| `list_deployments` | List your Replicate deployments (dedicated hosted model instances) |
| `create_deployment_prediction` | Run a prediction on a specific named deployment (useful for consistent latency with dedicated compute) |
| `get_account` | Get your Replicate account information: username, name, and account type |
| `create_model` | Create a new model on Replicate with a specified owner, name, visibility, and hardware |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `REPLICATE_API_TOKEN` | Yes | Your Replicate API token — found at replicate.com/account/api-tokens |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Replicate"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `REPLICATE_API_TOKEN`

Once added, every AI agent in your workspace can use Replicate tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-replicate \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-REPLICATE-API-TOKEN: your-replicate-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"run_model","arguments":{}}}'
```

## License

MIT
