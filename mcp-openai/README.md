# mcp-openai

Aerostack MCP server for the **OpenAI API**. Provides chat completions, embeddings, image generation, moderation, file management, and fine-tuning job listing — all running on Cloudflare's edge.

---

## Tools

| Tool | Method | Endpoint | Description |
|------|--------|----------|-------------|
| `chat_completion` | POST | `/chat/completions` | Create a chat completion using OpenAI models |
| `list_models` | GET | `/models` | List all available OpenAI models |
| `create_embedding` | POST | `/embeddings` | Create text embeddings |
| `create_image` | POST | `/images/generations` | Generate an image using DALL-E |
| `create_moderation` | POST | `/moderations` | Check text for policy violations |
| `list_files` | GET | `/files` | List uploaded files |
| `list_fine_tuning_jobs` | GET | `/fine_tuning/jobs` | List fine-tuning jobs |

---

## Secrets

| Env Var | Header | Description |
|---------|--------|-------------|
| `OPENAI_API_KEY` | `X-Mcp-Secret-OPENAI-API-KEY` | OpenAI API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

---

## Local Development

```bash
cd MCP/mcp-openai
aerostack dev
```

### Test: list tools

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Test: chat completion

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-OPENAI-API-KEY: sk-your-key-here" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"chat_completion",
      "arguments":{
        "messages":[{"role":"user","content":"Say hello in one sentence."}]
      }
    }
  }'
```

### Test: list models

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-OPENAI-API-KEY: sk-your-key-here" \
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"list_models",
      "arguments":{}
    }
  }'
```

### Test: create embedding

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-OPENAI-API-KEY: sk-your-key-here" \
  -d '{
    "jsonrpc":"2.0",
    "id":4,
    "method":"tools/call",
    "params":{
      "name":"create_embedding",
      "arguments":{
        "input":"The quick brown fox jumps over the lazy dog"
      }
    }
  }'
```

### Test: create image

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-OPENAI-API-KEY: sk-your-key-here" \
  -d '{
    "jsonrpc":"2.0",
    "id":5,
    "method":"tools/call",
    "params":{
      "name":"create_image",
      "arguments":{
        "prompt":"A futuristic city skyline at sunset, digital art"
      }
    }
  }'
```

### Test: create moderation

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-OPENAI-API-KEY: sk-your-key-here" \
  -d '{
    "jsonrpc":"2.0",
    "id":6,
    "method":"tools/call",
    "params":{
      "name":"create_moderation",
      "arguments":{
        "input":"This is a perfectly normal sentence."
      }
    }
  }'
```

### Test: health check

```bash
curl http://localhost:8787/health
```

---

## Deploy

```bash
npm run deploy
# or
aerostack deploy mcp --slug openai
```

---

## Protocol

- JSON-RPC 2.0 over HTTP POST
- MCP spec version: `2024-11-05`
- Methods: `initialize`, `tools/list`, `tools/call`
- Health check: `GET /health`

---

## License

MIT
