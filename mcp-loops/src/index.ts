/**
 * Loops MCP Worker
 * Implements MCP protocol over HTTP for Loops email/marketing operations.
 *
 * Secrets required:
 *   LOOPS_API_KEY → X-Mcp-Secret-LOOPS-API-KEY
 *
 * Auth: Authorization: Bearer {api_key}
 * Base URL: https://app.loops.so/api/v1
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

const BASE_URL = 'https://app.loops.so/api/v1';

async function loopsFetch(
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
        throw { code: -32603, message: `Loops HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'message' in data) {
            msg = String((data as { message: unknown }).message) || msg;
        }
        throw { code: -32603, message: `Loops API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'create_contact',
        description: 'Create a new contact in Loops. Email is required. You can also set custom properties.',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Contact email address (required)' },
                firstName: { type: 'string', description: 'Contact first name' },
                lastName: { type: 'string', description: 'Contact last name' },
                userGroup: { type: 'string', description: 'User group/segment name' },
                userId: { type: 'string', description: 'Your internal user ID for this contact' },
                subscribed: { type: 'boolean', description: 'Whether contact is subscribed to marketing emails' },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_contact',
        description: 'Update an existing Loops contact by email. Only include fields you want to change.',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Contact email address (required, used to identify contact)' },
                firstName: { type: 'string', description: 'Updated first name' },
                lastName: { type: 'string', description: 'Updated last name' },
                userGroup: { type: 'string', description: 'Updated user group' },
                userId: { type: 'string', description: 'Updated internal user ID' },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'find_contact',
        description: 'Find a Loops contact by their email address.',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Contact email to search for' },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_contact',
        description: 'Delete a contact from Loops by email address. This action cannot be undone.',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Contact email address to delete' },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'send_event',
        description: 'Send an event to Loops to trigger a Loop (automated email sequence) for a contact.',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Contact email address' },
                eventName: { type: 'string', description: 'Event name that matches a Loop trigger' },
                eventProperties: { type: 'object', description: 'Optional event properties for dynamic content', additionalProperties: true },
            },
            required: ['email', 'eventName'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_transactional',
        description: 'Send a transactional email to a contact via a Loops transactional template.',
        inputSchema: {
            type: 'object',
            properties: {
                transactionalId: { type: 'string', description: 'Loops transactional email template ID (required)' },
                email: { type: 'string', description: 'Recipient email address (required)' },
                dataVariables: { type: 'object', description: 'Template variable data for dynamic content', additionalProperties: true },
            },
            required: ['transactionalId', 'email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_mailing_lists',
        description: 'List all mailing lists in your Loops account.',
        inputSchema: {
            type: 'object',
            properties: {},
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
        case 'create_contact': {
            validateRequired(args, ['email']);
            const body: Record<string, unknown> = { email: args.email };
            for (const key of ['firstName', 'lastName', 'userGroup', 'userId', 'subscribed']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return loopsFetch('/contacts/create', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_contact': {
            validateRequired(args, ['email']);
            const body: Record<string, unknown> = { email: args.email };
            for (const key of ['firstName', 'lastName', 'userGroup', 'userId']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return loopsFetch('/contacts/update', apiKey, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'find_contact': {
            validateRequired(args, ['email']);
            const params = new URLSearchParams();
            params.set('email', args.email as string);
            return loopsFetch(`/contacts/find?${params.toString()}`, apiKey);
        }

        case 'delete_contact': {
            validateRequired(args, ['email']);
            return loopsFetch('/contacts/delete', apiKey, {
                method: 'POST',
                body: JSON.stringify({ email: args.email }),
            });
        }

        case 'send_event': {
            validateRequired(args, ['email', 'eventName']);
            const body: Record<string, unknown> = {
                email: args.email,
                eventName: args.eventName,
            };
            if (args.eventProperties !== undefined) body.eventProperties = args.eventProperties;
            return loopsFetch('/events/send', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'send_transactional': {
            validateRequired(args, ['transactionalId', 'email']);
            const body: Record<string, unknown> = {
                transactionalId: args.transactionalId,
                email: args.email,
            };
            if (args.dataVariables !== undefined) body.dataVariables = args.dataVariables;
            return loopsFetch('/transactional', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_mailing_lists': {
            return loopsFetch('/lists', apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-loops', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-loops', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const apiKey = request.headers.get('X-Mcp-Secret-LOOPS-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: LOOPS_API_KEY (header: X-Mcp-Secret-LOOPS-API-KEY)');
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
