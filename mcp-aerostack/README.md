# mcp-aerostack — Aerostack Developer MCP

> Turn any AI coding agent into a full-stack Aerostack developer. Build bots, workflows, AI endpoints, and edge functions — all through conversation.

Aerostack is a developer platform for building AI-native backends on the edge. This MCP server gives your AI agent (Claude Code, Cursor, Windsurf, or any MCP-compatible tool) direct access to create, test, and deploy everything on the platform — bots for Telegram/Discord/WhatsApp/Slack, visual workflows with 16 node types, AI-powered API endpoints, smart webhooks, and custom TypeScript functions with full runtime access to Cache, Database, AI, Queue, Vector Search, and Storage.

Instead of clicking through a dashboard, just describe what you want: *"Build me a Telegram bot that answers customer questions from my Notion docs"* — and your AI agent handles the rest.

---

## What You Can Do

- **Build AI Bots** — Create and deploy bots for Telegram, Discord, WhatsApp, and Slack with LLM-powered workflows. Your agent walks you through getting platform tokens and wires everything up.
- **Design Workflows** — Compose visual workflows from 16 node types: LLM calls, conditional logic, loops, MCP tool invocations, code blocks, auth gates, scheduled messages, human handoffs, and more.
- **Write Custom Functions** — When no existing integration covers your use case, your agent writes a TypeScript function, deploys it to the edge, and wires it into your workflow. Functions have full access to Cache, Database, Storage, AI, Queue, and Vector Search.
- **Create AI Endpoints** — Expose any workflow as a REST API that accepts requests and returns AI-processed responses.
- **Set Up Smart Webhooks** — Receive webhooks from any service, process them with AI, and trigger automated actions.
- **Generate from Description** — Describe what you want in plain English. The `scaffold` tool analyzes your workspace, identifies what integrations exist, generates custom code for missing pieces, and produces a ready-to-deploy config.
- **Validate Before Deploy** — Catch workflow errors (disconnected nodes, missing fields, invalid edges), bot misconfigurations, and function code issues before they hit production.
- **Test Everything** — Run workflows with test inputs and get per-node execution logs showing exactly what happened at each step.

## Available Tools

| Tool | Description |
|------|-------------|
| `guide` | Get contextual help — platform setup instructions, workflow node schemas, credential requirements, runtime API docs. 15+ topics including Telegram/Discord/WhatsApp/Slack setup, all 16 node types, and custom function development. |
| `list` | List any resource in your account: bots, workflows, AI endpoints, smart webhooks, functions, workspace tools, or community templates. |
| `get` | Get full details of any resource — config, workflow graph, credential status, deployment state. |
| `create` | Create bots, workflows, endpoints, webhooks, or functions. Bot credentials are validated against the platform API and encrypted at rest. Functions are auto-deployed to the edge. |
| `update` | Update any resource with partial changes. Functions are auto-redeployed. Also sets workspace secrets (encrypted with AES-256-GCM). |
| `delete` | Delete resources with reference checking — won't delete a workflow that's used by an active bot. |
| `validate` | Pre-flight checks: workflow graph validation (disconnected nodes, missing fields, edge handles, 50-node limit), bot config verification, function code safety checks. |
| `test` | Execute a workflow with test input and get the full execution log. Test bots with sample messages. Invoke functions with test payloads. |
| `deploy` | Go live: register bot webhooks with Telegram/Discord/WhatsApp/Slack, publish workflows, push functions to the edge network, activate endpoints. |
| `scaffold` | The magic tool — describe what you want in natural language, and it generates the complete config: workflow graph, bot settings, custom function code, and a list of missing credentials to fill in. |

## Workflow Node Types (16)

Your AI agent can compose workflows from these building blocks:

| Node | Purpose | Edge Handles |
|------|---------|-------------|
| `trigger` | Entry point — captures incoming message/request | default |
| `llm_call` | Call an LLM with a prompt (supports `{{variable}}` interpolation) | default |
| `logic` | Conditional branching — if/else or switch/case | `true`/`false` or `case_0`/`case_1`/`default` |
| `mcp_tool` | Call any MCP tool from your workspace | default |
| `send_message` | Send a response to the user | default |
| `action` | Set variables, make HTTP requests, end conversation, or escalate to human | default or `approved`/`rejected`/`timeout` |
| `loop` | Iterate: for_each (arrays), count (N times), or while (condition) | `loop_body` / `loop_done` |
| `code_block` | Execute safe JavaScript with variable access | default |
| `auth_gate` | Verify identity via OTP or magic link (email/SMS) | `auth_verified` / `auth_failed` |
| `schedule_message` | Delay message delivery by minutes, hours, or days | default |
| `delegate_to_bot` | Route conversation to a specialist bot | default |
| `send_proactive` | Send a message to a different channel/user | default |

