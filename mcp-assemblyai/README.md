# mcp-assemblyai — AssemblyAI MCP Server

> Transcribe audio, run LeMUR AI analysis, extract action items, and search transcripts with AssemblyAI's audio intelligence platform.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-assemblyai`

---

## What You Can Do

This MCP server gives AI agents access to AssemblyAI via 14 tools. Connect it to any Aerostack workspace and your agents can interact with AssemblyAI directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `transcribe_url` | Submit an audio URL for transcription with AssemblyAI |
| `get_transcript` | Get the status and result of a transcript by ID |
| `list_transcripts` | List transcripts for the authenticated account |
| `delete_transcript` | Delete a transcript by ID (removes audio data from AssemblyAI servers) |
| `create_realtime_token` | Create a temporary token for real-time streaming transcription |
| `lemur_task` | Run a custom LLM task on one or more transcripts with AssemblyAI LeMUR |
| `lemur_summary` | Generate a summary of transcripts using AssemblyAI LeMUR |
| `lemur_qa` | Ask questions about transcripts using AssemblyAI LeMUR |
| `lemur_action_items` | Extract action items from transcripts using AssemblyAI LeMUR |
| `get_lemur_response` | Retrieve a previous LeMUR response by request ID |
| `upload_audio` | Upload audio data from base64 to AssemblyAI for transcription |
| `list_word_search` | Search for specific words in a transcript |
| `get_sentences` | Get sentence-level breakdown of a transcript |
| `get_paragraphs` | Get paragraph-level breakdown of a transcript |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ASSEMBLYAI_API_KEY` | Yes | Your ASSEMBLYAI API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"AssemblyAI"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `ASSEMBLYAI_API_KEY`

Once added, every AI agent in your workspace can use AssemblyAI tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-assemblyai \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ASSEMBLYAI-API-KEY: your-assemblyai-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"transcribe_url","arguments":{}}}'
```

## License

MIT
