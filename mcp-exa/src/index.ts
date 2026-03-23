/**
 * Exa MCP Worker
 * Implements MCP protocol over HTTP for Exa semantic web search operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   EXA_API_KEY → X-Mcp-Secret-EXA-API-KEY
 */

const EXA_API = 'https://api.exa.ai';

/* ------------------------------------------------------------------ */
/*  MCP helpers                                                        */
/* ------------------------------------------------------------------ */

function rpcOk(id: number | string, result: unknown) {
    return Response.json({ jsonrpc: '2.0', id, result });
}

function rpcErr(id: number | string | null, code: number, message: string) {
    return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

/* ------------------------------------------------------------------ */
/*  Tool definitions                                                   */
/* ------------------------------------------------------------------ */

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Exa API connectivity. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
    {
        name: 'search',
        description:
            'Perform a semantic or keyword web search using Exa. Returns a list of URLs with titles, scores, and optional metadata.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'The search query' },
                num_results: {
                    type: 'number',
                    description: 'Number of results to return (default 10, max 100)',
                },
                type: {
                    type: 'string',
                    description: 'Search type: "auto" (default), "neural" (semantic), or "keyword"',
                    enum: ['auto', 'neural', 'keyword'],
                },
                use_autoprompt: {
                    type: 'boolean',
                    description: 'Let Exa rephrase the query for better neural results (default true)',
                },
                category: {
                    type: 'string',
                    description:
                        'Filter by content category: company, research paper, news, pdf, github, tweet, movie, song, personal site, linkedin profile',
                },
                include_domains: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Only return results from these domains',
                },
                exclude_domains: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Exclude results from these domains',
                },
                start_published_date: {
                    type: 'string',
                    description: 'Only return content published after this date (ISO 8601, e.g. 2024-01-01T00:00:00.000Z)',
                },
                end_published_date: {
                    type: 'string',
                    description: 'Only return content published before this date (ISO 8601)',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_contents',
        description:
            'Get the full text content of one or more web pages by URL. Useful for reading articles, documentation, or any page found via search.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                urls: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of URLs to scrape (max 10)',
                },
                text: {
                    type: 'boolean',
                    description: 'Include cleaned page text (default true)',
                },
                highlights: {
                    type: 'boolean',
                    description: 'Include key highlights/snippets from the page (default false)',
                },
                summary: {
                    type: 'boolean',
                    description: 'Include an AI-generated summary of the page (default false)',
                },
            },
            required: ['urls'],
        },
    },
    {
        name: 'find_similar',
        description:
            'Find web pages similar to a given URL. Great for competitive research, finding related articles, or discovering alternatives.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                url: { type: 'string', description: 'The reference URL to find similar pages for' },
                num_results: {
                    type: 'number',
                    description: 'Number of similar results to return (default 10, max 100)',
                },
                include_domains: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Only return results from these domains',
                },
                exclude_domains: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Exclude results from these domains',
                },
                start_published_date: {
                    type: 'string',
                    description: 'Only return content published after this date (ISO 8601)',
                },
                exclude_source_domain: {
                    type: 'boolean',
                    description: 'Exclude results from the same domain as the source URL (default true)',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'search_and_contents',
        description:
            'Combined search + scrape in one call. Performs a semantic/keyword search and returns results with full page text, highlights, or summaries.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'The search query' },
                num_results: {
                    type: 'number',
                    description: 'Number of results to return (default 5, max 100)',
                },
                type: {
                    type: 'string',
                    description: 'Search type: "auto" (default), "neural" (semantic), or "keyword"',
                    enum: ['auto', 'neural', 'keyword'],
                },
                text: {
                    type: 'boolean',
                    description: 'Include cleaned page text (default true)',
                },
                highlights: {
                    type: 'boolean',
                    description: 'Include key highlights/snippets (default false)',
                },
                summary: {
                    type: 'boolean',
                    description: 'Include an AI-generated summary per result (default false)',
                },
                use_autoprompt: {
                    type: 'boolean',
                    description: 'Let Exa rephrase the query for better results (default true)',
                },
                category: {
                    type: 'string',
                    description:
                        'Filter by content category: company, research paper, news, pdf, github, tweet, movie, song, personal site, linkedin profile',
                },
                include_domains: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Only return results from these domains',
                },
                exclude_domains: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Exclude results from these domains',
                },
                start_published_date: {
                    type: 'string',
                    description: 'Only return content published after this date (ISO 8601)',
                },
                end_published_date: {
                    type: 'string',
                    description: 'Only return content published before this date (ISO 8601)',
                },
            },
            required: ['query'],
        },
    },
];

/* ------------------------------------------------------------------ */
/*  Exa API helper                                                     */
/* ------------------------------------------------------------------ */

