/**
 * Loom MCP Worker
 * Implements MCP protocol over HTTP for Loom Developer API.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: LOOM_ACCESS_TOKEN → header: X-Mcp-Secret-LOOM-ACCESS-TOKEN
 * Docs: https://developer.loom.com/docs
 */

const LOOM_API = 'https://developer.loom.com/v1';

function rpcOk(id: number | string | unknown, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: number | string | null | unknown, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Loom API connectivity by fetching the authenticated user. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'list_videos',
        description: 'List Loom video recordings with optional folder filter and pagination',
        inputSchema: {
            type: 'object',
            properties: {
                folder_id: { type: 'string', description: 'Filter videos by folder ID (optional)' },
                per_page: { type: 'number', description: 'Number of videos per page (default 25, max 100)' },
                page: { type: 'number', description: 'Page number for pagination (default 1)' },
            },
        },
    },
    {
        name: 'get_video',
        description: 'Get full details for a Loom video including title, duration, thumbnail, embed URL, transcript, and share link',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: { type: 'string', description: 'The Loom video ID' },
            },
            required: ['video_id'],
        },
    },
    {
        name: 'search_videos',
        description: 'Search Loom videos by keyword across titles and transcripts',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search keyword or phrase' },
                per_page: { type: 'number', description: 'Number of results (default 10, max 50)' },
                page: { type: 'number', description: 'Page number for pagination (default 1)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_video_transcript',
        description: 'Get the full text transcript for a Loom video',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: { type: 'string', description: 'The Loom video ID' },
            },
            required: ['video_id'],
        },
    },
    {
        name: 'get_video_insights',
        description: 'Get analytics and engagement data for a Loom video — total views, unique viewers, average watch percentage, and reactions',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: { type: 'string', description: 'The Loom video ID' },
            },
            required: ['video_id'],
        },
    },
    {
        name: 'list_folders',
        description: 'List all folders in the Loom workspace',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Number of folders per page (default 25, max 100)' },
                page: { type: 'number', description: 'Page number for pagination (default 1)' },
            },
        },
    },
];

/** Make an authenticated request to the Loom Developer API */
async function loom(
    path: string,
    token: string,
    opts: { method?: string; body?: Record<string, unknown>; query?: Record<string, string | number | undefined> } = {},
): Promise<any> {
    const url = new URL(`${LOOM_API}${path}`);
    if (opts.query) {
        for (const [k, v] of Object.entries(opts.query)) {
            if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        }
    }

    const init: RequestInit = {
        method: opts.method ?? (opts.body ? 'POST' : 'GET'),
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };
    if (opts.body) {
        init.body = JSON.stringify(opts.body);
    }

    const res = await fetch(url.toString(), init);
    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Loom API ${res.status}: ${errBody}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await loom('/me', token);
            return text(`Connected to Loom as "${data.name ?? data.email ?? 'authenticated user'}"`);
        }

        case 'list_videos': {
            const perPage = Math.min(Number(args.per_page ?? 25), 100);
            const page = Number(args.page ?? 1);
            const query: Record<string, string | number | undefined> = { per_page: perPage, page };
            if (args.folder_id) query.folder_id = args.folder_id as string;

            const data = await loom('/videos', token, { query });
            const videos = (data.videos ?? []).map((v: any) => ({
                id: v.id,
                title: v.title,
                created_at: v.created_at,
                duration: v.duration,
                thumbnail_url: v.thumbnail_url,
                share_url: v.share_url,
                status: v.status,
                folder_id: v.folder_id,
            }));
            return json({
                videos,
                count: videos.length,
                page,
                total: data.total ?? data.meta?.total,
            });
        }

        case 'get_video': {
            const data = await loom(`/videos/${args.video_id}`, token);
            const v = data.video ?? data;
            return json({
                id: v.id,
                title: v.title,
                description: v.description,
                created_at: v.created_at,
                duration: v.duration,
                status: v.status,
                share_url: v.share_url,
                embed_url: v.embed_url ?? `https://www.loom.com/embed/${v.id}`,
                thumbnail_url: v.thumbnail_url,
                transcript: v.transcript ?? null,
                folder_id: v.folder_id,
                owner: v.owner ?? null,
                privacy: v.privacy ?? null,
            });
        }

        case 'search_videos': {
            const perPage = Math.min(Number(args.per_page ?? 10), 50);
            const page = Number(args.page ?? 1);

            const data = await loom('/videos', token, {
                query: {
                    query: args.query as string,
                    per_page: perPage,
                    page,
                },
            });
            const videos = (data.videos ?? []).map((v: any) => ({
                id: v.id,
                title: v.title,
                created_at: v.created_at,
                duration: v.duration,
                share_url: v.share_url,
                thumbnail_url: v.thumbnail_url,
            }));
            return json({
                query: args.query,
                videos,
                count: videos.length,
                page,
                total: data.total ?? data.meta?.total,
            });
        }

        case 'get_video_transcript': {
            const data = await loom(`/videos/${args.video_id}/transcript`, token);
            const segments = data.transcript ?? data.segments ?? data;
            if (Array.isArray(segments)) {
                const fullText = segments.map((s: any) => s.text ?? s.value ?? '').join(' ');
                return json({
                    video_id: args.video_id,
                    transcript: fullText,
                    segments: segments.map((s: any) => ({
                        start: s.start ?? s.start_time,
                        end: s.end ?? s.end_time,
                        text: s.text ?? s.value,
                    })),
                });
            }
            return json({
                video_id: args.video_id,
                transcript: typeof segments === 'string' ? segments : JSON.stringify(segments),
            });
        }

        case 'get_video_insights': {
            const data = await loom(`/videos/${args.video_id}/insights`, token);
            const insights = data.insights ?? data;
            return json({
                video_id: args.video_id,
                total_views: insights.total_views ?? insights.view_count ?? 0,
                unique_viewers: insights.unique_viewers ?? insights.unique_view_count ?? 0,
                avg_watch_percentage: insights.avg_watch_percentage ?? insights.average_percent_watched ?? null,
                total_watch_time_seconds: insights.total_watch_time ?? insights.total_watch_time_seconds ?? null,
                reactions: insights.reactions ?? insights.total_reactions ?? 0,
                comments: insights.comments ?? insights.total_comments ?? 0,
                cta_clicks: insights.cta_clicks ?? null,
            });
        }

        case 'list_folders': {
            const perPage = Math.min(Number(args.per_page ?? 25), 100);
            const page = Number(args.page ?? 1);

            const data = await loom('/folders', token, { query: { per_page: perPage, page } });
            const folders = (data.folders ?? []).map((f: any) => ({
                id: f.id,
                name: f.name,
                created_at: f.created_at,
                video_count: f.video_count ?? f.num_videos ?? null,
                parent_folder_id: f.parent_folder_id ?? null,
            }));
            return json({
                folders,
                count: folders.length,
                page,
                total: data.total ?? data.meta?.total,
            });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-loom', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
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
                serverInfo: { name: 'mcp-loom', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-LOOM-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing LOOM_ACCESS_TOKEN secret — add it to your workspace secrets');
            }

            const { name, arguments: toolArgs = {} } = (params ?? {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, toolArgs, token);
                return rpcOk(id, result);
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
