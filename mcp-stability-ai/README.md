# mcp-stability-ai — Stability AI MCP Server

> Generate images, upscale photos, remove backgrounds, run inpainting, and create videos from images using Stable Diffusion 3.5 and Stability AI's Stable Image API.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-stability-ai`

---

## What You Can Do

This MCP server gives AI agents access to Stability AI via 10 tools. Connect it to any Aerostack workspace and your agents can interact with Stability AI directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `generate_image` | Generate an image from a text prompt using Stable Diffusion 3.5. Returns base64-encoded PNG/JPEG image |
| `generate_image_core` | Fast image generation using Stable Image Core — optimised for speed and cost. Returns base64-encoded image |
| `generate_image_ultra` | Highest quality image generation using Stable Image Ultra — best detail, coherence, and typography. Returns base64-encoded image |
| `upscale_image` | Upscale an image by 4x using Stable Fast 4x Upscaler. Input image must be provided as a base64-encoded string |
| `remove_background` | Remove the background from an image, returning the subject with a transparent background. Input as base64-encoded string |
| `image_to_video` | Generate a short video clip from a static image using Stable Video Diffusion. Returns an async generation ID to poll |
| `get_video_result` | Poll for the result of an image-to-video generation. Returns base64-encoded video when complete |
| `search_and_replace` | Replace a specific object or area in an image using a text search prompt. Returns the edited image as base64 |
| `inpaint` | Erase and regenerate a masked area of an image. Provide the image and a mask as base64-encoded strings |
| `get_account_balance` | Get your Stability AI account credits balance |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `STABILITY_AI_API_KEY` | Yes | Your Stability AI API key — found at platform.stability.ai/account/keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Stability AI"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `STABILITY_AI_API_KEY`

Once added, every AI agent in your workspace can use Stability AI tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-stability-ai \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-STABILITY-AI-API-KEY: your-stability-ai-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"generate_image","arguments":{}}}'
```

## License

MIT
