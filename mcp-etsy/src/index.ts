/**
 * Etsy MCP Worker
 * Implements MCP protocol over HTTP for Etsy Open API v3 operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: ETSY_API_KEY → header: X-Mcp-Secret-ETSY-API-KEY
 */

const ETSY_API = 'https://openapi.etsy.com/v3';

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
        name: 'get_shop',
        description: 'Get details about an Etsy shop by shop ID',
        inputSchema: {
            type: 'object',
            properties: {
                shop_id: { type: 'string', description: 'Etsy shop ID or shop name' },
            },
            required: ['shop_id'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'find_shops',
        description: 'Find Etsy shops by name',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Shop name to search for' },
                limit: { type: 'number', description: 'Number of results (default 10)' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_listings',
        description: 'List active listings in an Etsy shop',
        inputSchema: {
            type: 'object',
            properties: {
                shop_id: { type: 'string', description: 'Etsy shop ID' },
                limit: { type: 'number', description: 'Number of results (default 25)' },
                offset: { type: 'number', description: 'Pagination offset (default 0)' },
            },
            required: ['shop_id'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_listing',
        description: 'Get details about a specific Etsy listing',
        inputSchema: {
            type: 'object',
            properties: {
                listing_id: { type: 'number', description: 'Etsy listing ID' },
            },
            required: ['listing_id'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_listing_images',
        description: 'Get images for an Etsy listing',
        inputSchema: {
            type: 'object',
            properties: {
                listing_id: { type: 'number', description: 'Etsy listing ID' },
            },
            required: ['listing_id'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_shop_receipts',
        description: 'List receipts (orders) for a shop',
        inputSchema: {
            type: 'object',
            properties: {
                shop_id: { type: 'string', description: 'Etsy shop ID' },
                limit: { type: 'number', description: 'Number of results (default 25)' },
                was_paid: { type: 'boolean', description: 'Filter by paid status (default true)' },
            },
            required: ['shop_id'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_receipt',
        description: 'Get a specific receipt from a shop',
        inputSchema: {
            type: 'object',
            properties: {
                shop_id: { type: 'string', description: 'Etsy shop ID' },
                receipt_id: { type: 'number', description: 'Receipt ID' },
            },
            required: ['shop_id', 'receipt_id'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_transactions',
        description: 'List transactions for a shop',
        inputSchema: {
            type: 'object',
            properties: {
                shop_id: { type: 'string', description: 'Etsy shop ID' },
                limit: { type: 'number', description: 'Number of results (default 25)' },
            },
            required: ['shop_id'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_transaction',
        description: 'Get a specific transaction from a shop',
        inputSchema: {
            type: 'object',
            properties: {
                shop_id: { type: 'string', description: 'Etsy shop ID' },
                transaction_id: { type: 'number', description: 'Transaction ID' },
            },
            required: ['shop_id', 'transaction_id'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'find_all_listings',
        description: 'Search all active Etsy listings by keywords',
        inputSchema: {
            type: 'object',
            properties: {
                keywords: { type: 'string', description: 'Search keywords' },
                limit: { type: 'number', description: 'Number of results (default 25)' },
            },
            required: ['keywords'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_shop_reviews',
        description: 'Get reviews for an Etsy shop',
        inputSchema: {
            type: 'object',
            properties: {
                shop_id: { type: 'string', description: 'Etsy shop ID' },
                limit: { type: 'number', description: 'Number of results (default 25)' },
            },
            required: ['shop_id'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_listing_inventory',
        description: 'Get inventory details for a listing',
        inputSchema: {
            type: 'object',
            properties: {
                listing_id: { type: 'number', description: 'Etsy listing ID' },
            },
            required: ['listing_id'],
        },
        annotations: { readOnlyHint: true },
    },
];

async function etsyFetch(path: string, apiKey: string): Promise<unknown> {
    const res = await fetch(`${ETSY_API}${path}`, {
        headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Etsy API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case 'get_shop': {
            validateRequired(args, ['shop_id']);
            return etsyFetch(`/application/shops/${args.shop_id}`, apiKey);
        }
        case 'find_shops': {
            validateRequired(args, ['name']);
            const limit = args.limit ?? 10;
            return etsyFetch(`/application/shops?shop_name=${encodeURIComponent(String(args.name))}&limit=${limit}`, apiKey);
        }
        case 'list_listings': {
            validateRequired(args, ['shop_id']);
            const limit = args.limit ?? 25;
            const offset = args.offset ?? 0;
            return etsyFetch(`/application/shops/${args.shop_id}/listings/active?limit=${limit}&offset=${offset}`, apiKey);
        }
        case 'get_listing': {
            validateRequired(args, ['listing_id']);
            return etsyFetch(`/application/listings/${args.listing_id}`, apiKey);
        }
        case 'get_listing_images': {
            validateRequired(args, ['listing_id']);
            return etsyFetch(`/application/listings/${args.listing_id}/images`, apiKey);
        }
        case 'list_shop_receipts': {
            validateRequired(args, ['shop_id']);
            const limit = args.limit ?? 25;
            const wasPaid = args.was_paid !== undefined ? args.was_paid : true;
            return etsyFetch(`/application/shops/${args.shop_id}/receipts?limit=${limit}&was_paid=${wasPaid}`, apiKey);
        }
        case 'get_receipt': {
            validateRequired(args, ['shop_id', 'receipt_id']);
            return etsyFetch(`/application/shops/${args.shop_id}/receipts/${args.receipt_id}`, apiKey);
        }
        case 'list_transactions': {
            validateRequired(args, ['shop_id']);
            const limit = args.limit ?? 25;
            return etsyFetch(`/application/shops/${args.shop_id}/transactions?limit=${limit}`, apiKey);
        }
        case 'get_transaction': {
            validateRequired(args, ['shop_id', 'transaction_id']);
            return etsyFetch(`/application/shops/${args.shop_id}/transactions/${args.transaction_id}`, apiKey);
        }
        case 'find_all_listings': {
            validateRequired(args, ['keywords']);
            const limit = args.limit ?? 25;
            return etsyFetch(`/application/listings/active?keywords=${encodeURIComponent(String(args.keywords))}&limit=${limit}&sort_on=score`, apiKey);
        }
        case 'get_shop_reviews': {
            validateRequired(args, ['shop_id']);
            const limit = args.limit ?? 25;
            return etsyFetch(`/application/shops/${args.shop_id}/reviews?limit=${limit}`, apiKey);
        }
        case 'get_listing_inventory': {
            validateRequired(args, ['listing_id']);
            return etsyFetch(`/application/listings/${args.listing_id}/inventory`, apiKey);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'etsy-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'etsy-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const apiKey = request.headers.get('X-Mcp-Secret-ETSY-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing ETSY_API_KEY secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, apiKey);
                return rpcOk(id, toolOk(result));
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
