# mcp-sentry — Sentry MCP Server

Cloudflare Worker implementing the MCP protocol for Sentry error tracking and performance monitoring. Provides tools to list organizations, projects, and issues, inspect error events with stack traces, resolve issues, and browse releases.

## Tools

| Tool | Description |
|------|-------------|
| `list_organizations` | List Sentry organizations accessible to the authenticated user |
| `list_projects` | List projects in a Sentry organization |
| `list_issues` | List issues for a project, optionally filtered by search query |
| `get_issue` | Get detailed information about a specific issue |
| `list_issue_events` | List events (occurrences) for a specific issue |
| `resolve_issue` | Resolve an issue by setting its status to resolved |
| `list_releases` | List releases for an organization |
| `get_event` | Get full event details including exception data and breadcrumbs |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| `SENTRY_AUTH_TOKEN` | `X-Mcp-Secret-SENTRY-AUTH-TOKEN` | Sentry auth token (User Auth Token or Org Auth Token with appropriate scopes) |

## Usage

Health check:

```bash
curl https://mcp-sentry.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-sentry.<your-domain> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-sentry.<your-domain> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

List organizations:

```bash
curl -X POST https://mcp-sentry.<your-domain> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-SENTRY-AUTH-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_organizations","arguments":{}}}'
```

List issues for a project:

```bash
curl -X POST https://mcp-sentry.<your-domain> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-SENTRY-AUTH-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_issues","arguments":{"org_slug":"my-org","project_slug":"my-project"}}}'
```

Get event with stack trace:

```bash
curl -X POST https://mcp-sentry.<your-domain> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-SENTRY-AUTH-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_event","arguments":{"org_slug":"my-org","event_id":"abc123"}}}'
```

Resolve an issue:

```bash
curl -X POST https://mcp-sentry.<your-domain> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-SENTRY-AUTH-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"resolve_issue","arguments":{"issue_id":"12345"}}}'
```
