/**
 * Crisp Customer Support MCP Worker
 * Secret: CRISP_IDENTIFIER → header: X-Mcp-Secret-CRISP-IDENTIFIER
 * Secret: CRISP_KEY → header: X-Mcp-Secret-CRISP-KEY
 * Secret: CRISP_WEBSITE_ID → header: X-Mcp-Secret-CRISP-WEBSITE-ID
 */

const BASE_URL = 'https://api.crisp.chat/v1';

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
        name: 'list_conversations',
        description: 'List open conversations for the website',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'get_conversation',
        description: 'Get conversation details by session ID',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'The conversation session ID' },
            },
            required: ['session_id'],
        },
    },
    {
        name: 'send_message',
        description: 'Send a message in a conversation',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'The conversation session ID' },
                content: { type: 'string', description: 'Message content' },
            },
            required: ['session_id', 'content'],
        },
    },
    {
        name: 'list_messages',
        description: 'List messages in a conversation',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'The conversation session ID' },
            },
            required: ['session_id'],
        },
    },
    {
        name: 'resolve_conversation',
        description: 'Resolve (close) a conversation',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'The conversation session ID' },
            },
            required: ['session_id'],
        },
    },
    {
        name: 'assign_conversation',
        description: 'Assign a conversation to an agent',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'The conversation session ID' },
                assigned_agent_id: { type: 'string', description: 'The agent user ID to assign to' },
            },
            required: ['session_id', 'assigned_agent_id'],
        },
    },
    {
        name: 'list_operators',
        description: 'List all operators for the website',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
];

async function callApi(
    method: string,
    path: string,
    identifier: string,
    key: string,
    body?: unknown,
): Promise<unknown> {
    const credentials = btoa(`${identifier}:${key}`);
    const opts: RequestInit = {
        method,
        headers: {
            'Authorization': `Basic ${credentials}`,
            'X-Crisp-Tier': 'plugin',
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
        if (res.status === 401) throw new Error('Invalid or expired Crisp credentials');
        if (res.status === 403) throw new Error('Insufficient permissions for this action');
        if (res.status === 404) throw new Error('Resource not found');
        if (res.status === 429) throw new Error('Rate limit exceeded — try again later');
        const msg = (data.reason ?? data.message ?? data.error ?? text) as string;
        throw new Error(`API error ${res.status}: ${msg}`);
    }
    return data;
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    identifier: string,
    key: string,
    websiteId: string,
): Promise<unknown> {
    switch (name) {
        case 'list_conversations': {
            return callApi('GET', `/website/${websiteId}/conversations/1?filter_resolved=false`, identifier, key);
        }
        case 'get_conversation': {
            return callApi('GET', `/website/${websiteId}/conversation/${args.session_id}`, identifier, key);
        }
        case 'send_message': {
            return callApi('POST', `/website/${websiteId}/conversation/${args.session_id}/message`, identifier, key, {
                type: 'text',
                from: 'operator',
                origin: 'chat',
                content: args.content,
            });
        }
        case 'list_messages': {
            return callApi('GET', `/website/${websiteId}/conversation/${args.session_id}/messages/1`, identifier, key);
        }
        case 'resolve_conversation': {
            return callApi('PATCH', `/website/${websiteId}/conversation/${args.session_id}/state`, identifier, key, {
                state: 'resolved',
            });
        }
        case 'assign_conversation': {
            return callApi('PATCH', `/website/${websiteId}/conversation/${args.session_id}/routing`, identifier, key, {
                assigned_agent_id: args.assigned_agent_id,
            });
        }
        case 'list_operators': {
            return callApi('GET', `/website/${websiteId}/operators/list`, identifier, key);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-crisp', version: '1.0.0', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-crisp', version: '1.0.0' },
            });
        }
        if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });
        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
            const identifier = request.headers.get('X-Mcp-Secret-CRISP-IDENTIFIER');
            const crispKey = request.headers.get('X-Mcp-Secret-CRISP-KEY');
            const websiteId = request.headers.get('X-Mcp-Secret-CRISP-WEBSITE-ID');
            if (!identifier) return rpcErr(id, -32001, 'Missing CRISP_IDENTIFIER — add it to workspace secrets');
            if (!crispKey) return rpcErr(id, -32001, 'Missing CRISP_KEY — add it to workspace secrets');
            if (!websiteId) return rpcErr(id, -32001, 'Missing CRISP_WEBSITE_ID — add it to workspace secrets');
            try {
                const result = await callTool(toolName, toolArgs, identifier, crispKey, websiteId);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            }
        }
        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
