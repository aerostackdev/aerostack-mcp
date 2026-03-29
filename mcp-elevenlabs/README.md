# mcp-elevenlabs — ElevenLabs MCP Server

> Generate lifelike speech, clone voices, and create sound effects from your AI agents.

ElevenLabs is the leading AI voice platform — used by podcasters, game developers, content creators, and enterprises to produce natural-sounding audio at scale. This MCP server gives your AI agents full access to text-to-speech generation, voice management, sound effect creation, and account analytics.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-elevenlabs`

---

## What You Can Do

- Generate high-quality speech from text using any of 1,000+ available voices across 29 languages
- Retrieve character-level timing data alongside audio for subtitle and caption generation
- Create sound effects and ambient audio from natural language descriptions
- Manage your custom voice library — edit settings, delete voices, and browse the shared community library
- Monitor your character quota and subscription usage before running large batch jobs

## Available Tools

| Tool | Description |
|------|-------------|
| `list_voices` | List all available voices including pre-made and your custom cloned voices |
| `get_voice` | Get detailed information about a specific voice including labels and settings |
| `get_voice_settings` | Get default settings for a voice (stability, similarity boost, style) |
| `edit_voice_settings` | Update stability, similarity boost, style, and speaker boost for a voice |
| `delete_voice` | Permanently delete a custom cloned voice |
| `text_to_speech` | Convert text to speech — returns base64-encoded MP3 audio |
| `text_to_speech_with_timestamps` | Convert text to speech with character-level timing data for captions |
| `get_models` | List all TTS models with capabilities, languages, and token costs |
| `get_user_info` | Account info with character usage and subscription tier |
| `get_subscription` | Detailed subscription: plan, limits, reset date, available models |
| `list_history` | Generation history with timestamps, voice used, and character count |
| `delete_history_items` | Delete one or more items from your generation history |
| `sound_generation` | Generate sound effects from a text description |
| `list_shared_voices` | Search the community shared voice library by name, language, gender |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `ELEVENLABS_API_KEY` | Yes | Your ElevenLabs API key | [elevenlabs.io](https://elevenlabs.io) → Click your profile avatar → **API Keys** → **Create API Key** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev](https://app.aerostack.dev) → Your Project → **MCPs**
2. Search for **"ElevenLabs"** and click **Add to Workspace**
3. Add `ELEVENLABS_API_KEY` under **Project → Secrets**

### Example Prompts

```
"Convert this blog post intro to speech using the Rachel voice"
"List all my custom voices and their current stability settings"
"Generate a 5-second thunderstorm sound effect"
"How many characters do I have left in my quota this month?"
"Find English male narrator voices in the shared library"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-elevenlabs \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ELEVENLABS-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_voices","arguments":{}}}'
```

## License

MIT
