# mcp-aws-s3 — AWS S3 MCP Server

> List buckets, upload, download, delete, and manage objects in Amazon S3 — AI-native cloud storage access for any agent.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-aws-s3`

---

## What You Can Do

This MCP server gives AI agents access to AWS S3 via 9 tools. Connect it to any Aerostack workspace and your agents can interact with AWS S3 directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_buckets` | List all S3 buckets in the AWS account with name, region, and creation date |
| `list_objects` | List objects in an S3 bucket with optional prefix filter, delimiter for folder-like navigation, and pagination |
| `get_object` | Download an object from S3 and return its content as text. For binary files, returns a pre-signed download URL instead. |
| `put_object` | Upload a text or JSON object to S3 with optional content type and metadata |
| `delete_object` | Delete an object from an S3 bucket by key |
| `copy_object` | Copy an object from one location to another within or across S3 buckets |
| `head_object` | Get metadata for an S3 object without downloading it — size, content type, last modified, ETag, and custom metadata |
| `presign_url` | Generate a pre-signed URL for temporary access to an S3 object (upload or download) without sharing credentials |
| `create_bucket` | Create a new S3 bucket in the configured AWS region |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_ACCESS_KEY_ID` | Yes | See provider documentation |
| `AWS_SECRET_ACCESS_KEY` | Yes | Secret key from the provider's developer console |
| `AWS_REGION` | Yes | See provider documentation |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"AWS S3"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

Once added, every AI agent in your workspace can use AWS S3 tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-aws-s3 \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AWS-ACCESS-KEY-ID: your-aws-access-key-id' \
  -H 'X-Mcp-Secret-AWS-SECRET-ACCESS-KEY: your-aws-secret-access-key' \
  -H 'X-Mcp-Secret-AWS-REGION: your-aws-region' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_buckets","arguments":{}}}'
```

## License

MIT
