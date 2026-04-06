/**
 * Amazon Seller MCP Worker
 * Implements MCP protocol over HTTP for Amazon Selling Partner API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: AMAZON_SP_ACCESS_TOKEN → header: X-Mcp-Secret-AMAZON-SP-ACCESS-TOKEN
 */

const AMAZON_API = 'https://sellingpartnerapi-na.amazon.com';

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
        name: '_ping',
        description: 'Verify Amazon Seller credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_catalog_items',
        description: 'Search the Amazon catalog for items by keywords',
        inputSchema: {
            type: 'object',
            properties: {
                marketplaceId: { type: 'string', description: 'Amazon marketplace ID (e.g. ATVPDKIKX0DER for US)' },
                keywords: { type: 'string', description: 'Search keywords' },
            },
            required: ['marketplaceId', 'keywords'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_catalog_item',
        description: 'Get details for a specific catalog item by ASIN',
        inputSchema: {
            type: 'object',
            properties: {
                asin: { type: 'string', description: 'Amazon Standard Identification Number (ASIN)' },
                marketplaceId: { type: 'string', description: 'Amazon marketplace ID' },
            },
            required: ['asin', 'marketplaceId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_inventory',
        description: 'List FBA inventory summaries',
        inputSchema: {
            type: 'object',
            properties: {
                marketplaceId: { type: 'string', description: 'Amazon marketplace ID' },
            },
            required: ['marketplaceId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_orders',
        description: 'List orders from a marketplace',
        inputSchema: {
            type: 'object',
            properties: {
                marketplaceId: { type: 'string', description: 'Amazon marketplace ID' },
                createdAfter: { type: 'string', description: 'ISO 8601 date filter (e.g. 2024-01-01T00:00:00Z)' },
                orderStatuses: { type: 'string', description: 'Comma-separated order statuses (optional)' },
            },
            required: ['marketplaceId', 'createdAfter'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_order',
        description: 'Get details for a specific order',
        inputSchema: {
            type: 'object',
            properties: {
                orderId: { type: 'string', description: 'Amazon order ID' },
            },
            required: ['orderId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_order_items',
        description: 'Get the items in a specific order',
        inputSchema: {
            type: 'object',
            properties: {
                orderId: { type: 'string', description: 'Amazon order ID' },
            },
            required: ['orderId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_reports',
        description: 'List available reports',
        inputSchema: {
            type: 'object',
            properties: {
                reportTypes: { type: 'string', description: 'Comma-separated report types (optional)' },
                pageSize: { type: 'number', description: 'Number of results (default 10)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_report',
        description: 'Get a specific report by ID',
        inputSchema: {
            type: 'object',
            properties: {
                reportId: { type: 'string', description: 'Report ID' },
            },
            required: ['reportId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_report',
        description: 'Request creation of a new report',
        inputSchema: {
            type: 'object',
            properties: {
                reportType: { type: 'string', description: 'Report type (e.g. GET_FLAT_FILE_OPEN_LISTINGS_DATA)' },
                marketplaceIds: { type: 'array', items: { type: 'string' }, description: 'List of marketplace IDs' },
                dataStartTime: { type: 'string', description: 'ISO 8601 start time (optional)' },
                dataEndTime: { type: 'string', description: 'ISO 8601 end time (optional)' },
            },
            required: ['reportType', 'marketplaceIds'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_financial_events',
        description: 'List financial events for the seller account',
        inputSchema: {
            type: 'object',
            properties: {
                postedAfter: { type: 'string', description: 'ISO 8601 date filter' },
                maxResultsPerPage: { type: 'number', description: 'Number of results (default 20)' },
            },
            required: ['postedAfter'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_pricing',
        description: 'Get pricing for one or more ASINs',
        inputSchema: {
            type: 'object',
            properties: {
                marketplaceId: { type: 'string', description: 'Amazon marketplace ID' },
                asins: { type: 'string', description: 'Comma-separated list of ASINs' },
            },
            required: ['marketplaceId', 'asins'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_feed_submissions',
        description: 'List recent feed submissions',
        inputSchema: {
            type: 'object',
            properties: {
                pageSize: { type: 'number', description: 'Number of results (default 10)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
];

async function spFetch(path: string, token: string, opts: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${AMAZON_API}${path}`, {
        ...opts,
        headers: {
            'x-amz-access-token': token,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Amazon SP API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // GET /reports/2021-06-30/reports?pageSize=1 — lightweight read to verify SP-API access token
            const data = (await spFetch('/reports/2021-06-30/reports?pageSize=1', token)) as any;
            return { connected: true, reports_count: data?.reports?.length ?? 0 };
        }
        case 'list_catalog_items': {
            validateRequired(args, ['marketplaceId', 'keywords']);
            return spFetch(
                `/catalog/2022-04-01/items?marketplaceIds=${args.marketplaceId}&keywords=${encodeURIComponent(String(args.keywords))}&includedData=summaries`,
                token
            );
        }
        case 'get_catalog_item': {
            validateRequired(args, ['asin', 'marketplaceId']);
            return spFetch(
                `/catalog/2022-04-01/items/${args.asin}?marketplaceIds=${args.marketplaceId}&includedData=summaries,attributes`,
                token
            );
        }
        case 'list_inventory': {
            validateRequired(args, ['marketplaceId']);
            const mid = args.marketplaceId;
            return spFetch(
                `/fba/inventory/v1/summaries?details=true&marketplaceIds=${mid}&granularityType=Marketplace&granularityId=${mid}`,
                token
            );
        }
        case 'list_orders': {
            validateRequired(args, ['marketplaceId', 'createdAfter']);
            let url = `/orders/v0/orders?MarketplaceIds=${args.marketplaceId}&CreatedAfter=${encodeURIComponent(String(args.createdAfter))}`;
            if (args.orderStatuses) url += `&OrderStatuses=${args.orderStatuses}`;
            return spFetch(url, token);
        }
        case 'get_order': {
            validateRequired(args, ['orderId']);
            return spFetch(`/orders/v0/orders/${args.orderId}`, token);
        }
        case 'get_order_items': {
            validateRequired(args, ['orderId']);
            return spFetch(`/orders/v0/orders/${args.orderId}/orderItems`, token);
        }
        case 'list_reports': {
            const pageSize = args.pageSize ?? 10;
            let url = `/reports/2021-06-30/reports?pageSize=${pageSize}`;
            if (args.reportTypes) url += `&reportTypes=${args.reportTypes}`;
            return spFetch(url, token);
        }
        case 'get_report': {
            validateRequired(args, ['reportId']);
            return spFetch(`/reports/2021-06-30/reports/${args.reportId}`, token);
        }
        case 'create_report': {
            validateRequired(args, ['reportType', 'marketplaceIds']);
            const body: Record<string, unknown> = {
                reportType: args.reportType,
                marketplaceIds: args.marketplaceIds,
            };
            if (args.dataStartTime) body.dataStartTime = args.dataStartTime;
            if (args.dataEndTime) body.dataEndTime = args.dataEndTime;
            return spFetch('/reports/2021-06-30/reports', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }
        case 'list_financial_events': {
            validateRequired(args, ['postedAfter']);
            const maxResults = args.maxResultsPerPage ?? 20;
            return spFetch(
                `/finances/v0/financialEvents?MaxResultsPerPage=${maxResults}&PostedAfter=${encodeURIComponent(String(args.postedAfter))}`,
                token
            );
        }
        case 'get_pricing': {
            validateRequired(args, ['marketplaceId', 'asins']);
            return spFetch(
                `/products/pricing/v0/price?MarketplaceId=${args.marketplaceId}&ItemType=Asin&Asins=${encodeURIComponent(String(args.asins))}`,
                token
            );
        }
        case 'list_feed_submissions': {
            const pageSize = args.pageSize ?? 10;
            return spFetch(`/feeds/2021-06-30/feeds?pageSize=${pageSize}`, token);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'amazon-seller-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'amazon-seller-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-AMAZON-SP-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing AMAZON_SP_ACCESS_TOKEN secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
                return rpcOk(id, toolOk(result));
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
