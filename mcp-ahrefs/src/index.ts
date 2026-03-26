/**
 * Ahrefs MCP Worker
 * Implements MCP protocol over HTTP for Ahrefs SEO operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   AHREFS_API_TOKEN → X-Mcp-Secret-AHREFS-API-TOKEN (Bearer token)
 */

const AHREFS_API = 'https://api.ahrefs.com/v3';

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
        description: 'Health check — verifies the Ahrefs API token is valid',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_domain_rating',
        description: 'Get the Domain Rating (DR) score for a target domain. DR measures the strength of a domain\'s backlink profile on a 0-100 scale.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Domain to check (e.g. "ahrefs.com")' },
            },
            required: ['target'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_backlinks',
        description: 'Get backlinks pointing to a target domain or URL. Returns referring pages, anchor text, and link attributes.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Domain or URL to get backlinks for (e.g. "ahrefs.com")' },
                mode: {
                    type: 'string',
                    description: 'Target mode: "domain" for entire domain, "prefix" for URL prefix, "exact" for exact URL (default: "domain")',
                    enum: ['domain', 'prefix', 'exact'],
                },
                limit: { type: 'number', description: 'Number of backlinks to return (default 10, max 50)' },
            },
            required: ['target'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_organic_keywords',
        description: 'Get organic keywords that a domain or URL ranks for in search results. Returns keyword, position, volume, traffic, and URL.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Domain or URL to get keywords for (e.g. "ahrefs.com")' },
                country: { type: 'string', description: 'Two-letter country code (default: "us")' },
                mode: {
                    type: 'string',
                    description: 'Target mode: "domain" for entire domain, "prefix" for URL prefix, "exact" for exact URL (default: "domain")',
                    enum: ['domain', 'prefix', 'exact'],
                },
                limit: { type: 'number', description: 'Number of keywords to return (default 10, max 50)' },
            },
            required: ['target'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_domain_overview',
        description: 'Get a comprehensive overview of a domain including organic traffic, keywords count, Domain Rating, referring domains, and backlinks count.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Domain to analyze (e.g. "ahrefs.com")' },
                country: { type: 'string', description: 'Two-letter country code for organic data (default: "us")' },
            },
            required: ['target'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_url_rating',
        description: 'Get the URL Rating (UR) score for a specific URL. UR measures the strength of a page\'s backlink profile on a 0-100 scale.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Full URL to check (e.g. "https://ahrefs.com/blog/")' },
            },
            required: ['target'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_referring_domains',
        description: 'Get referring domains that link to a target. Returns domain, DR, linked domains count, and first/last seen dates.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Domain or URL to check (e.g. "ahrefs.com")' },
                mode: {
                    type: 'string',
                    description: 'Target mode: "domain" for entire domain, "prefix" for URL prefix, "exact" for exact URL (default: "domain")',
                    enum: ['domain', 'prefix', 'exact'],
                },
                limit: { type: 'number', description: 'Number of referring domains to return (default 10, max 50)' },
            },
            required: ['target'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_keyword_difficulty',
        description: 'Get keyword difficulty (KD) score and search metrics for a keyword. Useful for keyword research and content planning.',
        inputSchema: {
            type: 'object',
            properties: {
                keyword: { type: 'string', description: 'Keyword to analyze (e.g. "best seo tools")' },
                country: { type: 'string', description: 'Two-letter country code (default: "us")' },
            },
            required: ['keyword'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_top_pages',
        description: 'Get the top pages for a domain sorted by organic traffic. Returns URL, traffic, keywords count, and top keyword.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Domain to get top pages for (e.g. "ahrefs.com")' },
                country: { type: 'string', description: 'Two-letter country code (default: "us")' },
                limit: { type: 'number', description: 'Number of pages to return (default 10, max 50)' },
            },
            required: ['target'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function ahrefsGet(
    path: string,
    token: string,
    params: Record<string, string> = {},
): Promise<unknown> {
    const url = new URL(`${AHREFS_API}${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ahrefs API ${res.status}: ${text}`);
    }
    return res.json();
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await ahrefsGet('/subscription-info', token) as any;
            return {
                status: 'ok',
                subscription: data.subscription ?? 'active',
                rows_left: data.rows_left ?? null,
            };
        }

        case 'get_domain_rating': {
            if (!args.target) throw new Error('target is required');
            const data = await ahrefsGet('/site-explorer/domain-rating', token, {
                target: String(args.target),
            }) as any;
            return {
                domain: args.target,
                domain_rating: data.domain_rating ?? null,
                ahrefs_rank: data.ahrefs_rank ?? null,
            };
        }

        case 'get_backlinks': {
            if (!args.target) throw new Error('target is required');
            const limit = Math.min(Number(args.limit ?? 10), 50);
            const mode = String(args.mode ?? 'domain');
            const data = await ahrefsGet('/site-explorer/all-backlinks', token, {
                target: String(args.target),
                mode,
                limit: String(limit),
                select: 'url_from,url_to,anchor,domain_rating_source,first_seen,last_seen,is_dofollow',
            }) as any;
            return {
                target: args.target,
                mode,
                backlinks: data.backlinks ?? [],
            };
        }

        case 'get_organic_keywords': {
            if (!args.target) throw new Error('target is required');
            const limit = Math.min(Number(args.limit ?? 10), 50);
            const country = String(args.country ?? 'us');
            const mode = String(args.mode ?? 'domain');
            const data = await ahrefsGet('/site-explorer/organic-keywords', token, {
                target: String(args.target),
                country,
                mode,
                limit: String(limit),
                select: 'keyword,position,volume,traffic,url,keyword_difficulty',
            }) as any;
            return {
                target: args.target,
                country,
                keywords: data.keywords ?? [],
            };
        }

        case 'get_domain_overview': {
            if (!args.target) throw new Error('target is required');
            const country = String(args.country ?? 'us');
            const [drData, orgData] = await Promise.all([
                ahrefsGet('/site-explorer/domain-rating', token, {
                    target: String(args.target),
                }) as Promise<any>,
                ahrefsGet('/site-explorer/metrics', token, {
                    target: String(args.target),
                    country,
                    mode: 'domain',
                }) as Promise<any>,
            ]);
            return {
                domain: args.target,
                domain_rating: drData.domain_rating ?? null,
                ahrefs_rank: drData.ahrefs_rank ?? null,
                organic_traffic: orgData.organic?.traffic ?? orgData.traffic ?? null,
                organic_keywords: orgData.organic?.keywords ?? orgData.keywords ?? null,
                referring_domains: orgData.backlinks?.referring_domains ?? orgData.referring_domains ?? null,
                backlinks: orgData.backlinks?.total ?? orgData.backlinks_total ?? null,
                country,
            };
        }

        case 'get_url_rating': {
            if (!args.target) throw new Error('target is required');
            const data = await ahrefsGet('/site-explorer/url-rating', token, {
                target: String(args.target),
            }) as any;
            return {
                url: args.target,
                url_rating: data.url_rating ?? null,
                ahrefs_rank: data.ahrefs_rank ?? null,
            };
        }

        case 'get_referring_domains': {
            if (!args.target) throw new Error('target is required');
            const limit = Math.min(Number(args.limit ?? 10), 50);
            const mode = String(args.mode ?? 'domain');
            const data = await ahrefsGet('/site-explorer/refdomains', token, {
                target: String(args.target),
                mode,
                limit: String(limit),
                select: 'domain,domain_rating,backlinks,first_seen,last_seen',
            }) as any;
            return {
                target: args.target,
                mode,
                referring_domains: data.refdomains ?? [],
            };
        }

        case 'get_keyword_difficulty': {
            if (!args.keyword) throw new Error('keyword is required');
            const country = String(args.country ?? 'us');
            const data = await ahrefsGet('/keywords-explorer/keyword-difficulty', token, {
                keyword: String(args.keyword),
                country,
            }) as any;
            return {
                keyword: args.keyword,
                country,
                difficulty: data.difficulty ?? null,
                volume: data.volume ?? null,
                global_volume: data.global_volume ?? null,
                cpc: data.cpc ?? null,
                clicks: data.clicks ?? null,
                return_rate: data.return_rate ?? null,
            };
        }

        case 'get_top_pages': {
            if (!args.target) throw new Error('target is required');
            const limit = Math.min(Number(args.limit ?? 10), 50);
            const country = String(args.country ?? 'us');
            const data = await ahrefsGet('/site-explorer/top-pages', token, {
                target: String(args.target),
                country,
                mode: 'domain',
                limit: String(limit),
                select: 'url,traffic,keywords,top_keyword,position',
            }) as any;
            return {
                target: args.target,
                country,
                pages: data.pages ?? [],
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'ahrefs-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'ahrefs-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-AHREFS-API-TOKEN');

            if (!token) {
                return rpcErr(id, -32001, 'Missing required secret: AHREFS_API_TOKEN');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, token);
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
