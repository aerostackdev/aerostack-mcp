/**
 * n8n MCP Worker
 * Implements MCP protocol over HTTP for n8n REST API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: N8N_API_URL → header: X-Mcp-Secret-N8N-API-URL
 * Secret: N8N_API_KEY → header: X-Mcp-Secret-N8N-API-KEY
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-n8n
 */

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

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify n8n API connectivity by fetching instance owner info. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_workflows',
        description: 'List all n8n workflows with optional active/inactive filter',
        inputSchema: {
            type: 'object',
            properties: {
                active: { type: 'boolean', description: 'Filter by active status — true for active only, false for inactive only, omit for all' },
                limit: { type: 'number', description: 'Max workflows to return (default 20, max 100)' },
                cursor: { type: 'string', description: 'Pagination cursor from previous response' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_workflow',
        description: 'Get full details of a specific n8n workflow including all nodes and connections',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Workflow ID' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'activate_workflow',
        description: 'Activate an n8n workflow so its triggers start firing',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Workflow ID to activate' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'deactivate_workflow',
        description: 'Deactivate an n8n workflow to stop its triggers from firing',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Workflow ID to deactivate' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'execute_workflow',
        description: 'Trigger an n8n workflow execution with optional input data',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Workflow ID to execute' },
                data: { type: 'object', description: 'Input data to pass to the workflow (optional)' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_executions',
        description: 'List recent executions for a workflow with optional status filter',
        inputSchema: {
            type: 'object',
            properties: {
                workflowId: { type: 'string', description: 'Workflow ID to list executions for (optional — omit for all workflows)' },
                status: { type: 'string', description: 'Filter by status: success, error, waiting, running' },
                limit: { type: 'number', description: 'Max executions to return (default 20, max 100)' },
                cursor: { type: 'string', description: 'Pagination cursor from previous response' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_execution',
        description: 'Get full details of a specific workflow execution including node results',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Execution ID' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_credentials',
        description: 'List all credentials configured in n8n (names and types only — secrets are never exposed)',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max credentials to return (default 20, max 100)' },
                cursor: { type: 'string', description: 'Pagination cursor from previous response' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_tags',
        description: 'List all tags used to organize workflows in n8n',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max tags to return (default 50, max 100)' },
                cursor: { type: 'string', description: 'Pagination cursor from previous response' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

function normalizeBaseUrl(raw: string): string {
    // Strip trailing slash and ensure /api/v1 suffix
    let url = raw.replace(/\/+$/, '');
    if (!url.endsWith('/api/v1')) {
        url = url.replace(/\/api\/v1$/, '') + '/api/v1';
    }
    return url;
}

async function n8nGet(baseUrl: string, apiKey: string, path: string, params: Record<string, string> = {}): Promise<any> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    }
    const sep = qs.toString() ? '?' : '';
    const res = await fetch(`${baseUrl}${path}${sep}${qs}`, {
        headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`n8n API ${res.status}: ${text}`);
    }
    return res.json();
}

async function n8nPost(baseUrl: string, apiKey: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
            'X-N8N-API-KEY': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`n8n API ${res.status}: ${text}`);
    }
    return res.json();
}

async function n8nPatch(baseUrl: string, apiKey: string, path: string, body: unknown): Promise<any> {
    const res = await fetch(`${baseUrl}${path}`, {
        method: 'PATCH',
        headers: {
            'X-N8N-API-KEY': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`n8n API ${res.status}: ${text}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, baseUrl: string, apiKey: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Use /users endpoint to verify connectivity — returns current user
            const data = await n8nGet(baseUrl, apiKey, '/users', { limit: '1' });
            const user = data?.data?.[0];
            return {
                content: [{
                    type: 'text',
                    text: user
                        ? `Connected to n8n at ${baseUrl}. Instance owner: ${user.firstName ?? ''} ${user.lastName ?? ''} (${user.email ?? 'unknown'})`.trim()
                        : `Connected to n8n at ${baseUrl}`,
                }],
            };
        }

        case 'list_workflows': {
            const params: Record<string, string> = {
                limit: String(Math.min(Number(args.limit ?? 20), 100)),
            };
            if (args.active !== undefined) params.active = String(args.active);
            if (args.cursor) params.cursor = args.cursor as string;
            const data = await n8nGet(baseUrl, apiKey, '/workflows', params);
            const workflows = (data.data ?? data) as any[];
            return workflows.map((w: any) => ({
                id: w.id,
                name: w.name,
                active: w.active,
                createdAt: w.createdAt,
                updatedAt: w.updatedAt,
                tags: w.tags?.map((t: any) => t.name) ?? [],
            }));
        }

        case 'get_workflow': {
            const data = await n8nGet(baseUrl, apiKey, `/workflows/${args.id}`);
            return {
                id: data.id,
                name: data.name,
                active: data.active,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                tags: data.tags?.map((t: any) => t.name) ?? [],
                nodes: data.nodes?.map((n: any) => ({
                    name: n.name,
                    type: n.type,
                    position: n.position,
                    parameters: n.parameters,
                })) ?? [],
                connections: data.connections,
                settings: data.settings,
            };
        }

        case 'activate_workflow': {
            const data = await n8nPatch(baseUrl, apiKey, `/workflows/${args.id}`, { active: true });
            return { id: data.id, name: data.name, active: data.active };
        }

        case 'deactivate_workflow': {
            const data = await n8nPatch(baseUrl, apiKey, `/workflows/${args.id}`, { active: false });
            return { id: data.id, name: data.name, active: data.active };
        }

        case 'execute_workflow': {
            const body: Record<string, unknown> = {};
            if (args.data) body.data = args.data;
            // n8n v1 POST /workflows/{id}/execute is not available on all versions
            // Use the /executions endpoint with workflowId for broader compat
            // But the most common pattern is POST /workflows/{id}/run
            let data: any;
            try {
                data = await n8nPost(baseUrl, apiKey, `/workflows/${args.id}/run`, args.data ? { data: args.data } : undefined);
            } catch {
                // Fallback: some n8n versions use /execute instead of /run
                data = await n8nPost(baseUrl, apiKey, `/workflows/${args.id}/execute`, args.data ? { data: args.data } : undefined);
            }
            return {
                executionId: data.data?.executionId ?? data.executionId ?? data.id,
                status: data.data?.status ?? data.status ?? 'started',
                ...(data.data?.data ? { output: data.data.data } : {}),
            };
        }

        case 'list_executions': {
            const params: Record<string, string> = {
                limit: String(Math.min(Number(args.limit ?? 20), 100)),
            };
            if (args.workflowId) params.workflowId = args.workflowId as string;
            if (args.status) params.status = args.status as string;
            if (args.cursor) params.cursor = args.cursor as string;
            const data = await n8nGet(baseUrl, apiKey, '/executions', params);
            const executions = (data.data ?? data) as any[];
            return executions.map((e: any) => ({
                id: e.id,
                workflowId: e.workflowId,
                status: e.status ?? (e.finished ? (e.stoppedAt ? 'success' : 'running') : 'waiting'),
                startedAt: e.startedAt,
                stoppedAt: e.stoppedAt,
                mode: e.mode,
            }));
        }

        case 'get_execution': {
            const data = await n8nGet(baseUrl, apiKey, `/executions/${args.id}`);
            return {
                id: data.id,
                workflowId: data.workflowId,
                status: data.status ?? (data.finished ? 'success' : 'running'),
                startedAt: data.startedAt,
                stoppedAt: data.stoppedAt,
                mode: data.mode,
                data: data.data?.resultData?.runData
                    ? Object.fromEntries(
                        Object.entries(data.data.resultData.runData).map(([nodeName, runs]: [string, any]) => [
                            nodeName,
                            runs.map((r: any) => ({
                                startTime: r.startTime,
                                executionTime: r.executionTime,
                                items: r.data?.main?.[0]?.map((item: any) => item.json) ?? [],
                            })),
                        ])
                    )
                    : undefined,
            };
        }

        case 'list_credentials': {
            const params: Record<string, string> = {
                limit: String(Math.min(Number(args.limit ?? 20), 100)),
            };
            if (args.cursor) params.cursor = args.cursor as string;
            const data = await n8nGet(baseUrl, apiKey, '/credentials', params);
            const creds = (data.data ?? data) as any[];
            return creds.map((c: any) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
            }));
        }

        case 'get_tags': {
            const params: Record<string, string> = {
                limit: String(Math.min(Number(args.limit ?? 50), 100)),
            };
            if (args.cursor) params.cursor = args.cursor as string;
            const data = await n8nGet(baseUrl, apiKey, '/tags', params);
            const tags = (data.data ?? data) as any[];
            return tags.map((t: any) => ({
                id: t.id,
                name: t.name,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
            }));
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'n8n-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'n8n-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const rawUrl = request.headers.get('X-Mcp-Secret-N8N-API-URL');
            const apiKey = request.headers.get('X-Mcp-Secret-N8N-API-KEY');

            if (!rawUrl) {
                return rpcErr(id, -32001, 'Missing N8N_API_URL secret — add your n8n instance URL to workspace secrets');
            }
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing N8N_API_KEY secret — add your n8n API key to workspace secrets');
            }

            const baseUrl = normalizeBaseUrl(rawUrl);

            try {
                const result = await callTool(toolName, toolArgs, baseUrl, apiKey);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
