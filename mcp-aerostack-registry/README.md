# mcp-aerostack-registry — Aerostack Registry MCP Server

> Discover and invoke any function, MCP server, or skill across the entire Aerostack marketplace from a single tool.

The Aerostack Registry is the central catalog for the Aerostack community marketplace. This MCP server gives AI agents a unified interface to search all 640+ cataloged MCP servers, 200+ edge functions, and skills — and invoke them directly without switching contexts. It's the "meta-MCP" that makes the rest of the marketplace instantly accessible.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-aerostack-registry`

---

## What You Can Do

- Search the entire Aerostack marketplace by keyword, category, or capability to find the right tool
- Discover available MCP servers, functions, and skills without leaving your AI workflow
- Invoke community functions directly through the registry without installing them individually
- Build meta-agents that dynamically route tasks to the right specialized tool

## Available Tools

| Tool | Description |
|------|-------------|
| search | Search the Aerostack marketplace for MCPs, functions, and skills matching a query |
| call_function | Invoke a community function by name with arguments, dispatched via the registry |

> This server is a thin proxy to the Aerostack platform's built-in registry endpoint. Tool definitions are resolved dynamically from the platform.

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| AEROSTACK_API_KEY | Yes | Your Aerostack project API key | [aerostack.dev](https://aerostack.dev) → Project → API Keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Aerostack Registry"** and click **Add to Workspace**
3. Add your `AEROSTACK_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can search and call any marketplace tool automatically — no per-tool setup needed.

### Example Prompts

```
"Find me an MCP server that can send SMS messages"
"Search the Aerostack marketplace for Stripe-related tools"
"What functions are available for image processing?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-aerostack-registry \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AEROSTACK-API-KEY: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## License

MIT
