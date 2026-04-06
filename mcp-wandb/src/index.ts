/**
 * Weights & Biases (W&B) MCP Worker
 * Implements MCP protocol over HTTP for W&B ML experiment tracking.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   WANDB_API_KEY  → X-Mcp-Secret-WANDB-API-KEY
 *   WANDB_ENTITY   → X-Mcp-Secret-WANDB-ENTITY
 *
 * Auth format: Authorization: Bearer {api_key}
 * Covers: projects (1 GraphQL), runs (2), run_summary (1), artifacts (2) = 6 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const WANDB_API_BASE = 'https://api.wandb.ai';

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

function getSecrets(request: Request): { apiKey: string | null; entity: string | null } {
    return {
        apiKey: request.headers.get('X-Mcp-Secret-WANDB-API-KEY'),
        entity: request.headers.get('X-Mcp-Secret-WANDB-ENTITY'),
    };
}

async function wandbFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const res = await fetch(`${WANDB_API_BASE}${path}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        const msg = (err as { error?: string }).error ?? res.statusText;
        throw { code: -32603, message: `W&B API error ${res.status}: ${msg}` };
    }
    return res.json();
}

async function wandbGraphQL(
    apiKey: string,
    query: string,
    variables: Record<string, unknown> = {},
): Promise<unknown> {
    const res = await fetch(`${WANDB_API_BASE}/graphql`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ errors: [{ message: res.statusText }] }));
        const msg = (err as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ?? res.statusText;
        throw { code: -32603, message: `W&B GraphQL error ${res.status}: ${msg}` };
    }
    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Weights & Biases credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_projects',
        description: 'List all W&B projects for the configured entity (user or organization). Uses GraphQL API.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_run',
        description: 'Get details about a specific W&B run including config, summary metrics, and tags.',
        inputSchema: {
            type: 'object',
            properties: {
                project: {
                    type: 'string',
                    description: 'Project name',
                },
                run_id: {
                    type: 'string',
                    description: 'Run ID',
                },
            },
            required: ['project', 'run_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_runs',
        description: 'List all runs in a W&B project with their status, config, and summary metrics.',
        inputSchema: {
            type: 'object',
            properties: {
                project: {
                    type: 'string',
                    description: 'Project name to list runs for',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of runs to return (default: 25)',
                },
            },
            required: ['project'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_run_summary',
        description: 'Get sampled metric history for a W&B run — useful for plotting training curves and performance over time.',
        inputSchema: {
            type: 'object',
            properties: {
                project: {
                    type: 'string',
                    description: 'Project name',
                },
                run_id: {
                    type: 'string',
                    description: 'Run ID',
                },
                samples: {
                    type: 'number',
                    description: 'Number of history samples to return (default: 100)',
                },
            },
            required: ['project', 'run_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_artifacts',
        description: 'List artifacts (datasets, models, checkpoints) stored in a W&B project.',
        inputSchema: {
            type: 'object',
            properties: {
                project: {
                    type: 'string',
                    description: 'Project name',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of artifacts to return (default: 25)',
                },
            },
            required: ['project'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_artifact',
        description: 'Get details about a specific W&B artifact version including files, metadata, and lineage.',
        inputSchema: {
            type: 'object',
            properties: {
                project: {
                    type: 'string',
                    description: 'Project name',
                },
                artifact_name: {
                    type: 'string',
                    description: 'Artifact name (e.g. "my-model")',
                },
                version: {
                    type: 'string',
                    description: 'Artifact version (e.g. "v0", "v1", "latest")',
                },
            },
            required: ['project', 'artifact_name', 'version'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
    entity: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await wandbFetch('/api/v1/user', apiKey);
            return toolOk({ connected: true, service: 'W&B' });
        }

        case 'list_projects': {
            return wandbGraphQL(apiKey, `
                query ListProjects($entityName: String!) {
                    projects(entityName: $entityName) {
                        edges {
                            node {
                                id
                                name
                                description
                                createdAt
                                runCount
                            }
                        }
                    }
                }
            `, { entityName: entity });
        }

        case 'get_run': {
            if (!args.project) throw new Error('Missing required parameter: project');
            if (!args.run_id) throw new Error('Missing required parameter: run_id');
            return wandbFetch(`/api/v1/${entity}/${args.project as string}/runs/${args.run_id as string}`, apiKey);
        }

        case 'list_runs': {
            if (!args.project) throw new Error('Missing required parameter: project');
            const limit = (args.limit as number) ?? 25;
            return wandbFetch(`/api/v1/${entity}/${args.project as string}/runs?per_page=${limit}`, apiKey);
        }

        case 'get_run_summary': {
            if (!args.project) throw new Error('Missing required parameter: project');
            if (!args.run_id) throw new Error('Missing required parameter: run_id');
            const samples = (args.samples as number) ?? 100;
            return wandbFetch(`/api/v1/${entity}/${args.project as string}/runs/${args.run_id as string}/history?samples=${samples}`, apiKey);
        }

        case 'list_artifacts': {
            if (!args.project) throw new Error('Missing required parameter: project');
            const limit = (args.limit as number) ?? 25;
            return wandbFetch(`/api/v1/${entity}/${args.project as string}/artifacts?per_page=${limit}`, apiKey);
        }

        case 'get_artifact': {
            if (!args.project) throw new Error('Missing required parameter: project');
            if (!args.artifact_name) throw new Error('Missing required parameter: artifact_name');
            if (!args.version) throw new Error('Missing required parameter: version');
            return wandbFetch(`/api/v1/${entity}/${args.project as string}/artifact/${args.artifact_name as string}:${args.version as string}`, apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-wandb', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-wandb', version: '1.0.0' },
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

        const { apiKey, entity } = getSecrets(request);
        if (!apiKey) {
            return rpcErr(id, -32001, 'Missing required secret — add WANDB_API_KEY to workspace secrets');
        }
        if (!entity) {
            return rpcErr(id, -32001, 'Missing required secret — add WANDB_ENTITY to workspace secrets');
        }

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        try {
            const result = await callTool(toolName, args, apiKey, entity);
            return rpcOk(id, toolOk(result));
        } catch (err) {
            const e = err as { code?: number; message?: string } | Error;
            const msg = e instanceof Error ? e.message : ((e as { message?: string }).message ?? String(e));
            const code = (e as { code?: number }).code ?? -32603;
            return rpcErr(id, code, msg);
        }
    },
};
