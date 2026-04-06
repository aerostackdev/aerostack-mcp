/**
 * RunPod MCP Worker
 * Implements MCP protocol over HTTP for RunPod GPU cloud operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   RUNPOD_API_KEY → X-Mcp-Secret-RUNPOD-API-KEY
 *
 * Auth format: query param ?api_key={key} on GraphQL endpoint
 * Note: RunPod uses GraphQL at https://api.runpod.io/graphql
 * Covers: gpu_types (1), pods (3), pod_lifecycle (3) = 7 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const RUNPOD_GRAPHQL_BASE = 'https://api.runpod.io/graphql';

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpcOk(id: number | string, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: number | string | null, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function getApiKey(request: Request): string | null {
    return request.headers.get('X-Mcp-Secret-RUNPOD-API-KEY');
}

async function runpodGraphQL(
    apiKey: string,
    query: string,
    variables: Record<string, unknown> = {},
): Promise<unknown> {
    const url = `${RUNPOD_GRAPHQL_BASE}?api_key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ errors: [{ message: res.statusText }] }));
        const msg = (err as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ?? res.statusText;
        throw { code: -32603, message: `RunPod API error ${res.status}: ${msg}` };
    }
    const data = await res.json() as { errors?: Array<{ message: string }>; data?: unknown };
    if (data.errors && data.errors.length > 0) {
        throw { code: -32603, message: `RunPod GraphQL error: ${data.errors[0].message}` };
    }
    return data.data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify RunPod credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_gpu_types',
        description: 'List all available GPU types on RunPod with memory, pricing (spot and on-demand), and availability in secure vs community cloud.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_pods',
        description: 'List all pods in your RunPod account with their status, image, and machine details.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_pod',
        description: 'Get detailed information about a specific RunPod pod including status, GPU count, and logs setting.',
        inputSchema: {
            type: 'object',
            properties: {
                pod_id: {
                    type: 'string',
                    description: 'Pod ID',
                },
            },
            required: ['pod_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_pod',
        description: 'Deploy a new GPU pod on RunPod. Creates a secure cloud pod with the specified GPU type and container image.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Pod name',
                },
                image_name: {
                    type: 'string',
                    description: 'Docker image to run (e.g. "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04")',
                },
                gpu_type_id: {
                    type: 'string',
                    description: 'GPU type ID (e.g. "NVIDIA GeForce RTX 3090"). Use list_gpu_types to find valid IDs.',
                },
                gpu_count: {
                    type: 'number',
                    description: 'Number of GPUs (default: 1)',
                },
                volume_in_gb: {
                    type: 'number',
                    description: 'Persistent volume size in GB (default: 5)',
                },
                container_disk_in_gb: {
                    type: 'number',
                    description: 'Container disk size in GB (default: 10)',
                },
            },
            required: ['name', 'image_name', 'gpu_type_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'stop_pod',
        description: 'Stop a running RunPod pod (pauses billing while preserving the pod configuration and volume).',
        inputSchema: {
            type: 'object',
            properties: {
                pod_id: {
                    type: 'string',
                    description: 'Pod ID to stop',
                },
            },
            required: ['pod_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'resume_pod',
        description: 'Resume a stopped RunPod pod to restart billing and execution.',
        inputSchema: {
            type: 'object',
            properties: {
                pod_id: {
                    type: 'string',
                    description: 'Pod ID to resume',
                },
                gpu_count: {
                    type: 'number',
                    description: 'Number of GPUs to use when resuming (default: 1)',
                },
            },
            required: ['pod_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'terminate_pod',
        description: 'Permanently terminate and delete a RunPod pod. All data not on persistent volume will be lost.',
        inputSchema: {
            type: 'object',
            properties: {
                pod_id: {
                    type: 'string',
                    description: 'Pod ID to terminate',
                },
            },
            required: ['pod_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await runpodGraphQL(apiKey, '{ myself { id } }');
            return toolOk({ connected: true, service: 'RunPod' });
        }

        case 'list_gpu_types': {
            return runpodGraphQL(apiKey, `{
                gpuTypes {
                    id
                    displayName
                    memoryInGb
                    secureCloud
                    communityCloud
                    lowestPrice {
                        minimumBidPrice
                        uninterruptablePrice
                    }
                }
            }`);
        }

        case 'list_pods': {
            return runpodGraphQL(apiKey, `{
                myself {
                    pods {
                        id
                        name
                        desiredStatus
                        imageName
                        machineId
                    }
                }
            }`);
        }

        case 'get_pod': {
            if (!args.pod_id) throw new Error('Missing required parameter: pod_id');
            return runpodGraphQL(apiKey, `
                query pod($podId: String!) {
                    pod(input: { podId: $podId }) {
                        id
                        name
                        desiredStatus
                        imageName
                        gpuCount
                        logsToConsole
                    }
                }
            `, { podId: args.pod_id });
        }

        case 'create_pod': {
            if (!args.name) throw new Error('Missing required parameter: name');
            if (!args.image_name) throw new Error('Missing required parameter: image_name');
            if (!args.gpu_type_id) throw new Error('Missing required parameter: gpu_type_id');
            const gpuCount = (args.gpu_count as number) ?? 1;
            const volumeInGb = (args.volume_in_gb as number) ?? 5;
            const containerDiskInGb = (args.container_disk_in_gb as number) ?? 10;
            return runpodGraphQL(apiKey, `
                mutation CreatePod($input: PodFindAndDeployOnDemandInput!) {
                    podFindAndDeployOnDemand(input: $input) {
                        id
                        name
                        desiredStatus
                    }
                }
            `, {
                input: {
                    cloudType: 'SECURE',
                    gpuCount,
                    volumeInGb,
                    containerDiskInGb,
                    minVcpuCount: 2,
                    minMemoryInGb: 15,
                    gpuTypeId: String(args.gpu_type_id),
                    name: String(args.name),
                    imageName: String(args.image_name),
                },
            });
        }

        case 'stop_pod': {
            if (!args.pod_id) throw new Error('Missing required parameter: pod_id');
            return runpodGraphQL(apiKey, `
                mutation StopPod($podId: String!) {
                    podStop(input: { podId: $podId }) {
                        id
                        desiredStatus
                    }
                }
            `, { podId: String(args.pod_id) });
        }

        case 'resume_pod': {
            if (!args.pod_id) throw new Error('Missing required parameter: pod_id');
            const resumeGpuCount = (args.gpu_count as number) ?? 1;
            return runpodGraphQL(apiKey, `
                mutation ResumePod($podId: String!, $gpuCount: Int!) {
                    podResume(input: { podId: $podId, gpuCount: $gpuCount }) {
                        id
                        desiredStatus
                    }
                }
            `, { podId: String(args.pod_id), gpuCount: resumeGpuCount });
        }

        case 'terminate_pod': {
            if (!args.pod_id) throw new Error('Missing required parameter: pod_id');
            return runpodGraphQL(apiKey, `
                mutation TerminatePod($podId: String!) {
                    podTerminate(input: { podId: $podId })
                }
            `, { podId: String(args.pod_id) });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-runpod', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error — invalid JSON');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-runpod', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'notifications/initialized') {
            return rpcOk(id, {});
        }

        if (method !== 'tools/call') {
            return rpcErr(id, -32601, `Method not found: ${method}`);
        }

        const apiKey = getApiKey(request);
        if (!apiKey) {
            return rpcErr(id, -32001, 'Missing required secret — add RUNPOD_API_KEY to workspace secrets');
        }

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        try {
            const result = await callTool(toolName, args, apiKey);
            return rpcOk(id, toolOk(result));
        } catch (err) {
            const e = err as { code?: number; message?: string } | Error;
            const msg = e instanceof Error ? e.message : ((e as { message?: string }).message ?? String(e));
            const code = (e as { code?: number }).code ?? -32603;
            return rpcErr(id, code, msg);
        }
    },
};
