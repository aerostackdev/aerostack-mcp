// mcp-mux — Aerostack MCP Server
// Wraps the Mux video API for asset and live stream management
// Secrets: X-Mcp-Secret-MUX-TOKEN-ID, X-Mcp-Secret-MUX-TOKEN-SECRET

const TOOLS = [
    {
        name: 'list_assets',
        description: 'List video assets in your Mux environment',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Maximum number of assets to return (default: 25)' },
            },
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_asset',
        description: 'Get details for a specific video asset',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Mux asset ID' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_asset',
        description: 'Delete a video asset permanently',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Mux asset ID to delete' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'create_upload',
        description: 'Create a direct upload URL for uploading a video file',
        inputSchema: {
            type: 'object',
            properties: {
                playback_policy: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Playback policy for the resulting asset (default: ["public"])',
                },
                cors_origin: { type: 'string', description: 'Allowed CORS origin for browser uploads (default: "*")' },
            },
            required: [],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_upload',
        description: 'Get the status of a direct upload',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Upload ID' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_live_streams',
        description: 'List live streams in your Mux environment',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Maximum number of live streams to return (default: 25)' },
            },
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_live_stream',
        description: 'Create a new live stream with a stream key',
        inputSchema: {
            type: 'object',
            properties: {
                playback_policy: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Playback policy (default: ["public"])',
                },
            },
            required: [],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_asset_playback_id',
        description: 'List all playback IDs for a given asset',
        inputSchema: {
            type: 'object',
            properties: {
                asset_id: { type: 'string', description: 'Mux asset ID' },
            },
            required: ['asset_id'],
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

function basicAuth(tokenId: string, tokenSecret: string): string {
    return 'Basic ' + btoa(`${tokenId}:${tokenSecret}`);
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    tokenId: string,
    tokenSecret: string,
) {
    const base = 'https://api.mux.com';
    const headers: Record<string, string> = {
        'Authorization': basicAuth(tokenId, tokenSecret),
        'Content-Type': 'application/json',
    };

    switch (name) {
        case 'list_assets': {
            const limit = (args.limit as number) || 25;
            const res = await fetch(`${base}/video/v1/assets?limit=${limit}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { data: unknown[] };
            return json({ assets: data.data });
        }

        case 'get_asset': {
            const id = args.id as string;
            if (!id) return text('Error: "id" is required');
            const res = await fetch(`${base}/video/v1/assets/${encodeURIComponent(id)}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { data: unknown };
            return json(data.data);
        }

        case 'delete_asset': {
            const id = args.id as string;
            if (!id) return text('Error: "id" is required');
            const res = await fetch(`${base}/video/v1/assets/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers,
            });
            if (res.status !== 204 && !res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return text(`Asset "${id}" deleted successfully`);
        }

        case 'create_upload': {
            const playbackPolicy = (args.playback_policy as string[]) || ['public'];
            const corsOrigin = (args.cors_origin as string) || '*';
            const body = {
                new_asset_settings: { playback_policy: playbackPolicy },
                cors_origin: corsOrigin,
            };
            const res = await fetch(`${base}/video/v1/uploads`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { data: unknown };
            return json(data.data);
        }

        case 'get_upload': {
            const id = args.id as string;
            if (!id) return text('Error: "id" is required');
            const res = await fetch(`${base}/video/v1/uploads/${encodeURIComponent(id)}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { data: unknown };
            return json(data.data);
        }

        case 'list_live_streams': {
            const limit = (args.limit as number) || 25;
            const res = await fetch(`${base}/video/v1/live-streams?limit=${limit}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { data: unknown[] };
            return json({ live_streams: data.data });
        }

        case 'create_live_stream': {
            const playbackPolicy = (args.playback_policy as string[]) || ['public'];
            const body = {
                playback_policy: playbackPolicy,
                new_asset_settings: { playback_policy: playbackPolicy },
            };
            const res = await fetch(`${base}/video/v1/live-streams`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { data: unknown };
            return json(data.data);
        }

        case 'get_asset_playback_id': {
            const assetId = args.asset_id as string;
            if (!assetId) return text('Error: "asset_id" is required');
            const res = await fetch(`${base}/video/v1/assets/${encodeURIComponent(assetId)}/playback-ids`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { data: unknown[] };
            return json({ playback_ids: data.data });
        }

        default:
            return text(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-mux', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const tokenId = request.headers.get('X-Mcp-Secret-MUX-TOKEN-ID') || '';
        const tokenSecret = request.headers.get('X-Mcp-Secret-MUX-TOKEN-SECRET') || '';

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
                serverInfo: { name: 'mcp-mux', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(rpcId, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            if (!tokenId || !tokenSecret) {
                return rpcErr(rpcId, -32001, 'Missing secrets: MUX_TOKEN_ID and MUX_TOKEN_SECRET are required');
            }
            const { name, arguments: toolArgs = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, toolArgs, tokenId, tokenSecret);
                return rpcOk(rpcId, result);
            } catch (err) {
                return rpcErr(rpcId, -32603, String(err));
            }
        }

        return rpcErr(rpcId, -32601, `Method not found: ${method}`);
    },
};
