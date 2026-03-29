/**
 * MessageBird MCP Worker
 * Secret: MESSAGEBIRD_API_KEY → header: X-Mcp-Secret-MESSAGEBIRD-API-KEY
 */

const BASE_URL = 'https://rest.messagebird.com';

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
        name: 'send_message',
        description: 'Send an SMS message',
        inputSchema: {
            type: 'object',
            properties: {
                originator: { type: 'string', description: 'Sender ID or phone number' },
                recipients: { type: 'array', items: { type: 'string' }, description: 'List of recipient phone numbers' },
                body: { type: 'string', description: 'Message text' },
            },
            required: ['originator', 'recipients', 'body'],
        },
    },
    {
        name: 'get_message',
        description: 'Get a message by ID',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'The message ID' },
            },
            required: ['id'],
        },
    },
    {
        name: 'list_messages',
        description: 'List sent messages',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of messages to return (default 20)' },
            },
        },
    },
    {
        name: 'delete_message',
        description: 'Delete a message by ID',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'The message ID to delete' },
            },
            required: ['id'],
        },
    },
    {
        name: 'get_balance',
        description: 'Get the account balance',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'list_contacts',
        description: 'List contacts',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of contacts to return (default 20)' },
            },
        },
    },
    {
        name: 'create_contact',
        description: 'Create a new contact',
        inputSchema: {
            type: 'object',
            properties: {
                msisdn: { type: 'string', description: 'Phone number in E.164 format' },
                firstName: { type: 'string', description: 'First name' },
                lastName: { type: 'string', description: 'Last name' },
                email: { type: 'string', description: 'Email address' },
            },
            required: ['msisdn'],
        },
    },
];

async function callApi(method: string, path: string, apiKey: string, body?: unknown): Promise<unknown> {
    const opts: RequestInit = {
        method,
        headers: {
            'Authorization': `AccessKey ${apiKey}`,
            'Content-Type': 'application/json',
        },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, opts);
    if (res.status === 204) return { success: true };
    const text = await res.text();
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    if (!res.ok) {
        if (res.status === 401) throw new Error('Invalid or expired API key');
        if (res.status === 403) throw new Error('Insufficient permissions for this action');
        if (res.status === 404) throw new Error('Resource not found');
        if (res.status === 429) throw new Error('Rate limit exceeded — try again later');
        const errors = data.errors as Array<Record<string, unknown>> | undefined;
        const msg = errors?.[0]?.description ?? data.message ?? data.error ?? text;
        throw new Error(`API error ${res.status}: ${msg as string}`);
    }
    return data;
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case 'send_message': {
            return callApi('POST', '/messages', apiKey, {
                originator: args.originator,
                recipients: args.recipients,
                body: args.body,
            });
        }
        case 'get_message': {
            return callApi('GET', `/messages/${args.id}`, apiKey);
        }
        case 'list_messages': {
            const limit = (args.limit as number | undefined) ?? 20;
            return callApi('GET', `/messages?limit=${limit}`, apiKey);
        }
        case 'delete_message': {
            return callApi('DELETE', `/messages/${args.id}`, apiKey);
        }
        case 'get_balance': {
            return callApi('GET', '/balance', apiKey);
        }
        case 'list_contacts': {
            const limit = (args.limit as number | undefined) ?? 20;
            return callApi('GET', `/contacts?limit=${limit}`, apiKey);
        }
        case 'create_contact': {
            const body: Record<string, unknown> = { msisdn: args.msisdn };
            if (args.firstName) body.firstName = args.firstName;
            if (args.lastName) body.lastName = args.lastName;
            if (args.email) body.email = args.email;
            return callApi('POST', '/contacts', apiKey, body);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-messagebird', version: '1.0.0', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
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
                serverInfo: { name: 'mcp-messagebird', version: '1.0.0' },
            });
        }
        if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });
        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
            const apiKey = request.headers.get('X-Mcp-Secret-MESSAGEBIRD-API-KEY');
            if (!apiKey) return rpcErr(id, -32001, 'Missing MESSAGEBIRD_API_KEY — add it to workspace secrets');
            try {
                const result = await callTool(toolName, toolArgs, apiKey);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            }
        }
        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
