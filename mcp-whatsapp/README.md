# mcp-whatsapp — WhatsApp Business MCP Server

> Send messages, manage templates, and handle media across WhatsApp Business from your AI agents.

WhatsApp Business reaches over 2 billion users and is the dominant messaging channel for customer communication in many markets. This MCP server covers the full Meta Cloud API v20.0 — session messages (text, image, video, document, audio, location, reactions), interactive messages (buttons, lists, CTA URLs), template management, media upload, and account management — letting your AI agents run real customer conversations at scale.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-whatsapp`

---

## What You Can Do

- Send rich session messages (text, images, documents, interactive buttons and lists) to customers within the 24-hour conversation window
- Use pre-approved templates to re-engage customers outside the window — order updates, appointment reminders, payment confirmations
- Manage your template library: list, create, submit for Meta review, and delete templates
- Upload media once to get a reusable `media_id` for efficient re-sending without re-uploading

## Available Tools

| Tool | Description |
|------|-------------|
| `get_business_profile` | Get business name, description, address, email, website, category, and profile picture |
| `update_business_profile` | Update any profile field: description, address, email, websites, vertical |
| `get_phone_number_info` | Get display number, verified name, quality rating, platform type, and throughput level |
| `get_account_info` | Get WABA name, currency, timezone, and template namespace |
| `send_text` | Send a text message, with optional URL preview |
| `send_image` | Send an image by URL or media_id, with optional caption |
| `send_document` | Send a document or file by URL or media_id, with optional caption and filename |
| `send_video` | Send a video by URL or media_id, with optional caption |
| `send_audio` | Send an audio message or voice note by URL or media_id |
| `send_location` | Send a location pin with latitude, longitude, optional name and address |
| `send_reaction` | React to a received message with an emoji |
| `send_buttons` | Send a message with 1–3 quick-reply buttons |
| `send_list` | Send a message with a scrollable list of options in sections (max 10 rows) |
| `send_cta_url` | Send a message with a URL call-to-action button |
| `list_templates` | List all templates with optional status filter (APPROVED, PENDING, REJECTED, PAUSED) |
| `get_template` | Get full template details including components and rejection reason |
| `send_template` | Send an approved template with variable values and optional media header |
| `create_template` | Submit a new template for Meta review |
| `delete_template` | Delete a template by name |
| `mark_as_read` | Mark a received message as read (shows blue double-tick to sender) |
| `delete_message` | Delete a sent message from the recipient's view |
| `upload_media` | Upload media from a public URL to WhatsApp servers, returns reusable media_id |
| `get_media_url` | Get the download URL for media received via webhook |
| `delete_media` | Delete uploaded media from WhatsApp servers |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `WHATSAPP_ACCESS_TOKEN` | Yes | Bearer token for Meta Cloud API | [developers.facebook.com](https://developers.facebook.com) → Your App → **WhatsApp** → **Getting Started** → copy **Temporary access token** (for testing) or generate a permanent System User token via **Meta Business Manager** → **System Users** |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | Numeric ID of the sending phone number | Same Getting Started page → copy **Phone number ID** (NOT the phone number itself) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | For template tools | WABA ID — required for template management and account info | Same page → copy **WhatsApp Business Account ID** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"WhatsApp"** and click **Add to Workspace**
3. Add your secrets under **Project → Secrets**

Once added, every AI agent in your workspace can call WhatsApp tools automatically — no per-user setup needed.

### Example Prompts

```
"Send a WhatsApp message to 15551234567 saying their order has shipped and will arrive by Thursday"
"List all APPROVED WhatsApp templates and show me their variable placeholders"
"Send the order_confirmation template to 447911123456 with order number ORD-8821 and total $49.99"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-whatsapp \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-WHATSAPP-ACCESS-TOKEN: your-access-token' \
  -H 'X-Mcp-Secret-WHATSAPP-PHONE-NUMBER-ID: your-phone-number-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_text","arguments":{"to":"15551234567","text":"Hello from Aerostack!"}}}'
```

## License

MIT
