/**
 * Browserbase MCP Worker
 * Implements MCP protocol over HTTP for Browserbase browser session operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   BROWSERBASE_API_KEY        → X-Mcp-Secret-BROWSERBASE-API-KEY
 *   BROWSERBASE_PROJECT_ID     → X-Mcp-Secret-BROWSERBASE-PROJECT-ID
 */

const BB_API = 'https://www.browserbase.com/v1';

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
        description: 'Verify Browserbase credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_session',
        description: 'Create a new Browserbase browser session',
        inputSchema: {
            type: 'object',
            properties: {
                viewport_width: { type: 'number', description: 'Viewport width in pixels (default 1280)' },
                viewport_height: { type: 'number', description: 'Viewport height in pixels (default 720)' },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_sessions',
        description: 'List Browserbase sessions, optionally filtered by status',
        inputSchema: {
            type: 'object',
            properties: {
                status: { type: 'string', enum: ['RUNNING', 'COMPLETED', 'ERROR'], description: 'Filter by session status (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_session',
        description: 'Get details of a specific Browserbase session',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'Session ID' },
            },
            required: ['session_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'stop_session',
        description: 'Stop a running Browserbase session',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'Session ID to stop' },
            },
            required: ['session_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_session_recording',
        description: 'Get the recording URL for a completed Browserbase session',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'Session ID' },
            },
            required: ['session_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_contexts',
        description: 'List saved browser contexts (persistent auth state) for the project',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_context',
        description: 'Delete a saved browser context',
        inputSchema: {
            type: 'object',
            properties: {
                context_id: { type: 'string', description: 'Context ID to delete' },
            },
            required: ['context_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
];

async function bbApi(path: string, apiKey: string, opts: RequestInit = {}) {
    const res = await fetch(`${BB_API}${path}`, {
        ...opts,
        headers: {
            'x-bb-api-key': apiKey,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (res.status === 204) {
        return { success: true };
    }
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`Browserbase API ${res.status}: ${err.message ?? err.error ?? 'unknown error'}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string, projectId: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await bbApi(`/projects/${projectId}`, apiKey);
            return { content: [{ type: 'text', text: 'Connected to Browserbase' }] };
        }

        case 'create_session': {
            const body: Record<string, unknown> = { projectId };
            if (args.viewport_width || args.viewport_height) {
                body.browserSettings = {
                    viewport: {
                        width: Number(args.viewport_width ?? 1280),
                        height: Number(args.viewport_height ?? 720),
                    },
                };
            }
            const data = await bbApi('/sessions', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;
            return data;
        }

        case 'list_sessions': {
            const params = new URLSearchParams({ projectId });
            if (args.status) params.set('status', String(args.status));
            const data = await bbApi(`/sessions?${params}`, apiKey) as any;
            return data;
        }

        case 'get_session': {
            const data = await bbApi(`/sessions/${encodeURIComponent(String(args.session_id))}`, apiKey) as any;
            return data;
        }

        case 'stop_session': {
            const data = await bbApi(`/sessions/${args.session_id}/stop`, apiKey, {
                method: 'POST',
                body: JSON.stringify({}),
            }) as any;
            return data;
        }

        case 'get_session_recording': {
            const data = await bbApi(`/sessions/${args.session_id}/recording`, apiKey) as any;
            return data;
        }

        case 'list_contexts': {
            const data = await bbApi(`/contexts?projectId=${projectId}`, apiKey) as any;
            return data;
        }

        case 'delete_context': {
            const data = await bbApi(`/contexts/${encodeURIComponent(String(args.context_id))}`, apiKey, {
                method: 'DELETE',
            }) as any;
            return data;
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-browserbase', tools: TOOLS.length }), {
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
                serverInfo: { name: 'mcp-browserbase', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const apiKey = request.headers.get('X-Mcp-Secret-BROWSERBASE-API-KEY');
            const projectId = request.headers.get('X-Mcp-Secret-BROWSERBASE-PROJECT-ID');

            if (!apiKey) return rpcErr(id, -32001, 'Missing BROWSERBASE_API_KEY secret — add it to your workspace secrets');
            if (!projectId) return rpcErr(id, -32001, 'Missing BROWSERBASE_PROJECT_ID secret — add it to your workspace secrets');

            try {
                const result = await callTool(toolName, toolArgs, apiKey, projectId);
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
