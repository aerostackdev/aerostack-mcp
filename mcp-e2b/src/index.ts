/**
 * E2B MCP Worker
 * Implements MCP protocol over HTTP for E2B sandbox lifecycle operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: E2B_API_KEY → X-Mcp-Secret-E2B-API-KEY
 */

const E2B_API = 'https://api.e2b.dev';

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
        name: 'list_templates',
        description: 'List available E2B sandbox templates',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max templates to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_sandbox',
        description: 'Create a new E2B sandbox from a template',
        inputSchema: {
            type: 'object',
            properties: {
                template_id: { type: 'string', description: 'Template ID to use (default: base)' },
                timeout: { type: 'number', description: 'Sandbox timeout in seconds (default 300)' },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_sandboxes',
        description: 'List running E2B sandboxes',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max sandboxes to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_sandbox',
        description: 'Get details of a specific E2B sandbox',
        inputSchema: {
            type: 'object',
            properties: {
                sandbox_id: { type: 'string', description: 'Sandbox ID' },
            },
            required: ['sandbox_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'kill_sandbox',
        description: 'Kill (terminate) a running E2B sandbox',
        inputSchema: {
            type: 'object',
            properties: {
                sandbox_id: { type: 'string', description: 'Sandbox ID to kill' },
            },
            required: ['sandbox_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
];

async function e2bApi(path: string, apiKey: string, opts: RequestInit = {}) {
    const res = await fetch(`${E2B_API}${path}`, {
        ...opts,
        headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    // 204 No Content
    if (res.status === 204) {
        return { success: true };
    }
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`E2B API ${res.status}: ${err.message ?? err.error ?? 'unknown error'}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case 'list_templates': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const data = await e2bApi(`/sandboxes/templates?limit=${limit}`, apiKey) as any;
            return data;
        }

        case 'create_sandbox': {
            const data = await e2bApi('/sandboxes', apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    templateID: String(args.template_id ?? 'base'),
                    timeout: Number(args.timeout ?? 300),
                }),
            }) as any;
            return data;
        }

        case 'list_sandboxes': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const data = await e2bApi(`/sandboxes?limit=${limit}`, apiKey) as any;
            return data;
        }

        case 'get_sandbox': {
            const data = await e2bApi(`/sandboxes/${encodeURIComponent(String(args.sandbox_id))}`, apiKey) as any;
            return data;
        }

        case 'kill_sandbox': {
            const data = await e2bApi(`/sandboxes/${encodeURIComponent(String(args.sandbox_id))}`, apiKey, {
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
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-e2b', tools: TOOLS.length }), {
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
                serverInfo: { name: 'mcp-e2b', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const apiKey = request.headers.get('X-Mcp-Secret-E2B-API-KEY');
            if (!apiKey) return rpcErr(id, -32001, 'Missing E2B_API_KEY secret — add it to your workspace secrets');

            try {
                const result = await callTool(toolName, toolArgs, apiKey);
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
