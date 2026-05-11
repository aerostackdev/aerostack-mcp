# mcp-deel — Deel MCP Server

> Global HR and payroll operations via Deel — manage contracts, employees, payments, and compliance.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-deel`

---

## What You Can Do

This MCP server gives AI agents access to Deel via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Deel directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_contracts` | List all contracts in your Deel organization with pagination. |
| `get_contract` | Get detailed information about a specific Deel contract by ID. |
| `list_people` | List all workers and employees in your Deel organization. |
| `get_person` | Get detailed profile information for a specific person/worker in Deel. |
| `list_invoices` | List invoices in your Deel organization. |
| `list_time_offs` | List time off requests in your Deel organization. |
| `list_payments` | List payment records in your Deel organization. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEL_API_KEY` | Yes | Your DEEL API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Deel"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `DEEL_API_KEY`

Once added, every AI agent in your workspace can use Deel tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-deel \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DEEL-API-KEY: your-deel-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_contracts","arguments":{}}}'
```

## License

MIT
