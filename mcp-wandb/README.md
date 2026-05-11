# mcp-wandb — Wandb MCP Server

> ML experiment tracking via Weights & Biases — list runs, log metrics, compare experiments, and manage model artifacts.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-wandb`

---

## What You Can Do

This MCP server gives AI agents access to Wandb via 6 tools. Connect it to any Aerostack workspace and your agents can interact with Wandb directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all W&B projects for the configured entity (user or organization). Uses GraphQL API. |
| `get_run` | Get details about a specific W&B run including config, summary metrics, and tags. |
| `list_runs` | List all runs in a W&B project with their status, config, and summary metrics. |
| `get_run_summary` | Get sampled metric history for a W&B run — useful for plotting training curves and performance over time. |
| `list_artifacts` | List artifacts (datasets, models, checkpoints) stored in a W&B project. |
| `get_artifact` | Get details about a specific W&B artifact version including files, metadata, and lineage. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `WANDB_API_KEY` | Yes | Your WANDB API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Wandb"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `WANDB_API_KEY`

Once added, every AI agent in your workspace can use Wandb tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-wandb \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-WANDB-API-KEY: your-wandb-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

## License

MIT
