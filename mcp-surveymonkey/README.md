# mcp-surveymonkey — Surveymonkey MCP Server

> Full SurveyMonkey integration — create surveys, manage pages and questions, distribute via collectors, and analyze responses.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-surveymonkey`

---

## What You Can Do

This MCP server gives AI agents access to Surveymonkey via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Surveymonkey directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_surveys` | List all surveys in the account with pagination. |
| `get_survey` | Get basic survey information by ID. |
| `create_survey` | Create a new survey. |
| `get_survey_details` | Get full survey details including pages and questions. |
| `list_pages` | List all pages in a survey. |
| `create_page` | Add a new page to a survey. |
| `list_questions` | List all questions on a survey page. |
| `create_question` | Add a question to a survey page. |
| `list_collectors` | List collectors (distribution links) for a survey. |
| `create_collector` | Create a new web link collector for a survey. |
| `list_responses` | List responses for a collector. |
| `get_response_details` | Get full details of a specific survey response. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SURVEYMONKEY_ACCESS_TOKEN` | Yes | Your SurveyMonkey OAuth access token — found in Developer Portal → My Apps → Access Token |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Surveymonkey"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `SURVEYMONKEY_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Surveymonkey tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-surveymonkey \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SURVEYMONKEY-ACCESS-TOKEN: your-surveymonkey-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_surveys","arguments":{}}}'
```

## License

MIT
