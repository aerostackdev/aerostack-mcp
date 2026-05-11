# mcp-trigger-dev — Trigger Dev MCP Server

> Trigger.dev background job platform — manage task runs, cancel or replay runs, and create cron schedules.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-trigger-dev`

---

## What You Can Do

This MCP server gives AI agents access to Trigger Dev via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Trigger Dev directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_runs` | List task runs in Trigger.dev with their status, task ID, and output. |
| `get_run` | Get run details by ID including status, output, and timing information. |
| `cancel_run` | Cancel a run that is currently queued or running. |
| `replay_run` | Replay a completed or failed run with the same payload. |
| `list_schedules` | List all scheduled tasks in Trigger.dev. |
| `create_schedule` | Create a cron schedule for a task. |
| `delete_schedule` | Delete a scheduled task by schedule ID. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `TRIGGER_DEV_API_KEY` | Yes | Your Trigger.dev API key — found in Trigger.dev Dashboard → Account → API Keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Trigger Dev"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `TRIGGER_DEV_API_KEY`

Once added, every AI agent in your workspace can use Trigger Dev tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-trigger-dev \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TRIGGER-DEV-API-KEY: your-trigger-dev-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_runs","arguments":{}}}'
```

## License

MIT
