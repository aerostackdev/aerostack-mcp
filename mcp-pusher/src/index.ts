/**
 * Pusher MCP Worker
 * Implements MCP protocol over HTTP for Pusher Channels operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   PUSHER_APP_ID    → X-Mcp-Secret-PUSHER-APP-ID
 *   PUSHER_KEY       → X-Mcp-Secret-PUSHER-KEY
 *   PUSHER_SECRET    → X-Mcp-Secret-PUSHER-SECRET
 *   PUSHER_CLUSTER   → X-Mcp-Secret-PUSHER-CLUSTER
 *
 * Pusher REST API uses HMAC-SHA256 request signing.
 */

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
        name: 'trigger_event',
        description: 'Trigger a real-time event on a Pusher channel. Optionally exclude a socket from receiving the event.',
        inputSchema: {
            type: 'object',
            properties: {
                channel: { type: 'string', description: 'The channel name to trigger the event on (e.g. "my-channel", "presence-room")' },
                event_name: { type: 'string', description: 'The event name (e.g. "new-message", "user-joined")' },
                data: { type: 'object', description: 'The event data payload (object)' },
                socket_id: { type: 'string', description: 'Optional socket ID to exclude from receiving the event (prevent echo)' },
            },
            required: ['channel', 'event_name', 'data'],
        },
    },
    {
        name: 'trigger_batch_events',
        description: 'Trigger up to 10 events in a single request across multiple channels',
        inputSchema: {
            type: 'object',
            properties: {
                events: {
                    type: 'array',
                    description: 'Array of events to trigger (max 10). Each must have channel, name, and data.',
                    items: {
                        type: 'object',
                        properties: {
                            channel: { type: 'string', description: 'Channel name' },
                            name: { type: 'string', description: 'Event name' },
                            data: { type: 'object', description: 'Event data payload' },
                        },
                        required: ['channel', 'name', 'data'],
                    },
                },
            },
            required: ['events'],
        },
    },
    {
        name: 'get_channel_info',
        description: 'Get information about a specific Pusher channel (occupied status, user count for presence channels)',
        inputSchema: {
            type: 'object',
            properties: {
                channel_name: { type: 'string', description: 'The channel name to query' },
                info: { type: 'string', description: 'Comma-separated attributes to include (e.g. "user_count,subscription_count"). user_count only for presence channels.' },
            },
            required: ['channel_name'],
        },
    },
    {
        name: 'list_channels',
        description: 'List all currently occupied channels in the app',
        inputSchema: {
            type: 'object',
            properties: {
                filter_by_prefix: { type: 'string', description: 'Optional prefix to filter channels (e.g. "presence-", "private-")' },
                info: { type: 'string', description: 'Optional comma-separated attributes to include (e.g. "user_count")' },
            },
        },
    },
    {
        name: 'get_channel_users',
        description: 'Get the list of users subscribed to a presence channel',
        inputSchema: {
            type: 'object',
            properties: {
                channel_name: { type: 'string', description: 'The presence channel name (must start with "presence-")' },
            },
            required: ['channel_name'],
        },
    },
    {
        name: 'get_app_info',
        description: 'Get basic app configuration info (app_id, key, cluster)',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'authenticate_private_channel',
        description: 'Generate an auth signature for a private channel. Used by client-side Pusher SDK to authenticate subscriptions.',
        inputSchema: {
            type: 'object',
            properties: {
                socket_id: { type: 'string', description: 'The socket ID from the Pusher client (provided in auth callback)' },
                channel_name: { type: 'string', description: 'The private channel name to authenticate (must start with "private-")' },
            },
            required: ['socket_id', 'channel_name'],
        },
    },
    {
        name: 'authenticate_presence_channel',
        description: 'Generate an auth signature for a presence channel, including user identity data.',
        inputSchema: {
            type: 'object',
            properties: {
                socket_id: { type: 'string', description: 'The socket ID from the Pusher client' },
                channel_name: { type: 'string', description: 'The presence channel name (must start with "presence-")' },
                user_id: { type: 'string', description: 'The user ID to associate with this channel subscription' },
                user_info: { type: 'object', description: 'Optional user metadata (e.g. { name, email, avatar })' },
            },
            required: ['socket_id', 'channel_name', 'user_id'],
        },
    },
];

// ── HMAC-SHA256 signing helpers ───────────────────────────────────────────────

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Sign a Pusher REST API request.
 * Returns the full signed query string to append to the URL.
 */
