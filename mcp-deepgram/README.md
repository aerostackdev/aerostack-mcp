# mcp-deepgram — Deepgram MCP Server

> Transcribe audio, detect sentiment, topics, and intent, and generate speech with Deepgram's audio intelligence API.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-deepgram`

---

## What You Can Do

This MCP server gives AI agents access to Deepgram via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Deepgram directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `transcribe_url` | Transcribe audio from a URL using Deepgram speech-to-text |
| `transcribe_audio` | Transcribe audio from base64-encoded data using Deepgram |
| `text_to_speech` | Convert text to speech using Deepgram Aura voice models |
| `analyze_intent` | Detect intent from audio using Deepgram audio intelligence |
| `detect_topics` | Detect topics from audio using Deepgram audio intelligence |
| `detect_sentiment` | Detect sentiment from audio using Deepgram audio intelligence |
| `summarize_audio` | Summarize audio content using Deepgram audio intelligence |
| `list_projects` | List all Deepgram projects for the authenticated account |
| `get_project` | Get details for a specific Deepgram project |
| `list_api_keys` | List API keys for a Deepgram project |
| `get_usage_summary` | Get usage summary for a Deepgram project over a date range |
| `list_models` | List all available Deepgram models |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPGRAM_API_KEY` | Yes | Your DEEPGRAM API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Deepgram"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `DEEPGRAM_API_KEY`

Once added, every AI agent in your workspace can use Deepgram tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-deepgram \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DEEPGRAM-API-KEY: your-deepgram-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"transcribe_url","arguments":{}}}'
```

## License

MIT
