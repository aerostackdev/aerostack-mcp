/**
 * mcp-plaid — Plaid Financial Data MCP Server
 *
 * Access bank accounts, transactions, balances, institutions, and identity.
 * Uses Plaid REST API directly.
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 */

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Plaid API connectivity by fetching API categories. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_accounts',
        description: 'List all bank accounts linked to an access token — name, type (checking, savings, credit), balances, mask, and official name',
        inputSchema: {
            type: 'object' as const,
            properties: {
                access_token: { type: 'string', description: 'Plaid access token for the linked bank connection' },
            },
            required: ['access_token'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_balance',
        description: 'Get real-time account balances for all accounts linked to an access token — available, current, and limit amounts',
        inputSchema: {
            type: 'object' as const,
            properties: {
                access_token: { type: 'string', description: 'Plaid access token' },
                account_ids: { type: 'array', items: { type: 'string' }, description: 'Optional: filter to specific account IDs' },
            },
            required: ['access_token'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_transactions',
        description: 'Retrieve transactions for linked accounts within a date range — amount, merchant, category, date, pending status',
        inputSchema: {
            type: 'object' as const,
            properties: {
                access_token: { type: 'string', description: 'Plaid access token' },
                start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
                end_date: { type: 'string', description: 'End date in YYYY-MM-DD format' },
                account_ids: { type: 'array', items: { type: 'string' }, description: 'Filter to specific account IDs' },
                count: { type: 'number', description: 'Max transactions to return (default: 100, max: 500)' },
                offset: { type: 'number', description: 'Offset for pagination' },
            },
            required: ['access_token', 'start_date', 'end_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_institutions',
        description: 'Search for banks and financial institutions by name — returns institution ID, name, products supported, and country codes',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query (e.g. "Chase", "Bank of America", "Wells Fargo")' },
                country_codes: { type: 'array', items: { type: 'string' }, description: 'Country codes to search in (default: ["US"])' },
                count: { type: 'number', description: 'Max results (default: 10, max: 50)' },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_institution',
        description: 'Get detailed info about a financial institution by ID — name, products, URL, logo, primary color, and supported country codes',
        inputSchema: {
            type: 'object' as const,
            properties: {
                institution_id: { type: 'string', description: 'Plaid institution ID (e.g. "ins_1")' },
                country_codes: { type: 'array', items: { type: 'string' }, description: 'Country codes (default: ["US"])' },
            },
            required: ['institution_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_identity',
        description: 'Retrieve identity information (name, email, phone, address) for accounts linked to an access token',
        inputSchema: {
            type: 'object' as const,
            properties: {
                access_token: { type: 'string', description: 'Plaid access token' },
            },
            required: ['access_token'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_link_token',
        description: 'Create a Plaid Link token to start the bank connection flow — returns a link_token for initializing Plaid Link in your app',
        inputSchema: {
            type: 'object' as const,
            properties: {
                user_client_id: { type: 'string', description: 'Unique identifier for the end user' },
                products: { type: 'array', items: { type: 'string' }, description: 'Plaid products to request (default: ["transactions"]). Options: auth, transactions, identity, investments, liabilities' },
                country_codes: { type: 'array', items: { type: 'string' }, description: 'Country codes (default: ["US"])' },
                language: { type: 'string', description: 'Language code (default: "en")' },
            },
            required: ['user_client_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function rpcOk(id: unknown, result: unknown) {
    return Response.json({ jsonrpc: '2.0', id, result });
}

function rpcErr(id: unknown, code: number, message: string) {
    return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

function plaidBaseUrl(env: string): string {
    switch (env) {
        case 'production': return 'https://production.plaid.com';
        case 'development': return 'https://development.plaid.com';
        default: return 'https://sandbox.plaid.com';
    }
}

async function plaidFetch(
    baseUrl: string, clientId: string, secret: string,
    path: string, body: Record<string, unknown>,
): Promise<any> {
    const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, ...body }),
    });
    const data = await res.json() as any;
    if (data.error_code) {
        throw new Error(`Plaid ${data.error_code}: ${data.error_message}`);
    }
    return data;
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    baseUrl: string,
    clientId: string,
    secret: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await plaidFetch(baseUrl, clientId, secret, '/categories/get', {});
            return text(`Connected to Plaid API. ${data.categories?.length ?? 0} transaction categories available.`);
        }

        case 'get_accounts': {
            const data = await plaidFetch(baseUrl, clientId, secret, '/accounts/get', {
                access_token: args.access_token as string,
            });
            const accounts = (data.accounts ?? []).map((a: any) => ({
                id: a.account_id,
                name: a.name,
                official_name: a.official_name,
                type: a.type,
                subtype: a.subtype,
                mask: a.mask,
                balance: {
                    available: a.balances?.available,
                    current: a.balances?.current,
                    limit: a.balances?.limit,
                    currency: a.balances?.iso_currency_code,
                },
            }));
            return json({ accounts, count: accounts.length, institution: data.item?.institution_id });
        }

        case 'get_balance': {
            const body: Record<string, unknown> = { access_token: args.access_token as string };
            if (args.account_ids) body.options = { account_ids: args.account_ids };
            const data = await plaidFetch(baseUrl, clientId, secret, '/accounts/balance/get', body);
            const accounts = (data.accounts ?? []).map((a: any) => ({
                id: a.account_id,
                name: a.name,
                type: a.type,
                available: a.balances?.available,
                current: a.balances?.current,
                limit: a.balances?.limit,
                currency: a.balances?.iso_currency_code,
            }));
            return json({ accounts, count: accounts.length });
        }

        case 'get_transactions': {
            const count = Math.min(Number(args.count ?? 100), 500);
            const data = await plaidFetch(baseUrl, clientId, secret, '/transactions/get', {
                access_token: args.access_token as string,
                start_date: args.start_date as string,
                end_date: args.end_date as string,
                options: {
                    count,
                    offset: args.offset ? Number(args.offset) : 0,
                    ...(args.account_ids ? { account_ids: args.account_ids } : {}),
                },
            });
            const transactions = (data.transactions ?? []).map((t: any) => ({
                id: t.transaction_id,
                date: t.date,
                amount: t.amount,
                currency: t.iso_currency_code,
                name: t.name,
                merchant_name: t.merchant_name,
                category: t.category,
                pending: t.pending,
                account_id: t.account_id,
                payment_channel: t.payment_channel,
            }));
            return json({ transactions, count: transactions.length, total: data.total_transactions });
        }

        case 'search_institutions': {
            const data = await plaidFetch(baseUrl, clientId, secret, '/institutions/search', {
                query: args.query as string,
                products: ['transactions'],
                country_codes: (args.country_codes as string[]) || ['US'],
                options: { count: Math.min(Number(args.count ?? 10), 50) },
            });
            const institutions = (data.institutions ?? []).map((i: any) => ({
                id: i.institution_id,
                name: i.name,
                products: i.products,
                country_codes: i.country_codes,
                url: i.url,
            }));
            return json({ institutions, count: institutions.length });
        }

        case 'get_institution': {
            const data = await plaidFetch(baseUrl, clientId, secret, '/institutions/get_by_id', {
                institution_id: args.institution_id as string,
                country_codes: (args.country_codes as string[]) || ['US'],
            });
            const i = data.institution;
            return json({
                id: i.institution_id,
                name: i.name,
                url: i.url,
                products: i.products,
                country_codes: i.country_codes,
                primary_color: i.primary_color,
                logo: i.logo ? '(base64 logo available)' : null,
            });
        }

        case 'get_identity': {
            const data = await plaidFetch(baseUrl, clientId, secret, '/identity/get', {
                access_token: args.access_token as string,
            });
            const accounts = (data.accounts ?? []).map((a: any) => ({
                id: a.account_id,
                name: a.name,
                owners: a.owners?.map((o: any) => ({
                    names: o.names,
                    emails: o.emails?.map((e: any) => e.data),
                    phones: o.phone_numbers?.map((p: any) => p.data),
                    addresses: o.addresses?.map((a: any) => a.data),
                })),
            }));
            return json({ accounts, count: accounts.length });
        }

        case 'create_link_token': {
            const data = await plaidFetch(baseUrl, clientId, secret, '/link/token/create', {
                user: { client_user_id: args.user_client_id as string },
                client_name: 'Aerostack MCP',
                products: (args.products as string[]) || ['transactions'],
                country_codes: (args.country_codes as string[]) || ['US'],
                language: (args.language as string) || 'en',
            });
            return json({ link_token: data.link_token, expiration: data.expiration, request_id: data.request_id });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ─── Worker Entry ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-plaid', version: '1.0.0' });
        }
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = (await request.json()) as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-plaid', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const clientId = request.headers.get('X-Mcp-Secret-PLAID-CLIENT-ID');
            const secret = request.headers.get('X-Mcp-Secret-PLAID-SECRET');
            const plaidEnv = request.headers.get('X-Mcp-Secret-PLAID-ENV') || 'sandbox';

            if (!clientId || !secret) {
                return rpcErr(id, -32001, 'Missing Plaid credentials — add PLAID_CLIENT_ID and PLAID_SECRET to workspace secrets');
            }

            const baseUrl = plaidBaseUrl(plaidEnv);
            const { name, arguments: toolArgs = {} } = (params ?? {}) as {
                name: string;
                arguments?: Record<string, unknown>;
            };

            try {
                const result = await callTool(name, toolArgs, baseUrl, clientId, secret);
                return rpcOk(id, result);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
