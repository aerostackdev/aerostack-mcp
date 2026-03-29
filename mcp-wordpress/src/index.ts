/**
 * WordPress MCP Worker
 * Implements MCP protocol over HTTP for WordPress REST API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: WORDPRESS_USERNAME     → header: X-Mcp-Secret-WORDPRESS-USERNAME
 * Secret: WORDPRESS_APP_PASSWORD → header: X-Mcp-Secret-WORDPRESS-APP-PASSWORD
 * Secret: WORDPRESS_DOMAIN       → header: X-Mcp-Secret-WORDPRESS-DOMAIN
 */

function rpcOk(id: string | number | null, result: unknown): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: string | number | null, code: number, message: string): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    const missing = fields.filter(f => args[f] === undefined || args[f] === null || args[f] === '');
    if (missing.length > 0) throw new Error(`Missing required fields: ${missing.join(', ')}`);
}

const TOOLS = [
    {
        name: 'list_posts',
        description: 'List published posts from a WordPress site',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Posts per page (default 20)' },
                page: { type: 'number', description: 'Page number (default 1)' },
                status: { type: 'string', description: 'Post status filter (default publish)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_post',
        description: 'Get a single WordPress post by ID',
        inputSchema: {
            type: 'object',
            properties: {
                postId: { type: 'number', description: 'Post ID' },
            },
            required: ['postId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_post',
        description: 'Create a new WordPress post',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Post title' },
                content: { type: 'string', description: 'Post content (HTML)' },
                status: { type: 'string', description: 'Post status (draft, publish, etc.)' },
                excerpt: { type: 'string', description: 'Post excerpt (optional)' },
                categories: { type: 'array', items: { type: 'number' }, description: 'Category IDs (optional)' },
                tags: { type: 'array', items: { type: 'number' }, description: 'Tag IDs (optional)' },
            },
            required: ['title', 'content'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_post',
        description: 'Update an existing WordPress post',
        inputSchema: {
            type: 'object',
            properties: {
                postId: { type: 'number', description: 'Post ID to update' },
                title: { type: 'string', description: 'New title (optional)' },
                content: { type: 'string', description: 'New content (optional)' },
                status: { type: 'string', description: 'New status (optional)' },
            },
            required: ['postId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'delete_post',
        description: 'Delete a WordPress post permanently',
        inputSchema: {
            type: 'object',
            properties: {
                postId: { type: 'number', description: 'Post ID to delete' },
            },
            required: ['postId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_pages',
        description: 'List pages on a WordPress site',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Pages per page (default 20)' },
                page: { type: 'number', description: 'Page number (default 1)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_page',
        description: 'Get a single WordPress page by ID',
        inputSchema: {
            type: 'object',
            properties: {
                pageId: { type: 'number', description: 'Page ID' },
            },
            required: ['pageId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_page',
        description: 'Create a new WordPress page',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Page title' },
                content: { type: 'string', description: 'Page content (HTML)' },
                status: { type: 'string', description: 'Page status (optional, default draft)' },
                parent: { type: 'number', description: 'Parent page ID (optional)' },
            },
            required: ['title', 'content'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_categories',
        description: 'List all categories on the WordPress site',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Categories per page (default 100)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_category',
        description: 'Create a new category',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Category name' },
                description: { type: 'string', description: 'Category description (optional)' },
                parent: { type: 'number', description: 'Parent category ID (optional)' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_tags',
        description: 'List tags on the WordPress site',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Tags per page (default 100)' },
                search: { type: 'string', description: 'Filter by search term (optional)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_media',
        description: 'List media files on the WordPress site',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Items per page (default 20)' },
                media_type: { type: 'string', description: 'Filter by media type (default image)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_comments',
        description: 'List comments on a post',
        inputSchema: {
            type: 'object',
            properties: {
                postId: { type: 'number', description: 'Post ID to list comments for' },
                per_page: { type: 'number', description: 'Comments per page (default 20)' },
                status: { type: 'string', description: 'Comment status filter (default approve)' },
            },
            required: ['postId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_site_settings',
        description: 'Get WordPress site settings and configuration',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true },
    },
];

async function wpFetch(
    path: string,
    domain: string,
    username: string,
    appPassword: string,
    opts: RequestInit = {}
): Promise<unknown> {
    const credentials = btoa(`${username}:${appPassword}`);
    const url = `https://${domain}/wp-json/wp/v2${path}`;
    const res = await fetch(url, {
        ...opts,
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`WordPress API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    domain: string,
    username: string,
    appPassword: string
): Promise<unknown> {
    switch (name) {
        case 'list_posts': {
            const perPage = args.per_page ?? 20;
            const page = args.page ?? 1;
            const status = args.status ?? 'publish';
            return wpFetch(`/posts?per_page=${perPage}&page=${page}&status=${status}`, domain, username, appPassword);
        }
        case 'get_post': {
            validateRequired(args, ['postId']);
            return wpFetch(`/posts/${args.postId}`, domain, username, appPassword);
        }
        case 'create_post': {
            validateRequired(args, ['title', 'content']);
            const body: Record<string, unknown> = { title: args.title, content: args.content };
            if (args.status) body.status = args.status;
            if (args.excerpt) body.excerpt = args.excerpt;
            if (args.categories) body.categories = args.categories;
            if (args.tags) body.tags = args.tags;
            return wpFetch('/posts', domain, username, appPassword, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }
        case 'update_post': {
            validateRequired(args, ['postId']);
            const { postId, ...rest } = args;
            return wpFetch(`/posts/${postId}`, domain, username, appPassword, {
                method: 'POST',
                body: JSON.stringify(rest),
            });
        }
        case 'delete_post': {
            validateRequired(args, ['postId']);
            return wpFetch(`/posts/${args.postId}?force=true`, domain, username, appPassword, {
                method: 'DELETE',
            });
        }
        case 'list_pages': {
            const perPage = args.per_page ?? 20;
            const page = args.page ?? 1;
            return wpFetch(`/pages?per_page=${perPage}&page=${page}`, domain, username, appPassword);
        }
        case 'get_page': {
            validateRequired(args, ['pageId']);
            return wpFetch(`/pages/${args.pageId}`, domain, username, appPassword);
        }
        case 'create_page': {
            validateRequired(args, ['title', 'content']);
            const body: Record<string, unknown> = { title: args.title, content: args.content };
            if (args.status) body.status = args.status;
            if (args.parent !== undefined) body.parent = args.parent;
            return wpFetch('/pages', domain, username, appPassword, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }
        case 'list_categories': {
            const perPage = args.per_page ?? 100;
            return wpFetch(`/categories?per_page=${perPage}`, domain, username, appPassword);
        }
        case 'create_category': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.description) body.description = args.description;
            if (args.parent !== undefined) body.parent = args.parent;
            return wpFetch('/categories', domain, username, appPassword, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }
        case 'list_tags': {
            const perPage = args.per_page ?? 100;
            let url = `/tags?per_page=${perPage}`;
            if (args.search) url += `&search=${encodeURIComponent(String(args.search))}`;
            return wpFetch(url, domain, username, appPassword);
        }
        case 'list_media': {
            const perPage = args.per_page ?? 20;
            const mediaType = args.media_type ?? 'image';
            return wpFetch(`/media?per_page=${perPage}&media_type=${mediaType}`, domain, username, appPassword);
        }
        case 'list_comments': {
            validateRequired(args, ['postId']);
            const perPage = args.per_page ?? 20;
            const status = args.status ?? 'approve';
            return wpFetch(`/comments?per_page=${perPage}&post=${args.postId}&status=${status}`, domain, username, appPassword);
        }
        case 'get_site_settings': {
            return wpFetch('/settings', domain, username, appPassword);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'wordpress-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string | null; method: string; params?: Record<string, unknown> };
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
                serverInfo: { name: 'wordpress-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const username = request.headers.get('X-Mcp-Secret-WORDPRESS-USERNAME');
            const appPassword = request.headers.get('X-Mcp-Secret-WORDPRESS-APP-PASSWORD');
            const domain = request.headers.get('X-Mcp-Secret-WORDPRESS-DOMAIN');

            if (!username || !appPassword || !domain) {
                return rpcErr(id, -32001, 'Missing secrets — add WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD, and WORDPRESS_DOMAIN to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, domain, username, appPassword);
                return rpcOk(id, toolOk(result));
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