async function signRequest(
    method: string,
    path: string,
    params: Record<string, string>,
    appKey: string,
    appSecret: string,
): Promise<string> {
    const ts = Math.floor(Date.now() / 1000).toString();

    // Build params including auth fields (except signature)
    const allParams: Record<string, string> = {
        ...params,
        auth_key: appKey,
        auth_timestamp: ts,
        auth_version: '1.0',
    };

    // Sort alphabetically and build query string
    const sortedQuery = Object.keys(allParams)
        .sort()
        .map(k => `${k}=${allParams[k]}`)
        .join('&');

    // String to sign: METHOD\nPATH\nSORTED_QUERY
    const stringToSign = `${method}\n${path}\n${sortedQuery}`;
    const signature = await hmacSha256Hex(appSecret, stringToSign);

    return `${sortedQuery}&auth_signature=${signature}`;
}

// ── Pusher API helper ─────────────────────────────────────────────────────────

interface PusherCreds {
    appId: string;
    appKey: string;
    appSecret: string;
    cluster: string;
}

async function pusherGet(
    path: string,
    queryParams: Record<string, string>,
    creds: PusherCreds,
): Promise<unknown> {
    const fullPath = `/apps/${creds.appId}${path}`;
    const signedQuery = await signRequest('GET', fullPath, queryParams, creds.appKey, creds.appSecret);
    const url = `https://api-${creds.cluster}.pusher.com${fullPath}?${signedQuery}`;

    const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Pusher API error ${res.status}: ${text}`);
    }

    return res.json();
}

async function pusherPost(
    path: string,
    body: Record<string, unknown>,
    creds: PusherCreds,
): Promise<unknown> {
    const fullPath = `/apps/${creds.appId}${path}`;

    // For POST requests, the body MD5 is included in the signed params
    const bodyStr = JSON.stringify(body);
    const bodyMd5 = await md5Hex(bodyStr);

    const signedQuery = await signRequest(
        'POST',
        fullPath,
        { body_md5: bodyMd5 },
        creds.appKey,
        creds.appSecret,
    );

    const url = `https://api-${creds.cluster}.pusher.com${fullPath}?${signedQuery}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Pusher API error ${res.status}: ${text}`);
    }

    return res.json();
}

/** Simple MD5 using Web Crypto (via SHA-1 fallback — Pusher actually uses MD5 for body) */
async function md5Hex(str: string): Promise<string> {
    // Note: Web Crypto doesn't support MD5. We compute a simple hex hash
    // by encoding and using a compatible approach. Pusher also accepts
    // requests without body_md5 for simple cases, but we include it for spec compliance.
    // Since crypto.subtle doesn't support MD5, we use a pure-JS implementation.
    const enc = new TextEncoder();
    const data = enc.encode(str);
    return md5(data);
}

