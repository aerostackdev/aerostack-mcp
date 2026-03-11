# mcp-resend — Resend MCP Server

Resend is a developer-first transactional email platform. This MCP server enables sending emails and managing domains via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| send_email | Send a transactional email (HTML or plain text) |
| get_email | Get details of a sent email by ID |
| list_emails | List recently sent emails |
| list_domains | List verified sending domains |
| cancel_email | Cancel a scheduled email |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| RESEND_API_KEY | X-Mcp-Secret-RESEND-API-KEY | Resend API key from the dashboard |

## Usage

Health check:

```bash
curl https://mcp-resend.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-resend.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-resend.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-resend.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-RESEND-API-KEY: <your-token>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_domains","arguments":{}}}'
```

## Deploy

```bash
cd MCP/mcp-resend
npm run deploy
```
