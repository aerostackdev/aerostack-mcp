# mcp-posthog

MCP server for [PostHog](https://posthog.com) — capture events, identify users, evaluate feature flags, and query analytics data.

Deployed as a Cloudflare Worker, receiving secrets from the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools (9)

| Tool | Description |
|------|-------------|
| `capture_event` | Capture a custom analytics event for a user |
| `identify_user` | Identify a user and set their properties |
| `get_feature_flags` | Evaluate feature flags for a user via /decide |
| `list_persons` | List persons with optional email/name search |
| `get_person` | Get full details for a person by ID |
| `list_feature_flags` | List all feature flags (optionally filter by active) |
| `get_insights` | List insights (TRENDS, FUNNELS, RETENTION, PATHS) |
| `list_cohorts` | List all cohorts with counts |
| `get_experiments` | List all A/B experiments |

## Secrets

| Secret | Header | Description |
|--------|--------|-------------|
| `POSTHOG_API_KEY` | `X-Mcp-Secret-POSTHOG-API-KEY` | Personal API key for REST API |
| `POSTHOG_PROJECT_ID` | `X-Mcp-Secret-POSTHOG-PROJECT-ID` | Numeric project ID |
| `POSTHOG_PROJECT_API_KEY` | `X-Mcp-Secret-POSTHOG-PROJECT-API-KEY` | Project API key (starts with `phc_`) for capture |

## Deploy

```bash
cd MCP/mcp-posthog
npm install
wrangler deploy
```
