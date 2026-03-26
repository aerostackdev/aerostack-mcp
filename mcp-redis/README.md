# mcp-redis — Upstash Redis MCP Server

> Manage keys, hashes, lists, and counters in your Upstash Redis database from your AI agents.

Redis is the world's most popular in-memory data store — used for caching, session management, rate limiting, queues, and real-time counters. [Upstash](https://upstash.com) provides a serverless Redis with a REST API that works anywhere, including Cloudflare Workers. This MCP server gives your AI agents full read/write access to your Redis instance: getting and setting keys, working with hashes and lists, managing TTLs, and incrementing counters — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-redis`

---

## What You Can Do

- Get and set key-value pairs to read or write cached data, feature flags, and configuration values
- Work with hashes to store and retrieve structured objects like user profiles or settings
- Push to and read from lists to manage queues, activity feeds, and ordered collections
- Increment counters for tracking page views, API usage, or any numeric metric
- Manage key expiry (TTL) to implement time-based caching and auto-cleanup

## Available Tools

| Tool | Description |
|------|-------------|
| `get` | Get the value of a key |
| `set` | Set a key-value pair with optional TTL |
| `del` | Delete one or more keys |
| `keys` | List keys matching a glob pattern |
| `exists` | Check if key(s) exist |
| `ttl` | Get remaining TTL of a key |
| `expire` | Set TTL on a key |
| `hget` | Get a single hash field |
| `hset` | Set one or more hash fields |
| `hgetall` | Get all fields and values of a hash |
| `lpush` | Push values to the head of a list |
| `lrange` | Get a range of elements from a list |
| `incr` | Increment a counter by 1 |
| `info` | Get Redis server info and statistics |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `UPSTASH_REDIS_URL` | Yes | Your Upstash Redis REST URL | [console.upstash.com](https://console.upstash.com) → Your Database → **REST API** → copy **UPSTASH_REDIS_REST_URL** |
| `UPSTASH_REDIS_TOKEN` | Yes | Your Upstash Redis REST token | Same page → copy **UPSTASH_REDIS_REST_TOKEN** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Redis"** and click **Add to Workspace**
3. Add `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call Redis tools automatically — no per-user setup needed.

### Example Prompts

```
"Get the value of the key 'config:feature-flags'"
"Set a cache key 'session:abc123' with value 'active' and a TTL of 3600 seconds"
"Show me all keys matching 'user:*' and get the hash at 'user:42'"
"Increment the counter 'api:requests:today' and tell me the new value"
"Push 'order-789' to the 'pending-orders' list and show me the first 10 items"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-redis \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-UPSTASH-REDIS-URL: https://us1-xxx.upstash.io' \
  -H 'X-Mcp-Secret-UPSTASH-REDIS-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get","arguments":{"key":"my-key"}}}'
```

## License

MIT
