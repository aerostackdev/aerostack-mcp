/**
 * Webflow MCP Worker
 * Implements MCP protocol over HTTP for Webflow API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: WEBFLOW_API_TOKEN → header: X-Mcp-Secret-WEBFLOW-API-TOKEN
 */

const WEBFLOW_API = 'https://api.webflow.com/v2';

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
        name: 'list_sites',
        description: 'List all Webflow sites accessible to the authenticated user',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_site',
        description: 'Get detailed information about a specific Webflow site',
        inputSchema: {
            type: 'object',
            properties: {
                site_id: { type: 'string', description: 'The ID of the site to retrieve' },
            },
            required: ['site_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'publish_site',
        description: 'Publish a Webflow site to one or all domains',
        inputSchema: {
            type: 'object',
            properties: {
                site_id: { type: 'string', description: 'The ID of the site to publish' },
                domains: { type: 'array', items: { type: 'string' }, description: 'Array of domain strings to publish to (optional — publishes to all domains if omitted)' },
            },
            required: ['site_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_collections',
        description: 'List all CMS collections for a Webflow site',
        inputSchema: {
            type: 'object',
            properties: {
                site_id: { type: 'string', description: 'The ID of the site to list collections from' },
            },
            required: ['site_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_collection',
        description: 'Get a specific CMS collection including its field schema',
        inputSchema: {
            type: 'object',
            properties: {
                collection_id: { type: 'string', description: 'The ID of the collection to retrieve' },
            },
            required: ['collection_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_items',
        description: 'List items in a CMS collection',
        inputSchema: {
            type: 'object',
            properties: {
                collection_id: { type: 'string', description: 'The ID of the collection' },
                limit: { type: 'number', description: 'Number of items to return (default 20)' },
                offset: { type: 'number', description: 'Number of items to skip for pagination (default 0)' },
                live: { type: 'boolean', description: 'Return only published/live items (default false)' },
            },
            required: ['collection_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_item',
        description: 'Get a specific CMS collection item',
        inputSchema: {
            type: 'object',
            properties: {
                collection_id: { type: 'string', description: 'The ID of the collection' },
                item_id: { type: 'string', description: 'The ID of the item to retrieve' },
            },
            required: ['collection_id', 'item_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_item',
        description: 'Create a new item in a CMS collection',
        inputSchema: {
            type: 'object',
            properties: {
                collection_id: { type: 'string', description: 'The ID of the collection' },
                fields: { type: 'object', description: 'CMS field values keyed by field slug' },
                is_draft: { type: 'boolean', description: 'Create as draft (default false)' },
            },
            required: ['collection_id', 'fields'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_item',
        description: 'Update an existing CMS collection item',
        inputSchema: {
            type: 'object',
            properties: {
                collection_id: { type: 'string', description: 'The ID of the collection' },
                item_id: { type: 'string', description: 'The ID of the item to update' },
                fields: { type: 'object', description: 'CMS field values to update keyed by field slug' },
            },
            required: ['collection_id', 'item_id', 'fields'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_item',
        description: 'Delete a CMS collection item',
        inputSchema: {
            type: 'object',
            properties: {
                collection_id: { type: 'string', description: 'The ID of the collection' },
                item_id: { type: 'string', description: 'The ID of the item to delete' },
            },
            required: ['collection_id', 'item_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
];

async function webflowRequest(
    method: string,
    path: string,
    token: string,
    params?: Record<string, string>,
    body?: unknown,
): Promise<Response> {
    const url = new URL(`${WEBFLOW_API}${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
    }

    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Accept-Version': '1.0.0',
    };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url.toString(), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    return res;
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'list_sites': {
            const res = await webflowRequest('GET', '/sites', token);
            if (!res.ok) throw new Error(`Webflow API error ${res.status}: ${await res.text()}`);
            const data = await res.json() as any;
            return (data.sites ?? []).map((s: any) => ({
                id: s.id,
                displayName: s.displayName,
                shortName: s.shortName,
                lastPublished: s.lastPublished,
                createdOn: s.createdOn,
                previewUrl: s.previewUrl,
            }));
        }

        case 'get_site': {
            const siteId = args.site_id as string;
            const res = await webflowRequest('GET', `/sites/${siteId}`, token);
            if (!res.ok) throw new Error(`Webflow API error ${res.status}: ${await res.text()}`);
            return res.json();
        }

        case 'publish_site': {
            const siteId = args.site_id as string;
            const body: Record<string, unknown> = {};
            if (args.domains && Array.isArray(args.domains)) {
                body.domains = args.domains;
            }
            const res = await webflowRequest('POST', `/sites/${siteId}/publish`, token, undefined, body);
            if (!res.ok) throw new Error(`Webflow API error ${res.status}: ${await res.text()}`);
            return { queued: true };
        }

        case 'list_collections': {
            const siteId = args.site_id as string;
            const res = await webflowRequest('GET', `/sites/${siteId}/collections`, token);
            if (!res.ok) throw new Error(`Webflow API error ${res.status}: ${await res.text()}`);
            const data = await res.json() as any;
            return (data.collections ?? []).map((c: any) => ({
                id: c.id,
                displayName: c.displayName,
                slug: c.slug,
                singularName: c.singularName,
                createdOn: c.createdOn,
                lastUpdated: c.lastUpdated,
                itemCount: c.itemCount,
            }));
        }

        case 'get_collection': {
            const collectionId = args.collection_id as string;
            const res = await webflowRequest('GET', `/collections/${collectionId}`, token);
            if (!res.ok) throw new Error(`Webflow API error ${res.status}: ${await res.text()}`);
            const data = await res.json() as any;
            return {
                id: data.id,
                displayName: data.displayName,
                slug: data.slug,
                fields: data.fields,
            };
        }

        case 'list_items': {
            const collectionId = args.collection_id as string;
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const offset = Number(args.offset ?? 0);
            const live = Boolean(args.live ?? false);

            const params: Record<string, string> = {
                limit: String(limit),
                offset: String(offset),
            };
            if (live) params.live = 'true';

            const res = await webflowRequest('GET', `/collections/${collectionId}/items`, token, params);
            if (!res.ok) throw new Error(`Webflow API error ${res.status}: ${await res.text()}`);
            const data = await res.json() as any;
            return (data.items ?? []).map((item: any) => ({
                id: item.id,
                fieldData: item.fieldData,
                isArchived: item.isArchived,
                isDraft: item.isDraft,
                createdOn: item.createdOn,
                lastUpdated: item.lastUpdated,
            }));
        }

        case 'get_item': {
            const collectionId = args.collection_id as string;
            const itemId = args.item_id as string;
            const res = await webflowRequest('GET', `/collections/${collectionId}/items/${itemId}`, token);
            if (!res.ok) throw new Error(`Webflow API error ${res.status}: ${await res.text()}`);
            return res.json();
        }

        case 'create_item': {
            const collectionId = args.collection_id as string;
            const fields = args.fields as Record<string, unknown>;
            const isDraft = Boolean(args.is_draft ?? false);

            const res = await webflowRequest('POST', `/collections/${collectionId}/items`, token, undefined, {
                fieldData: fields,
                isDraft,
            });
            if (!res.ok) throw new Error(`Webflow API error ${res.status}: ${await res.text()}`);
            return res.json();
        }

        case 'update_item': {
            const collectionId = args.collection_id as string;
            const itemId = args.item_id as string;
            const fields = args.fields as Record<string, unknown>;

            const res = await webflowRequest('PATCH', `/collections/${collectionId}/items/${itemId}`, token, undefined, {
                fieldData: fields,
            });
            if (!res.ok) throw new Error(`Webflow API error ${res.status}: ${await res.text()}`);
            return res.json();
        }

        case 'delete_item': {
            const collectionId = args.collection_id as string;
            const itemId = args.item_id as string;
            const res = await webflowRequest('DELETE', `/collections/${collectionId}/items/${itemId}`, token);
            if (!res.ok) throw new Error(`Webflow API error ${res.status}: ${await res.text()}`);
            return { deleted: true, item_id: itemId };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'GET' && url.pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'webflow-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'webflow-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-WEBFLOW-API-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing WEBFLOW_API_TOKEN secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