## Custom Functions — Runtime APIs

When your agent writes a custom function, it has access to the full Aerostack runtime:

| API | What It Does | Example |
|-----|-------------|---------|
| **Cache** | Key-value storage with TTL | `cache.set("key", value, { ttl: 3600 })` |
| **Database** | SQL queries | `db.query("SELECT * FROM users WHERE id = ?", [id])` |
| **Storage** | File and object storage | `storage.put("report.pdf", data)` |
| **AI** | LLM chat, embeddings, classification | `ai.chat({ model: "gpt-4o", messages: [...] })` |
| **Queue** | Async background job processing | `queue.send({ type: "process", data: {...} })` |
| **Vector Search** | Semantic search and RAG retrieval | `vector.query({ vector: [...], topK: 5 })` |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `AEROSTACK_API_KEY` | Yes | Account key for full API access (never expires) | [aerostack.dev](https://aerostack.dev) → **Settings** → **CLI Keys** → **Create Key**. Copy the full key including the `ak_` prefix. |

## Quick Start

### Add to Your Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Workspace
2. Click **Add MCP Server** → search for **"Aerostack"**
3. Enter your `AEROSTACK_API_KEY` (account key starting with `ak_`)
4. Copy your workspace URL and add it to your AI agent's MCP config

### Connect Your AI Agent

**Claude Code** (`.claude/mcp-config.json`):
```json
{
  "mcpServers": {
    "aerostack": {
      "url": "https://mcp.aerostack.dev/ws/YOUR_WORKSPACE_SLUG",
      "headers": {
        "Authorization": "Bearer YOUR_WORKSPACE_TOKEN"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`) — same format.

### Example Conversations

**Build a bot:**
```
You: "Build me a Telegram bot that answers customer questions from Notion docs"

Agent: → Checks workspace tools (finds Notion MCP)
       → Generates workflow: trigger → notion_search → llm_call → send_message
       → Asks for Telegram token
       → Creates bot + deploys to Telegram
```

**Write a custom function:**
```
You: "I need a function that calls the Stripe API to process refunds and caches the result"

Agent: → No Stripe MCP found
       → Writes TypeScript function using Cache + fetch
       → Deploys to edge
       → Wires into workflow as mcp_tool node
```

**Create an AI endpoint:**
```
You: "Create an API endpoint that takes a support ticket and returns a priority classification"

Agent: → Generates workflow: trigger → llm_call (classify) → logic (route) → action (set_variable)
       → Creates AI endpoint
       → Tests with sample ticket
       → Deploys
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/ws/YOUR_WORKSPACE \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_WORKSPACE_TOKEN' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "aerostack__guide",
      "arguments": { "topic": "start" }
    }
  }'
```

## Supported Platforms

| Platform | Credential | Validated Against |
|----------|-----------|------------------|
| Telegram | Bot token from @BotFather | `api.telegram.org/getMe` |
| Discord | Bot token from Developer Portal | `discord.com/api/v10/users/@me` |
| WhatsApp | Phone Number ID + Access Token | Meta Graph API |
| Slack | Bot User OAuth Token (`xoxb-`) | `slack.com/api/auth.test` |

All credentials are validated against the platform API before storage and encrypted at rest with AES-256-GCM.

## LLM Providers

| Provider | Models | Key Required? |
|----------|--------|--------------|
| Azure OpenAI | gpt-4o, gpt-4o-mini | No (platform key included) |
| Google Gemini | gemini-2.0-flash, gemini-1.5-pro | No (platform key included) |
| OpenAI | gpt-4o, gpt-4-turbo | Yes (BYOK) |
| Anthropic | claude-3.5-sonnet, claude-3-opus | Yes (BYOK) |
| Groq | llama-3-70b, mixtral-8x7b | Yes (BYOK) |

Platform keys (Azure + Gemini) are included — no API key needed to get started.

## License

MIT
