/**
 * Vonage (Nexmo) MCP Worker
 * Secret: VONAGE_API_KEY → header: X-Mcp-Secret-VONAGE-API-KEY
 * Secret: VONAGE_API_SECRET → header: X-Mcp-Secret-VONAGE-API-SECRET
 *
 * Note: SMS API uses form-encoded body with api_key/api_secret in the body.
 * Other endpoints use query string params for api_key/api_secret.
 */

const REST_BASE = 'https://rest.nexmo.com';
const API_BASE = 'https://api.nexmo.com';

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
        name: 'send_sms',
        description: 'Send an SMS message',
        inputSchema: {
            type: 'object',
            properties: {
                to: { type: 'string', description: 'Recipient phone number (E.164 format)' },
                from: { type: 'string', description: 'Sender ID or phone number' },
                text: { type: 'string', description: 'SMS message text' },
            },
            required: ['to', 'from', 'text'],
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
        name: 'list_numbers',
        description: 'List owned phone numbers',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'send_verify',
        description: 'Send a verification code to a phone number',
        inputSchema: {
            type: 'object',
            properties: {
                number: { type: 'string', description: 'Phone number to verify (E.164 format)' },
                brand: { type: 'string', description: 'Brand name to display in the verification message' },
                code_length: { type: 'number', description: 'Length of verification code (4 or 6, default 4)' },
            },
            required: ['number', 'brand'],
        },
    },
    {
        name: 'check_verify',
        description: 'Check a verification code',
        inputSchema: {
            type: 'object',
            properties: {
                request_id: { type: 'string', description: 'The verification request ID' },
                code: { type: 'string', description: 'The verification code entered by the user' },
            },
            required: ['request_id', 'code'],
        },
    },
    {
        name: 'cancel_verify',
        description: 'Cancel a pending verification request',
        inputSchema: {
            type: 'object',
            properties: {
                request_id: { type: 'string', description: 'The verification request ID to cancel' },
            },
            required: ['request_id'],
        },
    },
    {
        name: 'get_sms_pricing',
        description: 'Get SMS outbound pricing for a specific country',
        inputSchema: {
            type: 'object',
            properties: {
                country_code: { type: 'string', description: 'Two-letter ISO country code (e.g. US, GB, IN)' },
            },
            required: ['country_code'],
        },
    },
];

async function callFormApi(url: string, params: Record<string, string>): Promise<unknown> {
    const body = new URLSearchParams(params);
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    const text = await res.text();
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    if (!res.ok) {
        const msg = (data.error_text ?? data.error_title ?? data.message ?? text) as string;
        throw new Error(`API error ${res.status}: ${msg}`);
    }
    return data;
}

async function callGetApi(url: string): Promise<unknown> {
    const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    if (!res.ok) {
        if (res.status === 401) throw new Error('Invalid or expired API credentials');
        if (res.status === 403) throw new Error('Insufficient permissions for this action');
        if (res.status === 429) throw new Error('Rate limit exceeded — try again later');
        const msg = (data.error_text ?? data.error_title ?? data.message ?? text) as string;
        throw new Error(`API error ${res.status}: ${msg}`);
    }
    return data;
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
    apiSecret: string,
): Promise<unknown> {
    switch (name) {
        case 'send_sms': {
            return callFormApi(`${REST_BASE}/sms/json`, {
                api_key: apiKey,
                api_secret: apiSecret,
                to: args.to as string,
                from: args.from as string,
                text: args.text as string,
            });
        }
        case 'get_balance': {
            return callGetApi(`${REST_BASE}/account/get-balance?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}`);
        }
        case 'list_numbers': {
            return callGetApi(`${REST_BASE}/account/numbers?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}`);
        }
        case 'send_verify': {
            const params: Record<string, string> = {
                api_key: apiKey,
                api_secret: apiSecret,
                number: args.number as string,
                brand: args.brand as string,
            };
            if (args.code_length !== undefined) params.code_length = String(args.code_length);
            return callFormApi(`${API_BASE}/verify/json`, params);
        }
        case 'check_verify': {
            return callFormApi(`${API_BASE}/verify/check/json`, {
                api_key: apiKey,
                api_secret: apiSecret,
                request_id: args.request_id as string,
                code: args.code as string,
            });
        }
        case 'cancel_verify': {
            return callFormApi(`${API_BASE}/verify/control/json`, {
                api_key: apiKey,
                api_secret: apiSecret,
                request_id: args.request_id as string,
                cmd: 'cancel',
            });
        }
        case 'get_sms_pricing': {
            return callGetApi(`${REST_BASE}/account/get-pricing/outbound/sms?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}&country=${encodeURIComponent(args.country_code as string)}`);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-vonage', version: '1.0.0', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-vonage', version: '1.0.0' },
            });
        }
        if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });
        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
            const apiKey = request.headers.get('X-Mcp-Secret-VONAGE-API-KEY');
            const apiSecret = request.headers.get('X-Mcp-Secret-VONAGE-API-SECRET');
            if (!apiKey) return rpcErr(id, -32001, 'Missing VONAGE_API_KEY — add it to workspace secrets');
            if (!apiSecret) return rpcErr(id, -32001, 'Missing VONAGE_API_SECRET — add it to workspace secrets');
            try {
                const result = await callTool(toolName, toolArgs, apiKey, apiSecret);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            }
        }
        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
