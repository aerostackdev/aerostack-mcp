/**
 * Outreach MCP Worker
 * Implements MCP protocol over HTTP for Outreach sales engagement operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   OUTREACH_ACCESS_TOKEN → X-Mcp-Secret-OUTREACH-ACCESS-TOKEN
 *
 * Auth format: Authorization: Bearer {access_token}
 * Base URL: https://api.outreach.io/api/v2
 * Note: Uses JSON:API format — all bodies follow {data: {type, attributes, relationships?}}
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

const BASE = 'https://api.outreach.io/api/v2';

async function apiFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/vnd.api+json',
            'Accept': 'application/vnd.api+json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Outreach HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'errors' in data) {
            const errors = (data as { errors: Array<{ title?: string; detail?: string }> }).errors;
            if (Array.isArray(errors) && errors.length > 0) {
                msg = errors.map(e => e.detail || e.title || '').filter(Boolean).join(', ') || msg;
            }
        }
        throw { code: -32603, message: `Outreach API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Outreach credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_prospects',
        description: 'List prospects in Outreach. Returns emails, name, title, and sequence membership.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of prospects to return (default 25, max 1000)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_prospect',
        description: 'Get full prospect details by ID including emails, name, title, and relationships.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'number', description: 'Prospect ID' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_prospect',
        description: 'Create a new prospect in Outreach. Email is required.',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Prospect email address (required)' },
                firstName: { type: 'string', description: 'First name' },
                lastName: { type: 'string', description: 'Last name' },
                title: { type: 'string', description: 'Job title' },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_prospect',
        description: 'Update an existing prospect. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'number', description: 'Prospect ID to update' },
                firstName: { type: 'string', description: 'Updated first name' },
                lastName: { type: 'string', description: 'Updated last name' },
                title: { type: 'string', description: 'Updated job title' },
                email: { type: 'string', description: 'Updated email address' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_sequences',
        description: 'List all sequences (cadences) in Outreach.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of sequences to return (default 25)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_accounts',
        description: 'List all accounts in Outreach.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of accounts to return (default 25)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_account',
        description: 'Create a new account in Outreach. Account name is required.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Account name (required)' },
                domain: { type: 'string', description: 'Company domain (e.g. acme.com)' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_sequence_states',
        description: 'List prospect-sequence states, optionally filtered by state.',
        inputSchema: {
            type: 'object',
            properties: {
                state: {
                    type: 'string',
                    enum: ['active', 'finished', 'bounced', 'opted_out'],
                    description: 'Filter by sequence state',
                },
                limit: { type: 'number', description: 'Number of sequence states to return (default 25)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await apiFetch('/users/me', token);
            return { content: [{ type: 'text', text: 'Connected to Outreach' }] };
        }

        case 'list_prospects': {
            const limit = args.limit ?? 25;
            return apiFetch(`/prospects?page[size]=${limit}`, token);
        }

        case 'get_prospect': {
            validateRequired(args, ['id']);
            return apiFetch(`/prospects/${encodeURIComponent(String(args.id))}`, token);
        }

        case 'create_prospect': {
            validateRequired(args, ['email']);
            const attributes: Record<string, unknown> = {
                emails: [{ email: args.email, emailType: 'work', primary: true, unsubscribed: false }],
            };
            if (args.firstName !== undefined) attributes.firstName = args.firstName;
            if (args.lastName !== undefined) attributes.lastName = args.lastName;
            if (args.title !== undefined) attributes.title = args.title;
            return apiFetch('/prospects', token, {
                method: 'POST',
                body: JSON.stringify({ data: { type: 'prospect', attributes } }),
            });
        }

        case 'update_prospect': {
            validateRequired(args, ['id']);
            const { id, ...rest } = args;
            const attributes: Record<string, unknown> = {};
            for (const key of ['firstName', 'lastName', 'title']) {
                if (rest[key] !== undefined) attributes[key] = rest[key];
            }
            if (rest.email !== undefined) {
                attributes.emails = [{ email: rest.email, emailType: 'work', primary: true, unsubscribed: false }];
            }
            return apiFetch(`/prospects/${id}`, token, {
                method: 'PATCH',
                body: JSON.stringify({ data: { type: 'prospect', id: String(id), attributes } }),
            });
        }

        case 'list_sequences': {
            const limit = args.limit ?? 25;
            return apiFetch(`/sequences?page[size]=${limit}`, token);
        }

        case 'list_accounts': {
            const limit = args.limit ?? 25;
            return apiFetch(`/accounts?page[size]=${limit}`, token);
        }

        case 'create_account': {
            validateRequired(args, ['name']);
            const attributes: Record<string, unknown> = { name: args.name };
            if (args.domain !== undefined) attributes.domain = args.domain;
            return apiFetch('/accounts', token, {
                method: 'POST',
                body: JSON.stringify({ data: { type: 'account', attributes } }),
            });
        }

        case 'list_sequence_states': {
            const params = new URLSearchParams();
            if (args.state) params.set('filter[state]', args.state as string);
            params.set('page[size]', String(args.limit ?? 25));
            return apiFetch(`/sequenceStates?${params.toString()}`, token);
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
                JSON.stringify({ status: 'ok', server: 'mcp-outreach', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-outreach', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const token = request.headers.get('X-Mcp-Secret-OUTREACH-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing required secret: OUTREACH_ACCESS_TOKEN (header: X-Mcp-Secret-OUTREACH-ACCESS-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, token);
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
