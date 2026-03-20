/**
 * Guide content for the `guide` tool.
 * This is the contextual knowledge layer — teaches AI agents how to build on Aerostack
 * without loading heavy schemas upfront.
 */

export const GUIDES: Record<string, string> = {
  // ── Overview ─────────────────────────────────────────────────────
  start: `# Aerostack — What You Can Build

Aerostack is a developer platform for building AI-native backends. Here's what you can create:

## 1. Bots (Telegram, Discord, WhatsApp, Slack)
Hosted AI bots with LLM + MCP tool orchestration. Each bot has a visual workflow that defines its behavior.
→ Use guide("telegram_setup") or guide("discord_setup") for platform setup.

## 2. Workflows
Visual graphs of connected nodes (LLM calls, logic, tool invocations, loops, etc.). 16 node types available.
→ Use guide("node:llm_call") to learn about specific node types.

## 3. AI Endpoints
REST API agents — send a request, get an AI-processed response. Powered by workflows.

## 4. Smart Webhooks
Receive webhooks from any service, process with AI, and trigger actions.

## 5. Custom Functions
Write TypeScript functions deployed to the edge. Full access to Aerostack runtime:
- **Cache** — key-value storage (get/set/delete with TTL)
- **Database** — SQL queries
- **Storage** — file/object storage
- **AI** — LLM chat, embeddings, classification
- **Queue** — async job processing
- **Vector Search** — semantic search and RAG

→ Use guide("functions") for the full runtime API.

## Quick Start
1. Use the \`list\` tool to see what's in your account
2. Use \`scaffold\` to generate a complete resource from a description
3. Use \`create\` to build it
4. Use \`test\` to verify
5. Use \`deploy\` to go live`,

  // ── Platform Setup Guides ────────────────────────────────────────
  telegram_setup: `# Telegram Bot Setup

## Get Your Bot Token
1. Open Telegram and search for @BotFather
2. Send /newbot
3. Choose a display name (e.g. "My Support Bot")
4. Choose a username (must end in "bot", e.g. "my_support_bot")
5. BotFather gives you a token like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz

## Use in Aerostack
Provide the token when creating a bot:
\`\`\`json
{
  "type": "bot",
  "config": {
    "name": "My Support Bot",
    "platform": "telegram",
    "platform_config": { "bot_token": "YOUR_TOKEN_HERE" },
    "llm_provider": "azure",
    "llm_model": "gpt-4o"
  }
}
\`\`\`

The token is validated against Telegram's API and encrypted at rest. Never stored in plaintext.

## Optional: Set Commands
After creating the bot, you can set commands in BotFather with /setcommands.`,

  discord_setup: `# Discord Bot Setup

## Get Your Bot Token
1. Go to https://discord.com/developers/applications
2. Click "New Application" → name it
3. Go to "Bot" tab → click "Reset Token" → copy the token
4. Under "Privileged Gateway Intents", enable:
   - Message Content Intent
   - Server Members Intent (if needed)
5. Go to "OAuth2" → "URL Generator":
   - Scopes: bot, applications.commands
   - Permissions: Send Messages, Read Message History, Embed Links
6. Copy the invite URL and add the bot to your server

## Use in Aerostack
\`\`\`json
{
  "type": "bot",
  "config": {
    "name": "My Discord Bot",
    "platform": "discord",
    "platform_config": { "bot_token": "YOUR_TOKEN_HERE" },
    "llm_provider": "azure",
    "llm_model": "gpt-4o"
  }
}
\`\`\``,

  whatsapp_setup: `# WhatsApp Bot Setup

## Prerequisites
- Meta Business Account
- WhatsApp Business Platform access

## Get Your Credentials
1. Go to https://developers.facebook.com
2. Create an app → select "Business" type
3. Add "WhatsApp" product
4. Go to WhatsApp → API Setup
5. Copy: Phone Number ID and Temporary Access Token
6. For production: generate a permanent System User Token

## Use in Aerostack
\`\`\`json
{
  "type": "bot",
  "config": {
    "name": "My WhatsApp Bot",
    "platform": "whatsapp",
    "platform_config": {
      "phone_number_id": "YOUR_PHONE_NUMBER_ID",
      "access_token": "YOUR_ACCESS_TOKEN"
    },
    "llm_provider": "azure",
    "llm_model": "gpt-4o"
  }
}
\`\`\`

Note: WhatsApp requires HTTPS webhook URL. Aerostack handles this automatically when you deploy.`,

  slack_setup: `# Slack Bot Setup

## Get Your Bot Token
1. Go to https://api.slack.com/apps → "Create New App"
2. Choose "From scratch" → name it → select workspace
3. Go to "OAuth & Permissions":
   - Add Bot Token Scopes: chat:write, channels:history, groups:history, im:history, users:read
4. Click "Install to Workspace" → authorize
5. Copy the "Bot User OAuth Token" (starts with xoxb-)
6. Go to "Event Subscriptions" → enable → Aerostack provides the webhook URL after deploy

## Use in Aerostack
\`\`\`json
{
  "type": "bot",
  "config": {
    "name": "My Slack Bot",
    "platform": "slack",
    "platform_config": { "bot_token": "xoxb-YOUR-TOKEN" },
    "llm_provider": "azure",
    "llm_model": "gpt-4o"
  }
}
\`\`\``,

  llm_keys: `# LLM Provider Setup

## Available Providers

| Provider | Models | How to Get Key |
|----------|--------|----------------|
| Azure OpenAI | gpt-4o, gpt-4o-mini | Azure Portal → Cognitive Services → Keys |
| Google Gemini | gemini-2.0-flash, gemini-1.5-pro | aistudio.google.com → Get API Key |
| Anthropic | claude-3.5-sonnet, claude-3-opus | console.anthropic.com → API Keys |
| Groq | llama-3-70b, mixtral-8x7b | console.groq.com → API Keys |
| OpenAI | gpt-4o, gpt-4-turbo | platform.openai.com → API Keys |

## Two Modes

### Platform Keys (default)
Aerostack provides Azure GPT-4o and Gemini out of the box. No API key needed.
Cost is included in your Aerostack plan.

### BYOK (Bring Your Own Key)
Provide your own API key for any provider. You pay the provider directly.
Set the key when creating a bot:
\`\`\`json
{ "llm_provider": "openai", "llm_model": "gpt-4o", "llm_api_key": "sk-..." }
\`\`\`
Key is encrypted at rest (AES-GCM). Never stored in plaintext.`,

  // ── Functions Guide ──────────────────────────────────────────────
  functions: `# Custom Functions

Write TypeScript functions deployed to Aerostack's edge network. Use when no existing MCP tool covers your integration.

## Runtime APIs

Your function has access to the full Aerostack runtime:

| API | Import | Example |
|-----|--------|---------|
| **Cache** | \`cache.get/set/delete\` | \`await cache.set("key", value, { ttl: 3600 })\` |
| **Database** | \`db.query\` | \`await db.query("SELECT * FROM users WHERE id = ?", [id])\` |
| **Storage** | \`storage.put/get/delete\` | \`await storage.put("file.pdf", data)\` |
| **AI** | \`ai.chat/embed\` | \`await ai.chat({ model: "gpt-4o", messages: [...] })\` |
| **Queue** | \`queue.send\` | \`await queue.send({ type: "process", data: {...} })\` |
| **Vector Search** | \`vector.query/insert\` | \`await vector.query({ vector: [...], topK: 5 })\` |

## Function Template
\`\`\`typescript
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const body = await request.json();

    // Your logic here — use env bindings for Cache, AI, etc.

    return Response.json({ success: true, data: { result: "..." } });
  }
};
\`\`\`

## Response Format (required)
\`\`\`json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
\`\`\`

## Deploy Flow
1. Use \`create\` with type "function" and your code
2. Use \`test\` to invoke with a sample payload
3. Function is auto-deployed to the edge — gets a URL you can use in workflows`,

  workspace_tools: `# Workspace Tools

A Workspace in Aerostack composes multiple MCP servers into one URL. Each MCP server exposes tools that your bots, workflows, and AI endpoints can call.

## What's Available
Use \`list({ type: "workspace_tools" })\` to see all tools in your workspace.

Common MCP servers: GitHub, Slack, Notion, Google Calendar, Discord, Stripe, Cloudflare, and 40+ more.

## Using in Workflows
Add an \`mcp_tool\` node to your workflow:
\`\`\`json
{
  "type": "mcp_tool",
  "data": {
    "toolName": "search_pages",
    "arguments": "{ \\"query\\": \\"{{user_message}}\\" }",
    "outputVariable": "search_results"
  }
}
\`\`\`

## Adding New MCP Servers
MCP servers are added to your workspace via the Aerostack dashboard. Each may require its own credentials (API keys, OAuth tokens) — set these as workspace secrets.`,

  // ── Node Type Guides ─────────────────────────────────────────────
  "node:trigger": `# trigger Node
Entry point of every workflow. Captures the incoming message or request.

**Data:** (none required)
**Output:** The trigger text/payload
**Edges out:** default (one output)
**Variables set:** \`user_message\`, \`user_name\`, \`channel_id\`

Example:
\`\`\`json
{ "id": "t1", "type": "trigger", "data": {} }
\`\`\``,

  "node:llm_call": `# llm_call Node
Call an LLM with a prompt. Supports variable interpolation with {{varName}}.

**Data:**
- \`prompt\` (string, required) — system/user prompt with {{variables}}
- \`model\` (string, optional) — override model (e.g. "gpt-4o", "gemini-2.0-flash")
- \`outputVariable\` (string, optional) — store response in this variable

**Output:** LLM response text
**Edges out:** default
**Tracks:** tokens_input, tokens_output, cost_cents

Example:
\`\`\`json
{
  "id": "llm1", "type": "llm_call",
  "data": { "prompt": "Summarize this: {{user_message}}", "outputVariable": "summary" }
}
\`\`\``,

  "node:logic": `# logic Node
Conditional branching. Two modes: if_else and switch.

## if_else Mode
**Data:**
- \`mode\`: "if_else"
- \`conditions\`: [{ "variable": "sentiment", "operator": "equals", "value": "negative" }]

**Edges out:** "true" or "false"

## switch Mode
**Data:**
- \`mode\`: "switch"
- \`variable\`: variable name to switch on
- \`cases\`: [{ "value": "bug", "label": "Bug Report" }, { "value": "feature", "label": "Feature Request" }]

**Edges out:** "case_0", "case_1", ..., "default"

Operators: equals, not_equals, contains, not_contains, greater_than, less_than, is_empty, is_not_empty

Example:
\`\`\`json
{
  "id": "cond1", "type": "logic",
  "data": { "mode": "if_else", "conditions": [{ "variable": "score", "operator": "greater_than", "value": "0.8" }] }
}
\`\`\``,

  "node:mcp_tool": `# mcp_tool Node
Invoke any MCP tool from the workspace. Use \`list({ type: "workspace_tools" })\` to see available tools.

**Data:**
- \`toolName\` (string, required) — tool name, e.g. "search_pages"
- \`arguments\` (string, required) — JSON with {{variable}} interpolation
- \`outputVariable\` (string, optional) — store result in variable

**Output:** Tool result (truncated to 3000 chars)
**Edges out:** default

Example:
\`\`\`json
{
  "id": "tool1", "type": "mcp_tool",
  "data": {
    "toolName": "search_pages",
    "arguments": "{ \\"query\\": \\"{{user_message}}\\" }",
    "outputVariable": "docs"
  }
}
\`\`\``,

  "node:send_message": `# send_message Node
Send a text message to the user. Supports {{variable}} interpolation.

**Data:**
- \`message\` (string, optional) — template text. If omitted, sends the \`ai_response\` variable.

**Output:** The sent message
**Edges out:** default

Example:
\`\`\`json
{
  "id": "msg1", "type": "send_message",
  "data": { "message": "Here's what I found: {{summary}}" }
}
\`\`\``,

  "node:action": `# action Node
Multi-purpose action node. Subtypes:

## set_variable
\`\`\`json
{ "action_type": "set_variable", "variable_name": "count", "variable_value": "0" }
\`\`\`

## http_request
\`\`\`json
{ "action_type": "http_request", "url": "https://api.example.com/data", "method": "POST", "headers": "{}", "body": "{{payload}}", "outputVariable": "api_result" }
\`\`\`
Timeout: 10 seconds.

## end_conversation
\`\`\`json
{ "action_type": "end_conversation" }
\`\`\`

## human_handoff
\`\`\`json
{ "action_type": "human_handoff", "handoff_message": "Escalating to support team" }
\`\`\`
Pauses workflow, notifies reviewers, resumes on approval/rejection.

**Edges out:** default (or "approved"/"rejected"/"timeout" for handoff)`,

  "node:loop": `# loop Node
Three loop modes. Max 100 iterations (safety limit).

## for_each
Iterate over an array variable:
\`\`\`json
{ "mode": "for_each", "arrayVariable": "items", "itemVariable": "current_item" }
\`\`\`

## count
Run N times:
\`\`\`json
{ "mode": "count", "count": 5, "counterVariable": "i" }
\`\`\`

## while
Loop while condition is true:
\`\`\`json
{ "mode": "while", "variable": "hasMore", "operator": "equals", "value": "true" }
\`\`\`

**Edges out:** "loop_body" (each iteration), "loop_done" (after loop completes)`,

  "node:code_block": `# code_block Node
Execute safe JavaScript. No eval/Function. Supports variable assignment, JSON parsing, string/array/math methods.

**Data:**
- \`code\` (string, required) — JS code to execute
- \`outputVariable\` (string, optional) — store result

**Output:** Return value of the code
**Edges out:** default

Example:
\`\`\`json
{
  "id": "code1", "type": "code_block",
  "data": {
    "code": "const items = JSON.parse(variables.raw_data); return items.filter(i => i.status === 'active').length;",
    "outputVariable": "active_count"
  }
}
\`\`\``,

  "node:auth_gate": `# auth_gate Node
Pause workflow and verify user identity via OTP or magic link.

**Data:**
- \`provider\` (string) — "resend", "ses", "twilio", "msg91", or "custom_http"
- \`method\` (string) — "otp" or "magic_link"
- \`destination_variable\` (string) — variable holding email/phone

**Edges out:** "auth_verified" (success), "auth_failed" (failure/timeout)

The workflow pauses until the user completes verification. Timeout: 15 minutes.`,

  "node:schedule_message": `# schedule_message Node
Delay a message delivery by a specified duration.

**Data:**
- \`delay\` (string) — "5 minutes", "2 hours", "1 day"
- \`message\` (string) — message template with {{variables}}

**Edges out:** default`,

  "node:delegate_to_bot": `# delegate_to_bot Node
Route the conversation to a specialist bot (for multi-bot teams).

**Data:**
- \`target_bot_id\` (string, required) — ID of the bot to delegate to
- \`context\` (string, optional) — context to pass to the target bot

**Edges out:** default`,

  "node:send_proactive": `# send_proactive Node
Send a message to a different channel/user (not the current conversation).

**Data:**
- \`channel_id\` (string, required) — target channel/user ID (supports {{variables}})
- \`message\` (string, required) — message template

Requires bot context. Used for notifications, alerts, cross-channel messaging.
**Edges out:** default`,

  "node:error_handler": `# error_handler Node (placeholder)
Catches errors from connected nodes. Not yet fully implemented — use try/catch patterns in code_block nodes instead.`,

  "node:parallel": `# parallel Node (placeholder)
Execute multiple branches simultaneously. Not yet fully implemented — use sequential execution for now.`,

  // ── Credentials Check ────────────────────────────────────────────
  credentials: `# Credentials Status

To check what's configured in your account, the guide tool will query the API and report:
- Connected platform credentials (Telegram, Discord, WhatsApp, Slack)
- LLM provider status (platform keys vs BYOK)
- Workspace MCP servers and their secrets
- Missing credentials that need to be set up

This is a live check — it calls the Aerostack API with your API key.`,
};
