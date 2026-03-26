# mcp-terraform — Terraform Cloud MCP Server

> Manage Terraform Cloud workspaces, runs, state, and variables from your AI agents.

Terraform Cloud is HashiCorp's managed service for infrastructure as code. This MCP server lets your AI agents list workspaces, trigger and inspect runs, browse state versions, and manage workspace variables — turning Terraform Cloud into a live infrastructure control plane for intelligent DevOps workflows.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-terraform`

---

## What You Can Do

- List and inspect workspaces across your Terraform Cloud organization
- Trigger new runs (plan or destroy) and check their status without opening the UI
- Browse state versions and inspect current state for any workspace
- Manage workspace variables — create, update, or mark as sensitive

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify API token connectivity (internal) |
| `list_workspaces` | List workspaces with optional name search |
| `get_workspace` | Get full details for a workspace by name |
| `list_runs` | List runs for a specific workspace |
| `get_run` | Get full details for a run by ID |
| `trigger_run` | Create and queue a new run for a workspace |
| `list_state_versions` | List state versions for a workspace |
| `get_current_state` | Get the current state version for a workspace |
| `list_variables` | List all variables for a workspace |
| `set_variable` | Create or update a variable in a workspace |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `TERRAFORM_API_TOKEN` | Yes | Team or User API token | [app.terraform.io](https://app.terraform.io) → **User Settings** → **Tokens** → **Create an API token** |
| `TERRAFORM_ORG` | Yes | Organization name | [app.terraform.io](https://app.terraform.io) → **Organizations** → copy org name from the URL or sidebar |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Terraform"** and click **Add to Workspace**
3. Add your API token and org name under **Project → Secrets**

Once added, every AI agent in your workspace can call Terraform Cloud tools automatically — no per-user setup needed.

### Example Prompts

```
"List all workspaces in my Terraform organization"
"Show me the last 5 runs for workspace production-infra"
"Trigger a plan run on workspace staging-vpc with message 'Testing new subnet'"
"What's the current state version for workspace prod-database?"
"Set variable AWS_REGION to us-west-2 in workspace production-infra"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-terraform \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TERRAFORM-API-TOKEN: your-api-token' \
  -H 'X-Mcp-Secret-TERRAFORM-ORG: your-org-name' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_workspaces","arguments":{"search":"production"}}}'
```

## License

MIT
