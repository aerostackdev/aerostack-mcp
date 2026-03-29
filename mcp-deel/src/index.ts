/**
 * Deel MCP Worker
 * Implements MCP protocol over HTTP for Deel global HR and payroll operations.
 *
 * Secrets required:
 *   DEEL_API_KEY → X-Mcp-Secret-DEEL-API-KEY
 *
 * Auth: Authorization: Bearer {api_key}
 * Base URL: https://api.letsdeel.com/rest/v2
 */

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

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

const BASE_URL = 'https://api.letsdeel.com/rest/v2';

async function deelFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return { success: true };

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Deel HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'message' in data) {
            msg = String((data as { message: unknown }).message) || msg;
        }
        throw { code: -32603, message: `Deel API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_contracts',
        description: 'List all contracts in your Deel organization with pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of contracts to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_contract',
        description: 'Get detailed information about a specific Deel contract by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                contract_id: { type: 'string', description: 'Deel contract ID' },
            },
            required: ['contract_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_people',
        description: 'List all workers and employees in your Deel organization.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of people to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_person',
        description: 'Get detailed profile information for a specific person/worker in Deel.',
        inputSchema: {
            type: 'object',
            properties: {
                person_id: { type: 'string', description: 'Deel person ID' },
            },
            required: ['person_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_invoices',
        description: 'List invoices in your Deel organization.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of invoices to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_time_offs',
        description: 'List time off requests in your Deel organization.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of time off records to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_payments',
        description: 'List payment records in your Deel organization.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of payment records to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case 'list_contracts': {
            const params = new URLSearchParams();
            params.set('limit', String(args.limit ?? 20));
            return deelFetch(`/contracts?${params.toString()}`, apiKey);
        }

        case 'get_contract': {
            validateRequired(args, ['contract_id']);
            return deelFetch(`/contracts/${args.contract_id}`, apiKey);
        }

        case 'list_people': {
            const params = new URLSearchParams();
            params.set('limit', String(args.limit ?? 20));
            return deelFetch(`/people?${params.toString()}`, apiKey);
        }

        case 'get_person': {
            validateRequired(args, ['person_id']);
            return deelFetch(`/people/${args.person_id}`, apiKey);
        }

        case 'list_invoices': {
            const params = new URLSearchParams();
            params.set('limit', String(args.limit ?? 20));
            return deelFetch(`/invoices?${params.toString()}`, apiKey);
        }

        case 'list_time_offs': {
            const params = new URLSearchParams();
            params.set('limit', String(args.limit ?? 20));
            return deelFetch(`/time-offs?${params.toString()}`, apiKey);
        }

        case 'list_payments': {
            const params = new URLSearchParams();
            params.set('limit', String(args.limit ?? 20));
            return deelFetch(`/payments?${params.toString()}`, apiKey);
        }

        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-deel', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-deel', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const apiKey = request.headers.get('X-Mcp-Secret-DEEL-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: DEEL_API_KEY (header: X-Mcp-Secret-DEEL-API-KEY)');
            }

            try {
                const result = await callTool(toolName, args, apiKey);
                return rpcOk(id, toolOk(result));
            } catch (err: unknown) {
                if (err && typeof err === 'object' && 'code' in err) {
                    const e = err as { code: number; message: string };
                    return rpcErr(id, e.code, e.message);
                }
                if (err instanceof Error) {
                    return rpcErr(id, -32603, err.message);
                }
                return rpcErr(id, -32603, 'Internal error');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
