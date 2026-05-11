# mcp-runpod — Runpod MCP Server

> GPU cloud compute via RunPod — deploy pods, manage GPU instances, start and stop workloads for AI training and inference.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-runpod`

---

## What You Can Do

This MCP server gives AI agents access to Runpod via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Runpod directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_gpu_types` | List all available GPU types on RunPod with memory, pricing (spot and on-demand), and availability in secure vs community cloud. |
| `list_pods` | List all pods in your RunPod account with their status, image, and machine details. |
| `get_pod` | Get detailed information about a specific RunPod pod including status, GPU count, and logs setting. |
| `create_pod` | Deploy a new GPU pod on RunPod. Creates a secure cloud pod with the specified GPU type and container image. |
| `stop_pod` | Stop a running RunPod pod (pauses billing while preserving the pod configuration and volume). |
| `resume_pod` | Resume a stopped RunPod pod to restart billing and execution. |
| `terminate_pod` | Permanently terminate and delete a RunPod pod. All data not on persistent volume will be lost. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `RUNPOD_API_KEY` | Yes | Your RUNPOD API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Runpod"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `RUNPOD_API_KEY`

Once added, every AI agent in your workspace can use Runpod tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-runpod \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-RUNPOD-API-KEY: your-runpod-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_gpu_types","arguments":{}}}'
```

## License

MIT
