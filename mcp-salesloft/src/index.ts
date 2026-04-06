/**
 * Salesloft MCP Worker
 * Implements MCP protocol over HTTP for Salesloft sales engagement operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   SALESLOFT_API_KEY → X-Mcp-Secret-SALESLOFT-API-KEY
 *
 * Auth format: Authorization: Bearer {api_key}
 * Base URL: https://api.salesloft.com/v2
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

const BASE = 'https://api.salesloft.com/v2';

async function apiFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Salesloft HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'error' in data) {
            msg = (data as { error: string }).error || msg;
        }
        throw { code: -32603, message: `Salesloft API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Salesloft credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_people',
        description: 'List people/contacts in Salesloft with their email, name, title, and account.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of people to return per page (default 25, max 100)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_person',
        description: 'Get full person details by ID including email, name, title, cadences, and account.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'number', description: 'Person ID' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_person',
        description: 'Create a new person (contact) in Salesloft. Email is required.',
        inputSchema: {
            type: 'object',
            properties: {
                email_address: { type: 'string', description: 'Email address (required)' },
                first_name: { type: 'string', description: 'First name' },
                last_name: { type: 'string', description: 'Last name' },
                title: { type: 'string', description: 'Job title' },
                account_id: { type: 'number', description: 'Account ID to associate with' },
            },
            required: ['email_address'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_cadences',
        description: 'List all sales cadences in Salesloft.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of cadences to return (default 25, max 100)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_accounts',
        description: 'List all accounts in Salesloft.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of accounts to return (default 25, max 100)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_calls',
        description: 'List call activities in Salesloft.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of calls to return (default 25, max 100)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_emails',
        description: 'List email activities in Salesloft.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of emails to return (default 25, max 100)' },
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
        case '_ping': {
            await apiFetch('/me', apiKey);
            return { content: [{ type: 'text', text: 'Connected to Salesloft' }] };
        }

        case 'list_people': {
            const limit = args.limit ?? 25;
            return apiFetch(`/people?per_page=${limit}`, apiKey);
        }

        case 'get_person': {
            validateRequired(args, ['id']);
            return apiFetch(`/people/${args.id}`, apiKey);
        }

        case 'create_person': {
            validateRequired(args, ['email_address']);
            const body: Record<string, unknown> = { email_address: args.email_address };
            if (args.first_name !== undefined) body.first_name = args.first_name;
            if (args.last_name !== undefined) body.last_name = args.last_name;
            if (args.title !== undefined) body.title = args.title;
            if (args.account_id !== undefined) body.account_id = args.account_id;
            return apiFetch('/people', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_cadences': {
            const limit = args.limit ?? 25;
            return apiFetch(`/cadences?per_page=${limit}`, apiKey);
        }

        case 'list_accounts': {
            const limit = args.limit ?? 25;
            return apiFetch(`/accounts?per_page=${limit}`, apiKey);
        }

        case 'list_calls': {
            const limit = args.limit ?? 25;
            return apiFetch(`/activities/calls?per_page=${limit}`, apiKey);
        }

        case 'list_emails': {
            const limit = args.limit ?? 25;
            return apiFetch(`/activities/emails?per_page=${limit}`, apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-salesloft', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-salesloft', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const apiKey = request.headers.get('X-Mcp-Secret-SALESLOFT-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: SALESLOFT_API_KEY (header: X-Mcp-Secret-SALESLOFT-API-KEY)');
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
