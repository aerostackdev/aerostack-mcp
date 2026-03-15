# mcp-posthog — PostHog MCP Server

> Capture events, evaluate feature flags, manage cohorts, and query analytics from your AI agents.

PostHog is the open-source product analytics suite with built-in feature flags, A/B testing, and session recording. This MCP server lets your AI agents capture analytics events from server-side workflows, evaluate which feature flags are active for a user, and query insights, cohorts, and experiments — turning PostHog into a live data source for intelligent product workflows.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-posthog`

---

## What You Can Do

- Capture backend events (like a subscription upgrade or API call) directly into PostHog from any agent workflow
- Evaluate feature flags for a specific user to decide which version of a feature to serve in dynamic workflows
- List and inspect A/B experiments to understand which variants are running and their current status
- Query cohort membership to target specific user segments in downstream communication or automation

## Available Tools

| Tool | Description |
|------|-------------|
| `capture_event` | Capture a custom analytics event for a user |
| `identify_user` | Identify a user and set their properties |
| `get_feature_flags` | Evaluate which feature flags are active for a user |
| `list_persons` | List persons with optional email or name search |
| `get_person` | Get full details for a person by ID |
| `list_feature_flags` | List all feature flags (optionally filter by active status) |
| `get_insights` | List insights reports (TRENDS, FUNNELS, RETENTION, PATHS) |
| `list_cohorts` | List all cohorts with member counts |
| `get_experiments` | List all A/B experiments and their variants |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `POSTHOG_API_KEY` | Yes | Personal API key for REST API access | [app.posthog.com](https://app.posthog.com) → **Settings** → **Personal API Keys** → **Create personal API key** |
| `POSTHOG_PROJECT_ID` | Yes | Numeric project ID | [app.posthog.com](https://app.posthog.com) → Your Project → **Settings** → **Project** → copy **Project ID** |
| `POSTHOG_PROJECT_API_KEY` | Yes | Project API key for event capture (starts with `phc_`) | [app.posthog.com](https://app.posthog.com) → Your Project → **Settings** → **Project** → copy **Project API Key** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"PostHog"** and click **Add to Workspace**
3. Add all three secrets under **Project → Secrets**

Once added, every AI agent in your workspace can call PostHog tools automatically — no per-user setup needed.

### Example Prompts

```
"Check which feature flags are enabled for user distinct_id_12345"
"List all active A/B experiments and their current variant assignments"
"Capture a subscription_upgraded event for user u_98765 with property plan: enterprise"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-posthog \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-POSTHOG-API-KEY: your-personal-api-key' \
  -H 'X-Mcp-Secret-POSTHOG-PROJECT-ID: 12345' \
  -H 'X-Mcp-Secret-POSTHOG-PROJECT-API-KEY: phc_yourprojectkey' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_feature_flags","arguments":{}}}'
```

## License

MIT
