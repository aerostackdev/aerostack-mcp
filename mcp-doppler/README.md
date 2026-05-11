# mcp-doppler — Doppler MCP Server

> Manage secrets, configs, and service tokens across all your Doppler environments from any AI agent.

Doppler is the industry-standard secrets manager used by thousands of engineering teams to manage environment variables across development, staging, and production. This MCP server gives your AI agents full access to the Doppler API: listing and updating secrets, managing projects and configs, creating service tokens, and auditing activity — without ever hard-coding credentials.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-doppler`

---

## What You Can Do

- Read and write secrets across any Doppler project and config from your AI agent
- Create, clone, and delete configs to manage environment branches programmatically
- Generate and revoke service tokens to give other services scoped access to secrets
- Download a full secrets bundle as JSON for bulk inspection or migration
- Audit recent activity across your configs to track who changed what and when

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify credentials with a lightweight auth check — returns the workplace name |
| `get_workplace` | Get Doppler workplace details including name, billing email, and security policies |
| `list_projects` | List all projects in the Doppler workplace |
| `get_project` | Get details of a specific Doppler project |
| `create_project` | Create a new Doppler project |
| `delete_project` | Delete a project and all its configs/secrets (irreversible) |
| `list_environments` | List all environments for a project |
| `get_environment` | Get details of a specific environment by slug |
| `list_configs` | List all configs in a project |
| `get_config` | Get details of a specific config |
| `clone_config` | Clone an existing config into a new config with a different name |
| `list_secrets` | List all secret names and values in a config |
| `get_secret` | Get a single secret by name, including its raw and computed value |
| `set_secret` | Set one or more secrets in a config (key-value object) |
| `delete_secret` | Delete a single secret by name from a config |
| `download_secrets` | Download all secrets from a config as a JSON object |
| `list_service_tokens` | List all service tokens for a config |
| `create_service_token` | Create a new service token with read or read/write access |
| `revoke_service_token` | Revoke a service token by its slug |
| `get_activity_logs` | Get the last 20 activity log entries for a project and config |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `DOPPLER_SERVICE_TOKEN` | Yes | Doppler Service Token | doppler.com → Your Project → Config → **Access** tab → **Service Tokens** → **Generate**. Use a config-scoped token with at least **read** access for read-only tools, or **read/write** to also set and delete secrets. |

> Use a **read/write** token if you want agents to set or delete secrets. A **read-only** token is sufficient if you only need to inspect and download existing values.
>
> Service tokens are scoped to a single config. If you need cross-project access, generate a token from each config and configure them as separate MCP instances, or use a Doppler **personal token** (with `dp.pt.` prefix) which has workplace-wide access.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Doppler"** and click **Add to Workspace**
3. Add your `DOPPLER_SERVICE_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can read and manage your Doppler secrets automatically.

### Example Prompts

```
"List all secrets in the production config of my backend project"
"Set DATABASE_URL to postgres://... in the staging config of my-api"
"Clone the dev config into a new config called dev-feature-x"
"Create a read-only service token named 'deploy-bot' for the prd config"
"Show me recent activity in the production config to see who changed secrets today"
```

### Direct API Call

```bash
# List secrets in a config
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-doppler \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DOPPLER-SERVICE-TOKEN: dp.st.prd.xxxx' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_secrets","arguments":{"project":"my-backend","config":"prd"}}}'

# Set a secret
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-doppler \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DOPPLER-SERVICE-TOKEN: dp.st.prd.xxxx' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"set_secret","arguments":{"project":"my-backend","config":"prd","secrets":{"STRIPE_SECRET_KEY":"sk_live_..."}}}}'
```

## Technical Notes

- **Token scoping.** Service tokens (`dp.st.*`) are config-scoped — they can only read/write secrets within the one config they were created for. To manage projects, environments, or workplace settings, you need a personal token (`dp.pt.*`) or a CLI token. Most agent use cases (reading/writing secrets in a known config) work fine with a service token.
- **Service token permissions.** `read` tokens can only call read-only tools (`list_secrets`, `get_secret`, `download_secrets`, `list_service_tokens`, etc.). `read/write` tokens additionally allow `set_secret`, `delete_secret`, `clone_config`, `create_service_token`, and `revoke_service_token`.
- **Environments vs configs.** In Doppler, an **environment** (e.g. `production`) is a grouping. A **config** (e.g. `prd`, `prd_server`) is the actual entity that holds secrets. Most tools operate on configs, not environments directly.
- **download_secrets** returns the secrets as a flat JSON object — the same format Doppler injects into your app at runtime. It is the fastest way to export or diff secrets between configs.
- **Activity logs** are per-config and return up to 20 of the most recent events including secret reads, writes, and token usage.

## License

MIT
