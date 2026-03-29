/**
 * Mattermost MCP Worker
 * Implements MCP protocol over HTTP for Mattermost team messaging operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   MATTERMOST_URL   → X-Mcp-Secret-MATTERMOST-URL   (e.g. https://your-instance.mattermost.com)
 *   MATTERMOST_TOKEN → X-Mcp-Secret-MATTERMOST-TOKEN  (user or bot access token)
 *
 * Auth format: Authorization: Bearer {token} on all requests
 * Base URL: {MATTERMOST_URL}/api/v4
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

function getSecrets(request: Request): { mmUrl: string | null; mmToken: string | null } {
    return {
        mmUrl: request.headers.get('X-Mcp-Secret-MATTERMOST-URL'),
        mmToken: request.headers.get('X-Mcp-Secret-MATTERMOST-TOKEN'),
    };
}

async function mmFetch(
    baseUrl: string,
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${baseUrl.replace(/\/$/, '')}/api/v4${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
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
        throw new Error(`Mattermost HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'message' in data) {
            msg = (data as { message: string }).message || msg;
        }
        throw new Error(`Mattermost API error ${res.status}: ${msg}`);
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'get_me',
        description: 'Get the current user profile including id, username, email, and roles.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_teams',
        description: 'List all teams the current user is a member of.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_channels',
        description: 'List channels in a team that the current user is a member of.',
        inputSchema: {
            type: 'object',
            properties: {
                team_id: { type: 'string', description: 'Team ID to list channels for' },
            },
            required: ['team_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_channel',
        description: 'Get channel details by channel ID.',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Channel ID' },
            },
            required: ['channel_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'post_message',
        description: 'Post a message to a channel.',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Channel ID to post to' },
                message: { type: 'string', description: 'Message text to post' },
            },
            required: ['channel_id', 'message'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_posts',
        description: 'List recent posts in a channel.',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Channel ID to list posts from' },
                limit: { type: 'number', description: 'Number of posts to return (default 30, max 200)' },
            },
            required: ['channel_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_post',
        description: 'Get a specific post by post ID.',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: { type: 'string', description: 'Post ID to retrieve' },
            },
            required: ['post_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_channel',
        description: 'Create a new channel in a team. type: O=public, P=private.',
        inputSchema: {
            type: 'object',
            properties: {
                team_id: { type: 'string', description: 'Team ID to create channel in' },
                name: { type: 'string', description: 'Channel name (lowercase, no spaces)' },
                display_name: { type: 'string', description: 'Channel display name' },
                type: {
                    type: 'string',
                    enum: ['O', 'P'],
                    description: 'Channel type: O=public, P=private',
                },
            },
            required: ['team_id', 'name', 'display_name', 'type'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    mmUrl: string,
    mmToken: string,
): Promise<unknown> {
    switch (name) {
        case 'get_me':
            return mmFetch(mmUrl, '/users/me', mmToken);

        case 'list_teams':
            return mmFetch(mmUrl, '/users/me/teams', mmToken);

        case 'list_channels': {
            validateRequired(args, ['team_id']);
            return mmFetch(mmUrl, `/users/me/teams/${args.team_id}/channels?include_deleted=false`, mmToken);
        }

        case 'get_channel': {
            validateRequired(args, ['channel_id']);
            return mmFetch(mmUrl, `/channels/${args.channel_id}`, mmToken);
        }

        case 'post_message': {
            validateRequired(args, ['channel_id', 'message']);
            return mmFetch(mmUrl, '/posts', mmToken, {
                method: 'POST',
                body: JSON.stringify({ channel_id: args.channel_id, message: args.message }),
            });
        }

        case 'list_posts': {
            validateRequired(args, ['channel_id']);
            const limit = args.limit ?? 30;
            return mmFetch(mmUrl, `/channels/${args.channel_id}/posts?per_page=${limit}`, mmToken);
        }

        case 'get_post': {
            validateRequired(args, ['post_id']);
            return mmFetch(mmUrl, `/posts/${args.post_id}`, mmToken);
        }

        case 'create_channel': {
            validateRequired(args, ['team_id', 'name', 'display_name', 'type']);
            return mmFetch(mmUrl, '/channels', mmToken, {
                method: 'POST',
                body: JSON.stringify({
                    team_id: args.team_id,
                    name: args.name,
                    display_name: args.display_name,
                    type: args.type,
                }),
            });
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
                JSON.stringify({ status: 'ok', server: 'mcp-mattermost', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-mattermost', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const { mmUrl, mmToken } = getSecrets(request);
            if (!mmUrl || !mmToken) {
                const missing = [];
                if (!mmUrl) missing.push('MATTERMOST_URL (header: X-Mcp-Secret-MATTERMOST-URL)');
                if (!mmToken) missing.push('MATTERMOST_TOKEN (header: X-Mcp-Secret-MATTERMOST-TOKEN)');
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                const result = await callTool(toolName, args, mmUrl, mmToken);
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
