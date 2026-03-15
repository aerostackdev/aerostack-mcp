# mcp-anthropic — Anthropic MCP Server

> Give your AI agents direct access to Claude — send messages, run batches, manage models, and administer your Anthropic organization.

Anthropic's API powers some of the world's most capable AI models. This MCP server exposes the full Anthropic API surface to your agents: from sending individual messages and tool-calling conversations to processing thousands of requests in efficient batches and administering your organization's workspaces and API keys.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-anthropic`

---

## What You Can Do

- Send messages to Claude models with custom system prompts, temperature control, and stop sequences
- Build multi-turn tool-use conversations where Claude can invoke external functions
- Process large workloads efficiently with the Message Batches API (async, lower cost)
- Estimate token costs before sending requests to stay within budget
- Administer your Anthropic organization — list workspaces, API keys, and monitor usage

## Available Tools

| Tool | Description |
|------|-------------|
| create_message | Send a message to a Claude model and get a response with full parameter control |
| create_message_with_tools | Send a message with tool definitions so Claude can respond with tool use blocks |
| count_tokens | Count input tokens for a request without sending it — use to estimate cost |
| create_message_batch | Submit a batch of message requests for async processing — returns a batch ID |
| list_models | List all available Claude models with IDs and creation dates |
| get_model | Get details for a specific Claude model by ID |
| list_batches | List message batch jobs with status, request counts, and timestamps |
| get_batch | Get status and result URL for a specific message batch |
| cancel_batch | Cancel an in-progress message batch |
| list_workspaces | List all workspaces in your organization (Admin API key required) |
| get_usage | Get API usage and billing data for your organization (Admin API key required) |
| list_api_keys | List all API keys in your organization (Admin API key required) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| ANTHROPIC_API_KEY | Yes | Anthropic API key (standard or Admin) | [console.anthropic.com](https://console.anthropic.com) → API Keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Anthropic"** and click **Add to Workspace**
3. Add your `ANTHROPIC_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Claude models automatically — no per-user setup needed.

### Example Prompts

```
"Ask Claude to summarize this document using the claude-opus-4-5 model"
"Count how many tokens this conversation will use before sending it"
"Submit a batch of 500 classification requests and check the status"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-anthropic \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ANTHROPIC-API-KEY: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_message","arguments":{"messages":[{"role":"user","content":"Hello!"}]}}}'
```

## License

MIT
