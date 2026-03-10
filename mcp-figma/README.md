# mcp-figma

Figma MCP server for Aerostack. Exposes Figma file, component, style, comment, and image export operations via the MCP protocol over HTTP.

Runs as a Cloudflare Worker. Secrets are injected by the Aerostack gateway via `X-Mcp-Secret-*` headers.

---

## Tools

| Tool | Description | Method |
|------|-------------|--------|
| `get_file` | Get a Figma file (metadata, pages, structure) | `GET /files/{fileKey}` |
| `get_file_nodes` | Get specific nodes from a file by ID | `GET /files/{fileKey}/nodes` |
| `get_comments` | Get all comments on a file | `GET /files/{fileKey}/comments` |
| `post_comment` | Post a comment on a file (optionally pinned) | `POST /files/{fileKey}/comments` |
| `get_file_components` | Get all components in a file | `GET /files/{fileKey}/components` |
| `get_file_styles` | Get all styles in a file | `GET /files/{fileKey}/styles` |
| `get_image` | Export nodes as PNG, JPG, SVG, or PDF | `GET /images/{fileKey}` |

---

## Secrets

| Env Var | Header | Description |
|---------|--------|-------------|
| `FIGMA_ACCESS_TOKEN` | `X-Mcp-Secret-FIGMA-ACCESS-TOKEN` | Figma personal access token |

Generate a personal access token at **Figma > Settings > Personal access tokens**.

---

## Health Check

```bash
curl https://mcp-figma.<your-domain>/health
```

```json
{ "status": "ok", "server": "figma-mcp", "version": "1.0.0" }
```

---

## Example Requests

### Initialize

```bash
curl -X POST https://mcp-figma.<your-domain> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

### List Tools

```bash
curl -X POST https://mcp-figma.<your-domain> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### Get a File

```bash
curl -X POST https://mcp-figma.<your-domain> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-FIGMA-ACCESS-TOKEN: fig_xxx" \
  -d '{
    "jsonrpc":"2.0","id":3,"method":"tools/call",
    "params":{"name":"get_file","arguments":{"fileKey":"abc123XYZ"}}
  }'
```

### Get File Nodes

```bash
curl -X POST https://mcp-figma.<your-domain> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-FIGMA-ACCESS-TOKEN: fig_xxx" \
  -d '{
    "jsonrpc":"2.0","id":4,"method":"tools/call",
    "params":{"name":"get_file_nodes","arguments":{"fileKey":"abc123XYZ","nodeIds":["0:1","1:2"]}}
  }'
```

### Post a Comment

```bash
curl -X POST https://mcp-figma.<your-domain> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-FIGMA-ACCESS-TOKEN: fig_xxx" \
  -d '{
    "jsonrpc":"2.0","id":5,"method":"tools/call",
    "params":{"name":"post_comment","arguments":{"fileKey":"abc123XYZ","message":"Looks great!","x":100,"y":200}}
  }'
```

### Export Image

```bash
curl -X POST https://mcp-figma.<your-domain> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-FIGMA-ACCESS-TOKEN: fig_xxx" \
  -d '{
    "jsonrpc":"2.0","id":6,"method":"tools/call",
    "params":{"name":"get_image","arguments":{"fileKey":"abc123XYZ","nodeIds":["0:1"],"format":"svg","scale":2}}
  }'
```

---

## Development

```bash
npm install
npm run dev       # Local dev server
npm run build     # Bundle for production
npm run deploy    # Build + deploy to Aerostack
```
