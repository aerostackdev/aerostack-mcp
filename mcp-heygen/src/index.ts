/**
 * HeyGen MCP Worker
 * Implements MCP protocol over HTTP for HeyGen AI video generation operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   HEYGEN_API_KEY → X-Mcp-Secret-HEYGEN-API-KEY
 *
 * Auth format: X-Api-Key: {api_key} (not Authorization: Bearer)
 * Base URL: https://api.heygen.com
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

const BASE = 'https://api.heygen.com';

async function apiFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'X-Api-Key': apiKey,
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
        throw { code: -32603, message: `HeyGen HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'message' in data) {
            msg = (data as { message: string }).message || msg;
        } else if (data && typeof data === 'object' && 'error' in data) {
            const errObj = (data as { error: string | { message?: string } }).error;
            if (typeof errObj === 'string') {
                msg = errObj;
            } else if (errObj && typeof errObj === 'object' && 'message' in errObj) {
                msg = errObj.message || msg;
            }
        }
        throw { code: -32603, message: `HeyGen API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_avatars',
        description: 'List all available avatars in HeyGen.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_voices',
        description: 'List all available voices for video generation.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_video',
        description: 'Generate an AI video with an avatar speaking the provided text.',
        inputSchema: {
            type: 'object',
            properties: {
                avatar_id: { type: 'string', description: 'Avatar ID to use in the video (required)' },
                voice_id: { type: 'string', description: 'Voice ID for text-to-speech (required)' },
                input_text: { type: 'string', description: 'Text for the avatar to speak (required)' },
                avatar_style: {
                    type: 'string',
                    enum: ['normal', 'circle', 'closeUp'],
                    description: 'Avatar display style (default: normal)',
                },
                width: { type: 'number', description: 'Video width in pixels (default: 1280)' },
                height: { type: 'number', description: 'Video height in pixels (default: 720)' },
                caption: { type: 'boolean', description: 'Enable captions/subtitles (default: false)' },
            },
            required: ['avatar_id', 'voice_id', 'input_text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_video_status',
        description: 'Check the generation status and get the video URL when complete.',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: { type: 'string', description: 'Video ID returned from create_video' },
            },
            required: ['video_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_videos',
        description: 'List previously generated videos.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of videos to return (default 10)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_video',
        description: 'Delete a generated video. This action cannot be undone.',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: { type: 'string', description: 'Video ID to delete' },
            },
            required: ['video_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_remaining_quota',
        description: 'Get the remaining video generation quota for your account.',
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
        case 'list_avatars': {
            return apiFetch('/v2/avatars', apiKey);
        }

        case 'list_voices': {
            return apiFetch('/v2/voices', apiKey);
        }

        case 'create_video': {
            validateRequired(args, ['avatar_id', 'voice_id', 'input_text']);
            const body = {
                video_inputs: [{
                    character: {
                        type: 'avatar',
                        avatar_id: args.avatar_id,
                        avatar_style: args.avatar_style ?? 'normal',
                    },
                    voice: {
                        type: 'text',
                        input_text: args.input_text,
                        voice_id: args.voice_id,
                    },
                }],
                dimension: {
                    width: args.width ?? 1280,
                    height: args.height ?? 720,
                },
                caption: args.caption ?? false,
            };
            return apiFetch('/v2/video/generate', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_video_status': {
            validateRequired(args, ['video_id']);
            return apiFetch(`/v1/video_status.get?video_id=${args.video_id}`, apiKey);
        }

        case 'list_videos': {
            const limit = args.limit ?? 10;
            return apiFetch(`/v1/video.list?limit=${limit}`, apiKey);
        }

        case 'delete_video': {
            validateRequired(args, ['video_id']);
            return apiFetch(`/v1/video/${encodeURIComponent(String(args.video_id))}`, apiKey, { method: 'DELETE' });
        }

        case 'get_remaining_quota': {
            return apiFetch('/v2/user/remaining_quota', apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-heygen', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-heygen', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const apiKey = request.headers.get('X-Mcp-Secret-HEYGEN-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: HEYGEN_API_KEY (header: X-Mcp-Secret-HEYGEN-API-KEY)');
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