/** Pure-JS MD5 implementation (no external deps) */
function md5(data: Uint8Array): string {
    // MD5 constants
    const K = new Uint32Array(64);
    for (let i = 0; i < 64; i++) {
        K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
    }
    const S = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];

    const msgLen = data.length;
    const bitLen = msgLen * 8;

    // Pad message
    const padLen = ((msgLen % 64) < 56) ? (56 - msgLen % 64) : (120 - msgLen % 64);
    const padded = new Uint8Array(msgLen + padLen + 8);
    padded.set(data);
    padded[msgLen] = 0x80;

    // Append length in bits as little-endian 64-bit
    const view = new DataView(padded.buffer);
    view.setUint32(msgLen + padLen, bitLen & 0xffffffff, true);
    view.setUint32(msgLen + padLen + 4, Math.floor(bitLen / 0x100000000), true);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    for (let i = 0; i < padded.length; i += 64) {
        const M = new Uint32Array(16);
        for (let j = 0; j < 16; j++) {
            M[j] = view.getUint32(i + j * 4, true);
        }

        let A = a0, B = b0, C = c0, D = d0;

        for (let j = 0; j < 64; j++) {
            let F: number, g: number;
            if (j < 16) {
                F = (B & C) | (~B & D);
                g = j;
            } else if (j < 32) {
                F = (D & B) | (~D & C);
                g = (5 * j + 1) % 16;
            } else if (j < 48) {
                F = B ^ C ^ D;
                g = (3 * j + 5) % 16;
            } else {
                F = C ^ (B | ~D);
                g = (7 * j) % 16;
            }
            F = (F + A + K[j] + M[g]) >>> 0;
            A = D;
            D = C;
            C = B;
            B = (B + ((F << S[j]) | (F >>> (32 - S[j])))) >>> 0;
        }

        a0 = (a0 + A) >>> 0;
        b0 = (b0 + B) >>> 0;
        c0 = (c0 + C) >>> 0;
        d0 = (d0 + D) >>> 0;
    }

    function toLEHex(n: number): string {
        return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    return toLEHex(a0) + toLEHex(b0) + toLEHex(c0) + toLEHex(d0);
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>, creds: PusherCreds): Promise<unknown> {
    switch (name) {

        case 'trigger_event': {
            const body: Record<string, unknown> = {
                channel: args.channel,
                name: args.event_name,
                data: JSON.stringify(args.data),
            };
            if (args.socket_id) body.socket_id = args.socket_id;
            const result = await pusherPost('/events', body, creds) as Record<string, unknown>;
            return result;
        }

        case 'trigger_batch_events': {
            const events = args.events as Array<Record<string, unknown>>;
            if (!Array.isArray(events)) throw new Error('events must be an array');
            if (events.length > 10) throw new Error('trigger_batch_events supports max 10 events per request');
            const batch = events.map(e => ({
                channel: e.channel,
                name: e.name,
                data: JSON.stringify(e.data),
            }));
            const result = await pusherPost('/batch_events', { batch }, creds) as Record<string, unknown>;
            return result;
        }

        case 'get_channel_info': {
            const params: Record<string, string> = {};
            if (args.info) params.info = String(args.info);
            const result = await pusherGet(`/channels/${args.channel_name}`, params, creds) as Record<string, unknown>;
            return result;
        }

        case 'list_channels': {
            const params: Record<string, string> = {};
            if (args.filter_by_prefix) params.filter_by_prefix = String(args.filter_by_prefix);
            if (args.info) params.info = String(args.info);
            const result = await pusherGet('/channels', params, creds) as Record<string, unknown>;
            return result;
        }

        case 'get_channel_users': {
            const result = await pusherGet(`/channels/${args.channel_name}/users`, {}, creds) as Record<string, unknown>;
            return result;
        }

        case 'get_app_info': {
            return {
                app_id: creds.appId,
                key: creds.appKey,
                cluster: creds.cluster,
            };
        }

        case 'authenticate_private_channel': {
            const socketId = String(args.socket_id);
            const channelName = String(args.channel_name);
            const stringToSign = `${socketId}:${channelName}`;
            const sig = await hmacSha256Hex(creds.appSecret, stringToSign);
            return {
                auth: `${creds.appKey}:${sig}`,
            };
        }

        case 'authenticate_presence_channel': {
            const socketId = String(args.socket_id);
            const channelName = String(args.channel_name);
            const userId = String(args.user_id);
            const userInfo = (args.user_info ?? {}) as Record<string, unknown>;

            const channelData = JSON.stringify({ user_id: userId, user_info: userInfo });
            const stringToSign = `${socketId}:${channelName}:${channelData}`;
            const sig = await hmacSha256Hex(creds.appSecret, stringToSign);

            return {
                auth: `${creds.appKey}:${sig}`,
                channel_data: channelData,
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker entry ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-pusher', version: '1.0.0', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
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
                serverInfo: { name: 'mcp-pusher', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const appId = request.headers.get('X-Mcp-Secret-PUSHER-APP-ID');
            const appKey = request.headers.get('X-Mcp-Secret-PUSHER-KEY');
            const appSecret = request.headers.get('X-Mcp-Secret-PUSHER-SECRET');
            const cluster = request.headers.get('X-Mcp-Secret-PUSHER-CLUSTER');

            if (!appId || !appKey || !appSecret || !cluster) {
                const missing = [
                    !appId && 'PUSHER_APP_ID',
                    !appKey && 'PUSHER_KEY',
                    !appSecret && 'PUSHER_SECRET',
                    !cluster && 'PUSHER_CLUSTER',
                ].filter(Boolean).join(', ');
                return rpcErr(id, -32001, `Missing Pusher secrets: ${missing} — add them to your workspace secrets`);
            }

            const creds: PusherCreds = { appId, appKey, appSecret, cluster };

            try {
                const result = await callTool(toolName, toolArgs, creds);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