async function exaFetch(
    token: string,
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
): Promise<unknown> {
    const res = await fetch(`${EXA_API}${path}`, {
        method,
        headers: {
            'x-api-key': token,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Exa API ${res.status}: ${text}`);
    }
    return res.json();
}

/* ------------------------------------------------------------------ */
/*  Tool dispatch                                                      */
/* ------------------------------------------------------------------ */

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Lightweight search to verify connectivity
            const data = (await exaFetch(token, '/search', 'POST', {
                query: 'test',
                numResults: 1,
            })) as any;
            return { ok: true, requestId: data.requestId ?? null };
        }

        case 'search': {
            if (!args.query) throw new Error('query is required');

            const payload: Record<string, unknown> = {
                query: args.query,
                numResults: Number(args.num_results ?? 10),
            };
            if (args.type) payload.type = args.type;
            if (args.use_autoprompt !== undefined) payload.useAutoprompt = args.use_autoprompt;
            if (args.category) payload.category = args.category;
            if (args.include_domains) payload.includeDomains = args.include_domains;
            if (args.exclude_domains) payload.excludeDomains = args.exclude_domains;
            if (args.start_published_date) payload.startPublishedDate = args.start_published_date;
            if (args.end_published_date) payload.endPublishedDate = args.end_published_date;

            const data = (await exaFetch(token, '/search', 'POST', payload)) as any;
            return {
                requestId: data.requestId,
                results: (data.results ?? []).map((r: any) => ({
                    title: r.title,
                    url: r.url,
                    score: r.score,
                    publishedDate: r.publishedDate ?? null,
                    author: r.author ?? null,
                })),
            };
        }

        case 'get_contents': {
            if (!args.urls || !Array.isArray(args.urls) || args.urls.length === 0) {
                throw new Error('urls array is required and must not be empty');
            }

            const payload: Record<string, unknown> = {
                urls: args.urls,
            };

            // Content options
            const textOpt = args.text !== false; // default true
            if (textOpt) payload.text = true;
            if (args.highlights) payload.highlights = true;
            if (args.summary) payload.summary = true;

            const data = (await exaFetch(token, '/contents', 'POST', payload)) as any;
            return {
                requestId: data.requestId,
                results: (data.results ?? []).map((r: any) => ({
                    title: r.title,
                    url: r.url,
                    publishedDate: r.publishedDate ?? null,
                    author: r.author ?? null,
                    ...(r.text ? { text: r.text } : {}),
                    ...(r.highlights ? { highlights: r.highlights } : {}),
                    ...(r.summary ? { summary: r.summary } : {}),
                })),
            };
        }

        case 'find_similar': {
            if (!args.url) throw new Error('url is required');

            const payload: Record<string, unknown> = {
                url: args.url,
                numResults: Number(args.num_results ?? 10),
            };
            if (args.include_domains) payload.includeDomains = args.include_domains;
            if (args.exclude_domains) payload.excludeDomains = args.exclude_domains;
            if (args.start_published_date) payload.startPublishedDate = args.start_published_date;
            if (args.exclude_source_domain !== undefined)
                payload.excludeSourceDomain = args.exclude_source_domain;

            const data = (await exaFetch(token, '/findSimilar', 'POST', payload)) as any;
            return {
                requestId: data.requestId,
                results: (data.results ?? []).map((r: any) => ({
                    title: r.title,
                    url: r.url,
                    score: r.score,
                    publishedDate: r.publishedDate ?? null,
                    author: r.author ?? null,
                })),
            };
        }

        case 'search_and_contents': {
            if (!args.query) throw new Error('query is required');

            const payload: Record<string, unknown> = {
                query: args.query,
                numResults: Number(args.num_results ?? 5),
            };
            if (args.type) payload.type = args.type;
            if (args.use_autoprompt !== undefined) payload.useAutoprompt = args.use_autoprompt;
            if (args.category) payload.category = args.category;
            if (args.include_domains) payload.includeDomains = args.include_domains;
            if (args.exclude_domains) payload.excludeDomains = args.exclude_domains;
            if (args.start_published_date) payload.startPublishedDate = args.start_published_date;
            if (args.end_published_date) payload.endPublishedDate = args.end_published_date;

            // Content options
            const contents: Record<string, unknown> = {};
            const textOpt = args.text !== false; // default true
            if (textOpt) contents.text = true;
            if (args.highlights) contents.highlights = true;
            if (args.summary) contents.summary = true;
            payload.contents = contents;

            const data = (await exaFetch(token, '/search', 'POST', payload)) as any;
            return {
                requestId: data.requestId,
                results: (data.results ?? []).map((r: any) => ({
                    title: r.title,
                    url: r.url,
                    score: r.score,
                    publishedDate: r.publishedDate ?? null,
                    author: r.author ?? null,
                    ...(r.text ? { text: r.text } : {}),
                    ...(r.highlights ? { highlights: r.highlights } : {}),
                    ...(r.summary ? { summary: r.summary } : {}),
                })),
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

/* ------------------------------------------------------------------ */
/*  Worker fetch handler                                               */
/* ------------------------------------------------------------------ */

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return Response.json({ status: 'ok', server: 'exa-mcp', version: '1.0.0' });
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

        /* ---------- initialize ---------- */
        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'exa-mcp', version: '1.0.0' },
            });
        }

        /* ---------- tools/list ---------- */
        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        /* ---------- tools/call ---------- */
        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-EXA-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: EXA_API_KEY');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, apiKey);
                return rpcOk(id, json(result));
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
