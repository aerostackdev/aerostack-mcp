// mcp-vimeo — Aerostack MCP Server
// Wraps the Vimeo API for video hosting and management
// Secrets: X-Mcp-Secret-VIMEO-ACCESS-TOKEN

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Vimeo credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_me',
        description: 'Get the authenticated Vimeo user profile and account details',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_videos',
        description: "List the authenticated user's videos",
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of videos per page (default: 25)' },
            },
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_video',
        description: 'Get details for a specific video by ID',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: { type: 'string', description: 'Vimeo video ID (numeric)' },
            },
            required: ['video_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_video',
        description: 'Delete a video from Vimeo permanently',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: { type: 'string', description: 'Vimeo video ID to delete' },
            },
            required: ['video_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'edit_video',
        description: 'Update video metadata such as title, description, or privacy settings',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: { type: 'string', description: 'Vimeo video ID' },
                name: { type: 'string', description: 'New title for the video' },
                description: { type: 'string', description: 'New description for the video' },
                privacy_view: {
                    type: 'string',
                    description: 'Privacy setting: "anybody", "nobody", "password", "unlisted", or "users"',
                },
            },
            required: ['video_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_albums',
        description: "List the authenticated user's showcases/albums",
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of albums per page (default: 25)' },
            },
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_video_to_album',
        description: 'Add a video to an album/showcase',
        inputSchema: {
            type: 'object',
            properties: {
                album_id: { type: 'string', description: 'Album/showcase ID' },
                video_id: { type: 'string', description: 'Video ID to add to the album' },
            },
            required: ['album_id', 'video_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_upload_link',
        description: 'Initiate a video upload using the tus protocol and get an upload link',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Video title' },
                size: { type: 'number', description: 'File size in bytes (required for tus upload)' },
                description: { type: 'string', description: 'Optional video description' },
            },
            required: ['name', 'size'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
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

async function callTool(
    name: string,
    args: Record<string, unknown>,
    accessToken: string,
) {
    const base = 'https://api.vimeo.com';
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.vimeo.*+json;version=3.4',
    };

    switch (name) {
        case '_ping': {
            const res = await fetch(`${base}/me`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return text('Connected to Vimeo');
        }

        case 'get_me': {
            const res = await fetch(`${base}/me`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'list_videos': {
            const limit = (args.limit as number) || 25;
            const res = await fetch(`${base}/me/videos?per_page=${limit}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { data: unknown[]; total: number };
            return json({ videos: data.data, total: data.total });
        }

        case 'get_video': {
            const videoId = args.video_id as string;
            if (!videoId) return text('Error: "video_id" is required');
            const res = await fetch(`${base}/videos/${encodeURIComponent(videoId)}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete_video': {
            const videoId = args.video_id as string;
            if (!videoId) return text('Error: "video_id" is required');
            const res = await fetch(`${base}/videos/${encodeURIComponent(videoId)}`, {
                method: 'DELETE',
                headers,
            });
            if (res.status !== 204 && !res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return text(`Video "${videoId}" deleted successfully`);
        }

        case 'edit_video': {
            const videoId = args.video_id as string;
            if (!videoId) return text('Error: "video_id" is required');
            const body: Record<string, unknown> = {};
            if (args.name) body.name = args.name;
            if (args.description) body.description = args.description;
            if (args.privacy_view) body.privacy = { view: args.privacy_view };
            const res = await fetch(`${base}/videos/${encodeURIComponent(videoId)}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'list_albums': {
            const limit = (args.limit as number) || 25;
            const res = await fetch(`${base}/me/albums?per_page=${limit}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { data: unknown[]; total: number };
            return json({ albums: data.data, total: data.total });
        }

        case 'add_video_to_album': {
            const albumId = args.album_id as string;
            const videoId = args.video_id as string;
            if (!albumId || !videoId) return text('Error: "album_id" and "video_id" are required');
            const res = await fetch(`${base}/me/albums/${encodeURIComponent(albumId)}/videos/${encodeURIComponent(videoId)}`, {
                method: 'PUT',
                headers,
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return text(`Video "${videoId}" added to album "${albumId}"`);
        }

        case 'create_upload_link': {
            const videoName = args.name as string;
            const size = args.size as number;
            if (!videoName || !size) return text('Error: "name" and "size" are required');
            const body: Record<string, unknown> = {
                upload: { approach: 'tus', size },
                name: videoName,
            };
            if (args.description) body.description = args.description;
            const res = await fetch(`${base}/me/videos`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
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
                JSON.stringify({ status: 'ok', server: 'mcp-vimeo', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const accessToken = request.headers.get('X-Mcp-Secret-VIMEO-ACCESS-TOKEN') || '';

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
                serverInfo: { name: 'mcp-vimeo', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(rpcId, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            if (!accessToken) {
                return rpcErr(rpcId, -32001, 'Missing secrets: VIMEO_ACCESS_TOKEN is required');
            }
            const { name, arguments: toolArgs = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, toolArgs, accessToken);
                return rpcOk(rpcId, result);
            } catch (err) {
                return rpcErr(rpcId, -32603, String(err));
            }
        }

        return rpcErr(rpcId, -32601, `Method not found: ${method}`);
    },
};
