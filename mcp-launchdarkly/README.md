# mcp-launchdarkly — Launchdarkly MCP Server

> Manage LaunchDarkly feature flags, environments, segments, and audit logs with natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-launchdarkly`

---

## What You Can Do

This MCP server gives AI agents access to Launchdarkly via 14 tools. Connect it to any Aerostack workspace and your agents can interact with Launchdarkly directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all LaunchDarkly projects |
| `get_project` | Get details of a specific LaunchDarkly project |
| `list_feature_flags` | List feature flags in a project |
| `get_feature_flag` | Get details of a specific feature flag |
| `create_feature_flag` | Create a new feature flag |
| `update_feature_flag` | Update a feature flag using JSON Patch operations |
| `toggle_feature_flag` | Turn a feature flag on or off in a specific environment |
| `delete_feature_flag` | Delete a feature flag |
| `list_environments` | List environments in a LaunchDarkly project |
| `get_environment` | Get details of a specific environment |
| `list_segments` | List user segments in a project environment |
| `get_audit_log` | Get the LaunchDarkly audit log |
| `list_members` | List all members in the LaunchDarkly account |
| `get_member` | Get details of a specific member |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `LAUNCHDARKLY_API_KEY` | Yes | Your LAUNCHDARKLY API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Launchdarkly"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `LAUNCHDARKLY_API_KEY`

Once added, every AI agent in your workspace can use Launchdarkly tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-launchdarkly \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LAUNCHDARKLY-API-KEY: your-launchdarkly-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

## License

MIT
