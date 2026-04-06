// mcp-agora — Aerostack MCP Server
// Wraps the Agora RESTful API for real-time channel and user management
// Secrets: X-Mcp-Secret-AGORA-CUSTOMER-ID, X-Mcp-Secret-AGORA-CUSTOMER-SECRET, X-Mcp-Secret-AGORA-APP-ID

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Agora credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'query_channel_user_list',
        description: 'List all users currently in an Agora channel',
        inputSchema: {
            type: 'object',
            properties: {
                channel_name: { type: 'string', description: 'Name of the Agora channel' },
            },
            required: ['channel_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'ban_user_from_channel',
        description: 'Ban a user from joining a channel for a specified duration',
        inputSchema: {
            type: 'object',
            properties: {
                cname: { type: 'string', description: 'Channel name' },
                uid: { type: 'string', description: 'User ID to ban' },
                time: { type: 'number', description: 'Ban duration in minutes (1-1440)' },
                privileges: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Privileges to revoke (default: ["join_channel"])',
                },
            },
            required: ['cname', 'uid', 'time'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_ban_rules',
        description: 'List all active user ban rules for the app',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_ban_rule',
        description: 'Remove a specific user ban rule by ID',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'number', description: 'Ban rule ID to delete' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'query_online_channels',
        description: 'List currently active (online) channels for the app',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of channels per page (default: 100)' },
            },
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_channel_user_count',
        description: 'Get the number of users in a specific channel',
        inputSchema: {
            type: 'object',
            properties: {
                channel_name: { type: 'string', description: 'Name of the Agora channel' },
            },
            required: ['channel_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

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

function basicAuth(customerId: string, customerSecret: string): string {
    return 'Basic ' + btoa(`${customerId}:${customerSecret}`);
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    customerId: string,
    customerSecret: string,
    appId: string,
) {
    const base = 'https://api.agora.io';
    const headers: Record<string, string> = {
        'Authorization': basicAuth(customerId, customerSecret),
        'Content-Type': 'application/json',
    };

    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const res = await fetch(
                `${base}/dev/v1/channel/${encodeURIComponent(appId)}?page_no=1&page_size=1`,
                { headers },
            );
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return text('Connected to Agora');
        }

        case 'query_channel_user_list': {
            const channelName = args.channel_name as string;
            if (!channelName) return text('Error: "channel_name" is required');
            const res = await fetch(
                `${base}/dev/v1/channel/user/${encodeURIComponent(appId)}/${encodeURIComponent(channelName)}`,
                { headers },
            );
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'ban_user_from_channel': {
            const cname = args.cname as string;
            const uid = args.uid as string;
            const time = args.time as number;
            if (!cname || !uid || !time) return text('Error: "cname", "uid", and "time" are required');
            const privileges = (args.privileges as string[]) || ['join_channel'];
            const body = { appid: appId, cname, uid, time, privileges };
            const res = await fetch(`${base}/dev/v1/kicking-rule`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'list_ban_rules': {
            const res = await fetch(
                `${base}/dev/v1/kicking-rule?appid=${encodeURIComponent(appId)}`,
                { headers },
            );
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete_ban_rule': {
            const id = args.id as number;
            if (id === undefined || id === null) return text('Error: "id" is required');
            const body = { appid: appId, id };
            const res = await fetch(`${base}/dev/v1/kicking-rule`, {
                method: 'DELETE',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'query_online_channels': {
            const limit = (args.limit as number) || 100;
            const res = await fetch(
                `${base}/dev/v1/channel/${encodeURIComponent(appId)}?page_no=1&page_size=${limit}`,
                { headers },
            );
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'get_channel_user_count': {
            const channelName = args.channel_name as string;
            if (!channelName) return text('Error: "channel_name" is required');
            const res = await fetch(
                `${base}/dev/v1/channel/user/property/list/${encodeURIComponent(appId)}/${encodeURIComponent(channelName)}`,
                { headers },
            );
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        default:
            return text(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-agora', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const customerId = request.headers.get('X-Mcp-Secret-AGORA-CUSTOMER-ID') || '';
        const customerSecret = request.headers.get('X-Mcp-Secret-AGORA-CUSTOMER-SECRET') || '';
        const appId = request.headers.get('X-Mcp-Secret-AGORA-APP-ID') || '';

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;
        const rpcId = id as number | string;

        if (method === 'initialize') {
            return rpcOk(rpcId, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-agora', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(rpcId, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            if (!customerId || !customerSecret || !appId) {
                return rpcErr(rpcId, -32001, 'Missing secrets: AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET, and AGORA_APP_ID are required');
            }
            const { name, arguments: toolArgs = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, toolArgs, customerId, customerSecret, appId);
                return rpcOk(rpcId, result);
            } catch (err) {
                return rpcErr(rpcId, -32603, String(err));
            }
        }

        return rpcErr(rpcId, -32601, `Method not found: ${method}`);
    },
};
