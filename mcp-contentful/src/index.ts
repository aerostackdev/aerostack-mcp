/**
 * Contentful MCP Worker
 * Implements MCP protocol over HTTP for Contentful Content Management API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: CONTENTFUL_ACCESS_TOKEN → header: X-Mcp-Secret-CONTENTFUL-ACCESS-TOKEN
 * Secret: CONTENTFUL_SPACE_ID    → header: X-Mcp-Secret-CONTENTFUL-SPACE-ID
 */

const CF_API = 'https://api.contentful.com';

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
        name: 'list_spaces',
        description: 'List all Contentful spaces accessible with the current token',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_space',
        description: 'Get details about a Contentful space',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Contentful space ID' },
            },
            required: ['spaceId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_content_types',
        description: 'List content types in a space',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Space ID (uses default if not provided)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_content_type',
        description: 'Get a specific content type definition',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Space ID (uses default if not provided)' },
                contentTypeId: { type: 'string', description: 'Content type ID' },
            },
            required: ['contentTypeId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_entries',
        description: 'List entries in a space, optionally filtered by content type',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Space ID (uses default if not provided)' },
                contentType: { type: 'string', description: 'Filter by content type ID (optional)' },
                limit: { type: 'number', description: 'Number of results (default 25)' },
                skip: { type: 'number', description: 'Offset for pagination (default 0)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_entry',
        description: 'Get a specific entry by ID',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Space ID (uses default if not provided)' },
                entryId: { type: 'string', description: 'Entry ID' },
            },
            required: ['entryId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_entry',
        description: 'Create a new entry in Contentful',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Space ID (uses default if not provided)' },
                contentTypeId: { type: 'string', description: 'Content type ID for the new entry' },
                fields: { type: 'object', description: 'Entry fields as a Contentful fields object' },
            },
            required: ['contentTypeId', 'fields'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_entry',
        description: 'Update an existing entry',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Space ID (uses default if not provided)' },
                entryId: { type: 'string', description: 'Entry ID to update' },
                contentTypeId: { type: 'string', description: 'Content type ID' },
                version: { type: 'number', description: 'Current entry version number' },
                fields: { type: 'object', description: 'Updated fields' },
            },
            required: ['entryId', 'contentTypeId', 'version', 'fields'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'publish_entry',
        description: 'Publish an entry to make it publicly available',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Space ID (uses default if not provided)' },
                entryId: { type: 'string', description: 'Entry ID to publish' },
                version: { type: 'number', description: 'Current entry version number' },
            },
            required: ['entryId', 'version'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'delete_entry',
        description: 'Delete an entry from a space',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Space ID (uses default if not provided)' },
                entryId: { type: 'string', description: 'Entry ID to delete' },
            },
            required: ['entryId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_assets',
        description: 'List assets in a space',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Space ID (uses default if not provided)' },
                limit: { type: 'number', description: 'Number of results (default 25)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_asset',
        description: 'Get a specific asset by ID',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Space ID (uses default if not provided)' },
                assetId: { type: 'string', description: 'Asset ID' },
            },
            required: ['assetId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'search_entries',
        description: 'Search entries with a full-text query',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Space ID (uses default if not provided)' },
                query: { type: 'string', description: 'Full-text search query' },
                limit: { type: 'number', description: 'Number of results (default 25)' },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_environments',
        description: 'List environments in a space',
        inputSchema: {
            type: 'object',
            properties: {
                spaceId: { type: 'string', description: 'Space ID (uses default if not provided)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
];

async function cfFetch(path: string, token: string, opts: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${CF_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (res.status === 204) return { deleted: true };
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Contentful API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    defaultSpaceId: string | null
): Promise<unknown> {
    const spaceId = (args.spaceId as string | undefined) ?? defaultSpaceId;

    const requireSpace = () => {
        if (!spaceId) throw new Error('spaceId is required — provide it as an argument or add CONTENTFUL_SPACE_ID to your workspace secrets');
    };

    switch (name) {
        case 'list_spaces': {
            return cfFetch('/spaces', token);
        }
        case 'get_space': {
            validateRequired(args, ['spaceId']);
            return cfFetch(`/spaces/${args.spaceId}`, token);
        }
        case 'list_content_types': {
            requireSpace();
            return cfFetch(`/spaces/${spaceId}/environments/master/content_types`, token);
        }
        case 'get_content_type': {
            validateRequired(args, ['contentTypeId']);
            requireSpace();
            return cfFetch(`/spaces/${spaceId}/environments/master/content_types/${args.contentTypeId}`, token);
        }
        case 'list_entries': {
            requireSpace();
            const limit = args.limit ?? 25;
            const skip = args.skip ?? 0;
            let url = `/spaces/${spaceId}/environments/master/entries?limit=${limit}&skip=${skip}`;
            if (args.contentType) url += `&content_type=${args.contentType}`;
            return cfFetch(url, token);
        }
        case 'get_entry': {
            validateRequired(args, ['entryId']);
            requireSpace();
            return cfFetch(`/spaces/${spaceId}/environments/master/entries/${args.entryId}`, token);
        }
        case 'create_entry': {
            validateRequired(args, ['contentTypeId', 'fields']);
            requireSpace();
            return cfFetch(`/spaces/${spaceId}/environments/master/entries`, token, {
                method: 'POST',
                headers: { 'X-Contentful-Content-Type': String(args.contentTypeId) },
                body: JSON.stringify({ fields: args.fields }),
            });
        }
        case 'update_entry': {
            validateRequired(args, ['entryId', 'contentTypeId', 'version', 'fields']);
            requireSpace();
            return cfFetch(`/spaces/${spaceId}/environments/master/entries/${args.entryId}`, token, {
                method: 'PUT',
                headers: {
                    'X-Contentful-Content-Type': String(args.contentTypeId),
                    'X-Contentful-Version': String(args.version),
                },
                body: JSON.stringify({ fields: args.fields }),
            });
        }
        case 'publish_entry': {
            validateRequired(args, ['entryId', 'version']);
            requireSpace();
            return cfFetch(`/spaces/${spaceId}/environments/master/entries/${args.entryId}/published`, token, {
                method: 'PUT',
                headers: { 'X-Contentful-Version': String(args.version) },
            });
        }
        case 'delete_entry': {
            validateRequired(args, ['entryId']);
            requireSpace();
            return cfFetch(`/spaces/${spaceId}/environments/master/entries/${args.entryId}`, token, {
                method: 'DELETE',
            });
        }
        case 'list_assets': {
            requireSpace();
            const limit = args.limit ?? 25;
            return cfFetch(`/spaces/${spaceId}/environments/master/assets?limit=${limit}`, token);
        }
        case 'get_asset': {
            validateRequired(args, ['assetId']);
            requireSpace();
            return cfFetch(`/spaces/${spaceId}/environments/master/assets/${args.assetId}`, token);
        }
        case 'search_entries': {
            validateRequired(args, ['query']);
            requireSpace();
            const limit = args.limit ?? 25;
            return cfFetch(
                `/spaces/${spaceId}/environments/master/entries?query=${encodeURIComponent(String(args.query))}&limit=${limit}`,
                token
            );
        }
        case 'list_environments': {
            requireSpace();
            return cfFetch(`/spaces/${spaceId}/environments`, token);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'contentful-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'contentful-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-CONTENTFUL-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing CONTENTFUL_ACCESS_TOKEN secret — add it to your workspace secrets');
            }

            const defaultSpaceId = request.headers.get('X-Mcp-Secret-CONTENTFUL-SPACE-ID');

            try {
                const result = await callTool(toolName, toolArgs, token, defaultSpaceId);
                return rpcOk(id, toolOk(result));
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
