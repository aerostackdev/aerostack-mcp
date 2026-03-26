# mcp-aws-s3 — Amazon S3 MCP Server

> List buckets, upload, download, delete, and manage objects in Amazon S3 — AI-native cloud storage access for any agent.

Give your AI agents full access to Amazon S3. Browse buckets, list objects with folder navigation, upload and download files, generate pre-signed URLs for secure sharing, and manage object metadata — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-aws-s3`

---

## What You Can Do

- Browse all S3 buckets in your AWS account
- List objects with prefix filtering and folder navigation
- Download text files directly or get pre-signed URLs for binary files
- Upload text, JSON, CSV, and other content to any bucket
- Copy objects within or across buckets
- Delete objects by key
- Inspect object metadata (size, content type, last modified, ETag)
- Generate pre-signed URLs for temporary upload/download access
- Create new S3 buckets

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify AWS S3 connectivity by listing buckets |
| `list_buckets` | List all S3 buckets with name and creation date |
| `list_objects` | List objects in a bucket with prefix, delimiter, and pagination |
| `get_object` | Download text content or get a pre-signed URL for binary files |
| `put_object` | Upload text/JSON content to a bucket with optional metadata |
| `delete_object` | Delete an object by key |
| `copy_object` | Copy an object within or across buckets |
| `head_object` | Get object metadata without downloading (size, type, ETag) |
| `presign_url` | Generate a temporary pre-signed URL for upload or download |
| `create_bucket` | Create a new S3 bucket |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `AWS_ACCESS_KEY_ID` | Yes | AWS IAM access key with S3 permissions | console.aws.amazon.com → IAM → Users → your user → Security credentials → Create access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS IAM secret key (shown once at creation) | Created with the access key above — save it immediately |
| `AWS_REGION` | No | AWS region for S3 operations (default: us-east-1) | Choose the region where your buckets are located (e.g. us-west-2, eu-west-1) |

> **Recommended IAM Policy:** Attach `AmazonS3FullAccess` for full functionality, or create a custom policy scoped to specific buckets for security.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"AWS S3"** and click **Add to Workspace**
3. Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `AWS_REGION` under **Project → Secrets**

### Example Prompts

```
"List all my S3 buckets"
"Show me the files in the uploads/ folder of my-app-bucket"
"Upload this JSON config to my-app-bucket/config/settings.json"
"Generate a download link for report-2026-Q1.pdf that expires in 1 hour"
"Copy all files from staging-bucket/exports/ to production-bucket/imports/"
"How large is the backup.tar.gz file in my-data-bucket?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-aws-s3 \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AWS-ACCESS-KEY-ID: AKIA...' \
  -H 'X-Mcp-Secret-AWS-SECRET-ACCESS-KEY: wJalr...' \
  -H 'X-Mcp-Secret-AWS-REGION: us-east-1' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_buckets","arguments":{}}}'
```

## Security Notes

- AWS credentials are injected at the Aerostack gateway layer — never stored in the worker
- Pre-signed URLs expire after the specified duration (default 1 hour, max 7 days)
- Text files under 1MB are returned inline; larger/binary files return a pre-signed download URL
- Consider using IAM policies to restrict access to specific buckets and operations

## License

MIT

