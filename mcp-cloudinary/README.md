# mcp-cloudinary — Cloudinary Media MCP Server

> Upload, transform, search, and manage images and videos in Cloudinary — AI-native media asset management for any agent.

Give your AI agents full access to Cloudinary. Search media assets, upload from URLs, generate transformation URLs for resizing/cropping/effects, browse folders, check usage stats, and manage your media library — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-cloudinary`

---

## What You Can Do

- Search images and videos by expression, tags, folder, or metadata
- Get detailed asset metadata with dimensions, colors, and faces
- Upload images/videos from public URLs with folder/tag assignment
- Generate transformation URLs (resize, crop, blur, format, quality)
- Browse folder structure
- Check account usage (storage, bandwidth, transformations)
- Delete assets by public ID

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify Cloudinary connectivity and show usage stats |
| `search` | Search assets by expression, tags, folder, metadata |
| `get_resource` | Get asset metadata — dimensions, colors, faces, tags |
| `upload_from_url` | Upload an image/video from a public URL |
| `generate_url` | Create a transformation URL (resize, crop, effects) |
| `list_folders` | Browse folder structure |
| `delete_resource` | Delete an asset by public ID |
| `get_usage` | Account usage — storage, bandwidth, transformations |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `CLOUDINARY_CLOUD_NAME` | Yes | Your Cloudinary cloud name | console.cloudinary.com → Dashboard → Cloud name (top left) |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API Key | console.cloudinary.com → Settings → Access Keys → API Key |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API Secret | console.cloudinary.com → Settings → Access Keys → API Secret |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Cloudinary"** and click **Add to Workspace**
3. Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` under **Project → Secrets**

### Example Prompts

```
"Search for all JPG images in the products folder"
"Upload this image URL to Cloudinary in the hero-banners folder"
"Generate a 800x600 cropped thumbnail URL for product-123"
"How much storage and bandwidth have I used this month?"
"List all folders in my Cloudinary account"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-cloudinary \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CLOUDINARY-CLOUD-NAME: mycloud' \
  -H 'X-Mcp-Secret-CLOUDINARY-API-KEY: 123456789' \
  -H 'X-Mcp-Secret-CLOUDINARY-API-SECRET: abcdef' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search","arguments":{"expression":"folder:products AND format:jpg"}}}'
```

## Security Notes

- Cloudinary credentials are injected at the Aerostack gateway layer — never stored in the worker
- Upload API uses authenticated requests — no unsigned uploads
- Search results are limited to 500 assets per request
- Transformation URLs are public — use signed URLs for private assets

## License

MIT
