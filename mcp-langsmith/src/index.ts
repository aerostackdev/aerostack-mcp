/**
 * LangSmith MCP Worker
 * Implements MCP protocol over HTTP for LangSmith LLM observability operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   LANGSMITH_API_KEY → X-Mcp-Secret-LANGSMITH-API-KEY
 *
 * Auth format: x-api-key: {api_key}
 * Covers: projects (2), runs (2), datasets (2), examples (2) = 8 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const LANGSMITH_API_BASE = 'https://api.smith.langchain.com';

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
    return request.headers.get('X-Mcp-Secret-LANGSMITH-API-KEY');
}

async function langsmithFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const res = await fetch(`${LANGSMITH_API_BASE}${path}`, {
        ...options,
        headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const msg = (err as { detail?: string }).detail ?? res.statusText;
        throw { code: -32603, message: `LangSmith API error ${res.status}: ${msg}` };
    }
    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify LangSmith credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_projects',
        description: 'List LangSmith projects (repos/tracing sessions) in your workspace. Each project groups related LLM runs for observability.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of projects to return (default: 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_project',
        description: 'Create a new LangSmith project for grouping LLM runs and traces.',
        inputSchema: {
            type: 'object',
            properties: {
                repo_handle: {
                    type: 'string',
                    description: 'Project name/handle (slug-style, e.g. "my-chatbot-prod")',
                },
                description: {
                    type: 'string',
                    description: 'Project description',
                },
            },
            required: ['repo_handle'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_runs',
        description: 'List LLM runs (traces) in a LangSmith project. Returns inputs, outputs, latency, and token usage for each run.',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'string',
                    description: 'Project/session ID to list runs for',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of runs to return (default: 20)',
                },
            },
            required: ['project_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_run',
        description: 'Get detailed information about a specific LangSmith run including full inputs, outputs, error info, and child runs.',
        inputSchema: {
            type: 'object',
            properties: {
                run_id: {
                    type: 'string',
                    description: 'Run ID (UUID)',
                },
            },
            required: ['run_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_datasets',
        description: 'List evaluation datasets in your LangSmith workspace for testing and benchmarking LLM applications.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of datasets to return (default: 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_dataset',
        description: 'Create a new evaluation dataset in LangSmith for storing input/output examples to benchmark your LLM.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Dataset name',
                },
                description: {
                    type: 'string',
                    description: 'Dataset description',
                },
                data_type: {
                    type: 'string',
                    description: 'Data type: "kv" (key-value), "llm", or "chat" (default: "kv")',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_examples',
        description: 'List examples (test cases) in a LangSmith evaluation dataset.',
        inputSchema: {
            type: 'object',
            properties: {
                dataset_id: {
                    type: 'string',
                    description: 'Dataset ID to list examples from',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of examples to return (default: 20)',
                },
            },
            required: ['dataset_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_example',
        description: 'Add a new input/output example to a LangSmith evaluation dataset for benchmarking.',
        inputSchema: {
            type: 'object',
            properties: {
                dataset_id: {
                    type: 'string',
                    description: 'Dataset ID to add the example to',
                },
                inputs: {
                    type: 'object',
                    description: 'Input values for this example (key-value pairs)',
                },
                outputs: {
                    type: 'object',
                    description: 'Expected output values for this example (optional)',
                },
            },
            required: ['dataset_id', 'inputs'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
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
            await langsmithFetch('/api/v1/orgs', apiKey);
            return toolOk({ connected: true, service: 'LangSmith' });
        }

        case 'list_projects': {
            const limit = (args.limit as number) ?? 20;
            return langsmithFetch(`/api/v1/repos?limit=${limit}`, apiKey);
        }

        case 'create_project': {
            if (!args.repo_handle) throw new Error('Missing required parameter: repo_handle');
            const body: Record<string, unknown> = { repo_handle: args.repo_handle };
            if (args.description) body.description = args.description;
            return langsmithFetch('/api/v1/repos', apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_runs': {
            if (!args.project_id) throw new Error('Missing required parameter: project_id');
            const limit = (args.limit as number) ?? 20;
            return langsmithFetch(`/api/v1/runs?session_id=${encodeURIComponent(args.project_id as string)}&limit=${limit}`, apiKey);
        }

        case 'get_run': {
            if (!args.run_id) throw new Error('Missing required parameter: run_id');
            return langsmithFetch(`/api/v1/runs/${args.run_id as string}`, apiKey);
        }

        case 'list_datasets': {
            const limit = (args.limit as number) ?? 20;
            return langsmithFetch(`/api/v1/datasets?limit=${limit}`, apiKey);
        }

        case 'create_dataset': {
            if (!args.name) throw new Error('Missing required parameter: name');
            const body: Record<string, unknown> = { name: args.name };
            if (args.description) body.description = args.description;
            if (args.data_type) body.data_type = args.data_type;
            return langsmithFetch('/api/v1/datasets', apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_examples': {
            if (!args.dataset_id) throw new Error('Missing required parameter: dataset_id');
            const limit = (args.limit as number) ?? 20;
            return langsmithFetch(`/api/v1/examples?dataset_id=${encodeURIComponent(args.dataset_id as string)}&limit=${limit}`, apiKey);
        }

        case 'create_example': {
            if (!args.dataset_id) throw new Error('Missing required parameter: dataset_id');
            if (!args.inputs) throw new Error('Missing required parameter: inputs');
            const body: Record<string, unknown> = {
                dataset_id: args.dataset_id,
                inputs: args.inputs,
            };
            if (args.outputs) body.outputs = args.outputs;
            return langsmithFetch('/api/v1/examples', apiKey, { method: 'POST', body: JSON.stringify(body) });
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
                JSON.stringify({ status: 'ok', server: 'mcp-langsmith', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-langsmith', version: '1.0.0' },
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
            return rpcErr(id, -32001, 'Missing required secret — add LANGSMITH_API_KEY to workspace secrets');
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
