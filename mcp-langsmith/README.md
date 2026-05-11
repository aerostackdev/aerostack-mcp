# mcp-langsmith — Langsmith MCP Server

> LLM observability and tracing via LangSmith — list projects, query traces, view feedback, and monitor AI runs.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-langsmith`

---

## What You Can Do

This MCP server gives AI agents access to Langsmith via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Langsmith directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List LangSmith projects (repos/tracing sessions) in your workspace. Each project groups related LLM runs for observability. |
| `create_project` | Create a new LangSmith project for grouping LLM runs and traces. |
| `list_runs` | List LLM runs (traces) in a LangSmith project. Returns inputs, outputs, latency, and token usage for each run. |
| `get_run` | Get detailed information about a specific LangSmith run including full inputs, outputs, error info, and child runs. |
| `list_datasets` | List evaluation datasets in your LangSmith workspace for testing and benchmarking LLM applications. |
| `create_dataset` | Create a new evaluation dataset in LangSmith for storing input/output examples to benchmark your LLM. |
| `list_examples` | List examples (test cases) in a LangSmith evaluation dataset. |
| `create_example` | Add a new input/output example to a LangSmith evaluation dataset for benchmarking. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `LANGSMITH_API_KEY` | Yes | Your LANGSMITH API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Langsmith"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `LANGSMITH_API_KEY`

Once added, every AI agent in your workspace can use Langsmith tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-langsmith \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LANGSMITH-API-KEY: your-langsmith-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

## License

MIT
