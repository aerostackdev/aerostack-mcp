# mcp-n8n — n8n Workflow Automation MCP Server

> List, trigger, and manage n8n workflows — execute automations, check execution status, and manage credentials from any agent.

n8n is the open-source workflow automation platform that connects hundreds of services. This MCP server gives your AI agents the ability to list workflows, trigger executions with input data, monitor execution status, and inspect credentials and tags — making n8n a powerful automation backend for any AI-driven workflow.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-n8n`

---

## What You Can Do

- Trigger n8n workflows on demand from any agent conversation — pass input data and get execution results back
- List and inspect workflows to understand what automations are available before triggering them
- Monitor execution history to check if workflows succeeded, failed, or are still running
- Activate or deactivate workflows to control which automations are live without opening the n8n UI
- List credentials and tags to understand what integrations and organization are configured

## Setup (Important — read before using)

### Step 1: Enable the n8n API

The n8n REST API must be enabled on your instance.

**Self-hosted n8n:**
Set the environment variable `N8N_PUBLIC_API_ENABLED=true` (enabled by default on most installations).

**n8n Cloud:**
The API is enabled by default. Go to **Settings** → **API** to verify.

### Step 2: Create an API Key

1. Open your n8n instance → **Settings** → **API**
2. Click **Create API Key**
3. Copy the generated key (starts with `n8n_api_...` on newer versions)

### Step 3: Add to Aerostack Workspace

1. Go to your Aerostack workspace → **Add Server** → search **"n8n"**
2. Enter your secrets when prompted:
   - `N8N_API_URL` — Your n8n instance URL (e.g., `https://n8n.example.com` or `https://your-instance.app.n8n.cloud`)
   - `N8N_API_KEY` — The API key from Step 2
3. Click **Test** to verify the connection

## Available Tools

| Tool | Description |
|------|-------------|
| `list_workflows` | List all workflows with optional active/inactive filter |
| `get_workflow` | Get full workflow details including nodes and connections |
| `activate_workflow` | Activate a workflow so its triggers start firing |
| `deactivate_workflow` | Deactivate a workflow to stop its triggers |
| `execute_workflow` | Trigger a workflow execution with optional input data |
| `list_executions` | List recent executions with optional workflow and status filters |
| `get_execution` | Get full execution details including per-node results |
| `list_credentials` | List configured credentials (names and types only — secrets never exposed) |
| `get_tags` | List all tags used to organize workflows |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `N8N_API_URL` | Yes | Your n8n instance base URL (e.g., `https://n8n.example.com`) |
| `N8N_API_KEY` | Yes | n8n API key from Settings → API |

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `n8n API 401` | Invalid or expired API key | Generate a new API key in n8n Settings → API |
| `n8n API 403` | API key lacks permissions | Ensure the API key owner has admin access |
| `n8n API 404` | Wrong base URL or workflow ID doesn't exist | Verify `N8N_API_URL` points to your n8n instance (not a subpath) |
| `fetch failed` | n8n instance is unreachable | Verify your n8n instance is running and accessible from the internet |
| `Missing N8N_API_URL secret` | Secret not configured in Aerostack | Add `N8N_API_URL` to your workspace secrets |

## Example Prompts

```
"List all active n8n workflows"
"Trigger the 'Daily Report' workflow with today's date as input"
"Show me the last 10 executions for workflow 42 — did any fail?"
"Deactivate the onboarding workflow while we fix the email template"
"What credentials are configured in n8n?"
```

## Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-n8n \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-N8N-API-URL: https://n8n.example.com' \
  -H 'X-Mcp-Secret-N8N-API-KEY: n8n_api_your-key-here' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_workflows","arguments":{"active":true}}}'
```

## License

MIT
