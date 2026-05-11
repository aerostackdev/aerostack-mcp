# mcp-groq — Groq MCP Server

> Run ultra-fast LLM inference, speech-to-text, text-to-speech, and batch jobs with Groq's hardware-accelerated API.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-groq`

---

## What You Can Do

This MCP server gives AI agents access to Groq via 10 tools. Connect it to any Aerostack workspace and your agents can interact with Groq directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `chat` | Send messages to a Groq-hosted model and receive an ultra-fast response. Supports multi-turn conversations, system prompts, and JSON mode |
| `list_models` | List all available Groq models with metadata including context window size and owner |
| `transcribe_audio` | Transcribe audio to text using Whisper models on Groq. Pass audio as base64-encoded data |
| `translate_audio` | Translate audio to English text using Whisper on Groq. Automatically detects source language |
| `create_speech` | Convert text to speech using Groq PlayAI TTS models. Returns base64-encoded audio |
| `list_speech_voices` | List available voices for Groq PlayAI TTS models |
| `create_batch` | Create a batch inference job for processing multiple requests asynchronously at lower cost |
| `list_batches` | List all batch inference jobs with their status and request counts |
| `get_batch` | Get the current status and details of a specific batch inference job |
| `cancel_batch` | Cancel a pending or in-progress batch inference job |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key from https://console.groq.com/keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Groq"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `GROQ_API_KEY`

Once added, every AI agent in your workspace can use Groq tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-groq \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GROQ-API-KEY: your-groq-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"chat","arguments":{}}}'
```

## License

MIT
