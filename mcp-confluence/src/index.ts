/**
 * Confluence MCP Worker
 * Implements MCP protocol over HTTP for Confluence Cloud REST API (v2).
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   CONFLUENCE_URL       → header: X-Mcp-Secret-CONFLUENCE-URL
 *   CONFLUENCE_EMAIL     → header: X-Mcp-Secret-CONFLUENCE-EMAIL
 *   CONFLUENCE_API_TOKEN → header: X-Mcp-Secret-CONFLUENCE-API-TOKEN
 *
 * Auth: Basic (email:api_token base64-encoded)
 * API base: {CONFLUENCE_URL}/wiki/api/v2
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

function text(value: string) {
    return { content: [{ type: 'text', text: value }] };
}

function json(value: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Confluence credentials by fetching the current user. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_content',
        description: 'Search Confluence content using CQL (Confluence Query Language)',
        inputSchema: {
            type: 'object',
            properties: {
                cql: { type: 'string', description: 'CQL query string (e.g. \'type=page AND text~"deploy guide"\')' },
                limit: { type: 'number', description: 'Max results to return (default 10, max 50)' },
            },
            required: ['cql'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_page',
        description: 'Get a Confluence page by ID, including its body content',
        inputSchema: {
            type: 'object',
            properties: {
                page_id: { type: 'string', description: 'The page ID' },
                body_format: { type: 'string', description: 'Body format: "storage" (HTML), "atlas_doc_format" (ADF JSON), or "view" (rendered). Default: storage' },
            },
            required: ['page_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_page',
        description: 'Create a new Confluence page in a space',
        inputSchema: {
            type: 'object',
            properties: {
                space_id: { type: 'string', description: 'Space ID to create the page in' },
                title: { type: 'string', description: 'Page title' },
                body: { type: 'string', description: 'Page body in Confluence storage format (XHTML)' },
                parent_id: { type: 'string', description: 'Parent page ID (optional — creates as child page)' },
                status: { type: 'string', description: 'Page status: "current" (published) or "draft". Default: current' },
            },
            required: ['space_id', 'title', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_page',
        description: 'Update an existing Confluence page',
        inputSchema: {
            type: 'object',
            properties: {
                page_id: { type: 'string', description: 'The page ID to update' },
                title: { type: 'string', description: 'New page title' },
                body: { type: 'string', description: 'New page body in Confluence storage format (XHTML)' },
                version_number: { type: 'number', description: 'Current version number (required — fetch the page first to get it)' },
                status: { type: 'string', description: 'Page status: "current" or "draft". Default: current' },
            },
            required: ['page_id', 'title', 'body', 'version_number'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_spaces',
        description: 'List all spaces in the Confluence instance',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max spaces to return (default 25, max 100)' },
                type: { type: 'string', description: 'Filter by space type: "global" or "personal" (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_space',
        description: 'Get details for a specific Confluence space',
        inputSchema: {
            type: 'object',
            properties: {
                space_id: { type: 'string', description: 'The space ID' },
            },
            required: ['space_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_pages',
        description: 'List pages in a Confluence space',
        inputSchema: {
            type: 'object',
            properties: {
                space_id: { type: 'string', description: 'Space ID to list pages from' },
                limit: { type: 'number', description: 'Max pages to return (default 25, max 100)' },
                sort: { type: 'string', description: 'Sort order: "created-date", "-created-date", "modified-date", "-modified-date", "title". Default: -modified-date' },
                status: { type: 'string', description: 'Filter by status: "current" or "draft". Default: current' },
            },
            required: ['space_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_comment',
        description: 'Add a comment to a Confluence page',
        inputSchema: {
            type: 'object',
            properties: {
                page_id: { type: 'string', description: 'The page ID to comment on' },
                body: { type: 'string', description: 'Comment body in Confluence storage format (XHTML)' },
            },
            required: ['page_id', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_page_children',
        description: 'Get child pages of a Confluence page',
        inputSchema: {
            type: 'object',
            properties: {
                page_id: { type: 'string', description: 'The parent page ID' },
                limit: { type: 'number', description: 'Max child pages to return (default 25, max 100)' },
            },
            required: ['page_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

interface ConfluenceAuth {
    baseUrl: string;
    authHeader: string;
}

async function confluence(
    auth: ConfluenceAuth,
    path: string,
    method: string = 'GET',
    body?: unknown,
): Promise<unknown> {
    const url = `${auth.baseUrl}/wiki/api/v2${path}`;
    const opts: RequestInit = {
        method,
        headers: {
            Authorization: auth.authHeader,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
    };
    if (body && (method === 'POST' || method === 'PUT')) {
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Confluence HTTP ${res.status}: ${errText}`);
    }

    const contentType = res.headers.get('Content-Type') ?? '';
    if (contentType.includes('application/json')) {
        return res.json();
    }
    return res.text();
}

async function confluenceV1(
    auth: ConfluenceAuth,
    path: string,
    method: string = 'GET',
    body?: unknown,
): Promise<unknown> {
    const url = `${auth.baseUrl}/wiki/rest/api${path}`;
    const opts: RequestInit = {
        method,
        headers: {
            Authorization: auth.authHeader,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
    };
    if (body && (method === 'POST' || method === 'PUT')) {
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Confluence HTTP ${res.status}: ${errText}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, auth: ConfluenceAuth): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await confluence(auth, '/users/me') as any;
            return text(`Connected to Confluence as "${data.displayName}" (${data.email ?? data.accountId})`);
        }

        case 'search_content': {
            const limit = Math.min(Number(args.limit ?? 10), 50);
            const cql = encodeURIComponent(String(args.cql));
            const data = await confluenceV1(auth, `/search?cql=${cql}&limit=${limit}`) as any;
            const results = data.results?.map((r: any) => ({
                id: r.content?.id,
                title: r.content?.title ?? r.title,
                type: r.content?.type,
                space: r.content?.space?.key ?? r.resultGlobalContainer?.title,
                url: r.url,
                lastModified: r.lastModified,
                excerpt: r.excerpt,
            })) ?? [];
            return json(results);
        }

        case 'get_page': {
            const format = String(args.body_format ?? 'storage');
            const data = await confluence(auth, `/pages/${args.page_id}?body-format=${format}`) as any;
            return json({
                id: data.id,
                title: data.title,
                status: data.status,
                spaceId: data.spaceId,
                version: data.version?.number,
                createdAt: data.createdAt,
                body: data.body?.[format]?.value ?? data.body,
                _links: data._links,
            });
        }

        case 'create_page': {
            const payload: Record<string, unknown> = {
                spaceId: args.space_id,
                title: args.title,
                status: args.status ?? 'current',
                body: {
                    representation: 'storage',
                    value: args.body,
                },
            };
            if (args.parent_id) {
                payload.parentId = args.parent_id;
            }
            const data = await confluence(auth, '/pages', 'POST', payload) as any;
            return json({
                id: data.id,
                title: data.title,
                status: data.status,
                spaceId: data.spaceId,
                version: data.version?.number,
                _links: data._links,
            });
        }

        case 'update_page': {
            const payload = {
                id: args.page_id,
                title: args.title,
                status: args.status ?? 'current',
                body: {
                    representation: 'storage',
                    value: args.body,
                },
                version: {
                    number: Number(args.version_number) + 1,
                    message: 'Updated via Aerostack MCP',
                },
            };
            const data = await confluence(auth, `/pages/${args.page_id}`, 'PUT', payload) as any;
            return json({
                id: data.id,
                title: data.title,
                status: data.status,
                version: data.version?.number,
                _links: data._links,
            });
        }

        case 'list_spaces': {
            const limit = Math.min(Number(args.limit ?? 25), 100);
            let path = `/spaces?limit=${limit}`;
            if (args.type) path += `&type=${args.type}`;
            const data = await confluence(auth, path) as any;
            const spaces = data.results?.map((s: any) => ({
                id: s.id,
                key: s.key,
                name: s.name,
                type: s.type,
                status: s.status,
                description: s.description?.plain?.value ?? '',
            })) ?? [];
            return json(spaces);
        }

        case 'get_space': {
            const data = await confluence(auth, `/spaces/${args.space_id}`) as any;
            return json({
                id: data.id,
                key: data.key,
                name: data.name,
                type: data.type,
                status: data.status,
                description: data.description?.plain?.value ?? '',
                homepageId: data.homepageId,
            });
        }

        case 'list_pages': {
            const limit = Math.min(Number(args.limit ?? 25), 100);
            const sort = args.sort ?? '-modified-date';
            const status = args.status ?? 'current';
            const data = await confluence(auth, `/spaces/${args.space_id}/pages?limit=${limit}&sort=${sort}&status=${status}`) as any;
            const pages = data.results?.map((p: any) => ({
                id: p.id,
                title: p.title,
                status: p.status,
                createdAt: p.createdAt,
                version: p.version?.number,
            })) ?? [];
            return json(pages);
        }

        case 'add_comment': {
            const payload = {
                pageId: args.page_id,
                body: {
                    representation: 'storage',
                    value: args.body,
                },
            };
            const data = await confluence(auth, '/footer-comments', 'POST', payload) as any;
            return json({
                id: data.id,
                pageId: data.pageId,
                createdAt: data.createdAt,
            });
        }

        case 'get_page_children': {
            const limit = Math.min(Number(args.limit ?? 25), 100);
            const data = await confluence(auth, `/pages/${args.page_id}/children?limit=${limit}`) as any;
            const children = data.results?.map((p: any) => ({
                id: p.id,
                title: p.title,
                status: p.status,
                childPosition: p.childPosition,
            })) ?? [];
            return json(children);
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'confluence-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
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
                serverInfo: { name: 'confluence-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const confluenceUrl = request.headers.get('X-Mcp-Secret-CONFLUENCE-URL');
            const email = request.headers.get('X-Mcp-Secret-CONFLUENCE-EMAIL');
            const apiToken = request.headers.get('X-Mcp-Secret-CONFLUENCE-API-TOKEN');

            if (!confluenceUrl) {
                return rpcErr(id, -32001, 'Missing CONFLUENCE_URL secret — add it to your workspace secrets (e.g. https://yoursite.atlassian.net)');
            }
            if (!email) {
                return rpcErr(id, -32001, 'Missing CONFLUENCE_EMAIL secret — add it to your workspace secrets');
            }
            if (!apiToken) {
                return rpcErr(id, -32001, 'Missing CONFLUENCE_API_TOKEN secret — add it to your workspace secrets');
            }

            const baseUrl = confluenceUrl.replace(/\/+$/, '');
            const authHeader = `Basic ${btoa(`${email}:${apiToken}`)}`;
            const auth: ConfluenceAuth = { baseUrl, authHeader };

            try {
                const result = await callTool(toolName, toolArgs, auth);
                return rpcOk(id, result);
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
