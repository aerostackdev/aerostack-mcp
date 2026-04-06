/**
 * Ghost MCP Worker
 * Implements MCP protocol over HTTP for Ghost CMS Admin API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   GHOST_URL           → X-Mcp-Secret-GHOST-URL           (e.g. https://myblog.ghost.io)
 *   GHOST_ADMIN_API_KEY → X-Mcp-Secret-GHOST-ADMIN-API-KEY (format: {id}:{secret})
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
        name: '_ping',
        description: 'Verify Ghost credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_posts',
        description: 'List posts from the Ghost blog',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of posts to return (default 15)' },
                status: {
                    type: 'string',
                    description: 'Filter by status: published, draft, or scheduled (default published)',
                    enum: ['published', 'draft', 'scheduled'],
                },
                fields: { type: 'string', description: 'Comma-separated list of fields to return (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_post',
        description: 'Get a specific post by ID including its full HTML content',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: { type: 'string', description: 'Ghost post ID' },
            },
            required: ['post_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_post',
        description: 'Create a new post in Ghost',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Post title' },
                html: { type: 'string', description: 'Post content as HTML (optional)' },
                status: {
                    type: 'string',
                    description: 'Post status: draft or published (default draft)',
                    enum: ['draft', 'published'],
                },
                tags: { type: 'array', description: 'Array of tag names (optional)', items: { type: 'string' } },
                excerpt: { type: 'string', description: 'Post excerpt (optional)' },
                featured: { type: 'boolean', description: 'Whether to feature the post (optional)' },
            },
            required: ['title'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_post',
        description: 'Update an existing post. Must provide updated_at from the current post for conflict detection.',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: { type: 'string', description: 'Ghost post ID' },
                updated_at: { type: 'string', description: 'Current post updated_at timestamp (required for conflict detection)' },
                title: { type: 'string', description: 'New post title (optional)' },
                html: { type: 'string', description: 'New post content as HTML (optional)' },
                status: { type: 'string', description: 'New status: draft, published, or scheduled (optional)' },
            },
            required: ['post_id', 'updated_at'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_post',
        description: 'Delete a post from Ghost permanently',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: { type: 'string', description: 'Ghost post ID to delete' },
            },
            required: ['post_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'publish_post',
        description: 'Publish a draft post (shortcut for update_post with status=published)',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: { type: 'string', description: 'Ghost post ID' },
                updated_at: { type: 'string', description: 'Current post updated_at timestamp (required for conflict detection)' },
            },
            required: ['post_id', 'updated_at'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_pages',
        description: 'List pages from the Ghost site',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of pages to return (default 15)' },
                status: {
                    type: 'string',
                    description: 'Filter by status: published or draft (default published)',
                    enum: ['published', 'draft'],
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_members',
        description: 'List members of the Ghost site',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of members to return (default 20)' },
                email: { type: 'string', description: 'Filter by email address (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_member',
        description: 'Create a new member in Ghost',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Member email address' },
                name: { type: 'string', description: 'Member display name (optional)' },
                note: { type: 'string', description: 'Internal note about the member (optional)' },
                labels: { type: 'array', description: 'Array of label names to apply (optional)', items: { type: 'string' } },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// Base64url encoding (no padding, URL-safe)
function base64url(data: Uint8Array | string): string {
    let bytes: Uint8Array;
    if (typeof data === 'string') {
        bytes = new TextEncoder().encode(data);
    } else {
        bytes = data;
    }
    // Convert to base64 via btoa
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

// Decode hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

async function getGhostToken(adminApiKey: string): Promise<string> {
    const colonIdx = adminApiKey.indexOf(':');
    if (colonIdx === -1) throw new Error('Invalid GHOST_ADMIN_API_KEY format — expected {id}:{secret}');

    const id = adminApiKey.substring(0, colonIdx);
    const hexSecret = adminApiKey.substring(colonIdx + 1);

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', kid: id, typ: 'JWT' };
    const payload = { iat: now, exp: now + 300, aud: '/admin/' };

    const headerEncoded = base64url(JSON.stringify(header));
    const payloadEncoded = base64url(JSON.stringify(payload));
    const signingInput = `${headerEncoded}.${payloadEncoded}`;

    const keyBytes = hexToBytes(hexSecret);
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );

    const sigBytes = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        new TextEncoder().encode(signingInput),
    );

    const sigEncoded = base64url(new Uint8Array(sigBytes));
    return `${signingInput}.${sigEncoded}`;
}

async function ghostApi(
    path: string,
    ghostUrl: string,
    token: string,
    opts: RequestInit = {},
): Promise<unknown> {
    const url = `${ghostUrl}/ghost/api/admin/${path}`;
    const res = await fetch(url, {
        ...opts,
        headers: {
            Authorization: `Ghost ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });

    if (res.status === 204) {
        return null;
    }

    if (!res.ok) {
        const text = await res.text();
        let msg = `Ghost API ${res.status}`;
        try {
            const err = JSON.parse(text);
            msg = err.errors?.[0]?.message ?? msg;
        } catch {
            msg = `${msg}: ${text}`;
        }
        throw new Error(msg);
    }

    return res.json();
}

interface GhostSecrets {
    ghostUrl: string;
    adminApiKey: string;
}

async function callTool(name: string, args: Record<string, unknown>, secrets: GhostSecrets): Promise<unknown> {
    const { ghostUrl, adminApiKey } = secrets;
    const token = await getGhostToken(adminApiKey);

    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const data = await ghostApi('users/me/?fields=id,name,email', ghostUrl, token) as any;
            return { content: [{ type: 'text', text: `Connected to Ghost` }] };
        }

        case 'list_posts': {
            const limit = Number(args.limit ?? 15);
            const status = String(args.status ?? 'published');
            const params = new URLSearchParams({ limit: String(limit), filter: `status:${status}` });
            if (args.fields) params.set('fields', String(args.fields));
            const data = await ghostApi(`posts/?${params}`, ghostUrl, token) as any;
            return (data.posts ?? []).map((p: any) => ({
                id: p.id,
                title: p.title,
                slug: p.slug,
                status: p.status,
                published_at: p.published_at,
                excerpt: p.custom_excerpt ?? p.excerpt,
                url: p.url,
                reading_time: p.reading_time,
            }));
        }

        case 'get_post': {
            if (!args.post_id) throw new Error('post_id is required');
            const data = await ghostApi(`posts/${args.post_id}/`, ghostUrl, token) as any;
            return data.posts?.[0] ?? data;
        }

        case 'create_post': {
            if (!args.title) throw new Error('title is required');
            const post: Record<string, unknown> = {
                title: args.title,
                status: args.status ?? 'draft',
            };
            if (args.html) post.html = args.html;
            if (args.tags) post.tags = (args.tags as string[]).map(t => ({ name: t }));
            if (args.excerpt) post.custom_excerpt = args.excerpt;
            if (args.featured != null) post.featured = args.featured;

            const data = await ghostApi('posts/', ghostUrl, token, {
                method: 'POST',
                body: JSON.stringify({ posts: [post] }),
            }) as any;
            return data.posts?.[0] ?? data;
        }

        case 'update_post': {
            if (!args.post_id) throw new Error('post_id is required');
            if (!args.updated_at) throw new Error('updated_at is required for conflict detection');

            const fields: Record<string, unknown> = { updated_at: args.updated_at };
            if (args.title) fields.title = args.title;
            if (args.html) fields.html = args.html;
            if (args.status) fields.status = args.status;

            const data = await ghostApi(`posts/${args.post_id}/`, ghostUrl, token, {
                method: 'PUT',
                body: JSON.stringify({ posts: [fields] }),
            }) as any;
            return data.posts?.[0] ?? data;
        }

        case 'delete_post': {
            if (!args.post_id) throw new Error('post_id is required');
            await ghostApi(`posts/${args.post_id}/`, ghostUrl, token, { method: 'DELETE' });
            return { deleted: true, post_id: args.post_id };
        }

        case 'publish_post': {
            if (!args.post_id) throw new Error('post_id is required');
            if (!args.updated_at) throw new Error('updated_at is required for conflict detection');

            const data = await ghostApi(`posts/${args.post_id}/`, ghostUrl, token, {
                method: 'PUT',
                body: JSON.stringify({ posts: [{ status: 'published', updated_at: args.updated_at }] }),
            }) as any;
            return data.posts?.[0] ?? data;
        }

        case 'list_pages': {
            const limit = Number(args.limit ?? 15);
            const status = String(args.status ?? 'published');
            const params = new URLSearchParams({ limit: String(limit), filter: `status:${status}` });
            const data = await ghostApi(`pages/?${params}`, ghostUrl, token) as any;
            return (data.pages ?? []).map((p: any) => ({
                id: p.id,
                title: p.title,
                slug: p.slug,
                status: p.status,
                url: p.url,
            }));
        }

        case 'list_members': {
            const limit = Number(args.limit ?? 20);
            const params = new URLSearchParams({ limit: String(limit) });
            if (args.email) params.set('filter', `email:'${args.email}'`);
            const data = await ghostApi(`members/?${params}`, ghostUrl, token) as any;
            return (data.members ?? []).map((m: any) => ({
                id: m.id,
                name: m.name,
                email: m.email,
                status: m.status,
                created_at: m.created_at,
                subscribed: m.subscribed,
            }));
        }

        case 'create_member': {
            if (!args.email) throw new Error('email is required');
            const member: Record<string, unknown> = { email: args.email };
            if (args.name) member.name = args.name;
            if (args.note) member.note = args.note;
            if (args.labels) member.labels = (args.labels as string[]).map(l => ({ name: l }));

            const data = await ghostApi('members/', ghostUrl, token, {
                method: 'POST',
                body: JSON.stringify({ members: [member] }),
            }) as any;
            return data.members?.[0] ?? data;
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'ghost-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: any;
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { jsonrpc, id, method, params } = body;
        if (jsonrpc !== '2.0') return rpcErr(id ?? null, -32600, 'Invalid Request');

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'ghost-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const ghostUrl = request.headers.get('X-Mcp-Secret-GHOST-URL');
            const adminApiKey = request.headers.get('X-Mcp-Secret-GHOST-ADMIN-API-KEY');

            if (!ghostUrl || !adminApiKey) {
                return rpcErr(id, -32001, 'Missing required secrets: GHOST_URL, GHOST_ADMIN_API_KEY');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, { ghostUrl, adminApiKey });
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
