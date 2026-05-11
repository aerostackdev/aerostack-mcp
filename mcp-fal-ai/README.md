# mcp-fal-ai — fal.ai MCP Server

> Generate images with FLUX, create videos, remove backgrounds, upscale images, transcribe audio, and generate music using Fal.ai's fast inference platform.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-fal-ai`

---

## What You Can Do

This MCP server gives AI agents access to fal.ai via 12 tools. Connect it to any Aerostack workspace and your agents can interact with fal.ai directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `generate_image` | Generate images from text prompts using FLUX.1 Schnell — ultra-fast 4-step generation |
| `generate_image_flux_pro` | Generate high-quality professional images using FLUX.1 Pro — best quality, slower generation |
| `generate_video` | Generate short animated videos from text prompts using AnimateDiff on Fal.ai |
| `image_to_image` | Transform an existing image using FLUX Dev image-to-image — modify style or content while preserving structure |
| `remove_background` | Remove the background from any image using rembg AI model |
| `upscale_image` | Upscale an image 2x or 4x using ESRGAN AI upscaling |
| `run_model` | Run any Fal.ai model directly with custom input parameters. Use this for models not covered by other tools |
| `submit_async_job` | Submit a Fal.ai model job to the async queue for long-running generation tasks |
| `get_async_result` | Get the result of an async Fal.ai job by request ID |
| `transcribe_audio` | Transcribe or translate audio using Whisper on Fal.ai — supports 99+ languages |
| `generate_music` | Generate music and audio from text descriptions using Stable Audio on Fal.ai |
| `list_models` | List popular Fal.ai models with their IDs, types, and descriptions |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `FAL_AI_API_KEY` | Yes | Fal.ai API key from https://fal.ai/dashboard/keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"fal.ai"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `FAL_AI_API_KEY`

Once added, every AI agent in your workspace can use fal.ai tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-fal-ai \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FAL-AI-API-KEY: your-fal-ai-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"generate_image","arguments":{}}}'
```

## License

MIT
