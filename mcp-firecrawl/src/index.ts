/**
 * mcp-firecrawl — Firecrawl MCP Server
 *
 * Scrape web pages, crawl sites, extract structured data, and search the web.
 * Uses Firecrawl REST API v1 directly.
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 */

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Firecrawl API connectivity and credits balance. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
    {
        name: 'scrape',
        description: 'Scrape a single web page and return clean markdown content, metadata, links, and optionally a screenshot. Handles JavaScript-rendered pages.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                url: { type: 'string', description: 'URL of the page to scrape' },
                formats: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Output formats: "markdown", "html", "rawHtml", "links", "screenshot" (default: ["markdown"])',
                },
                only_main_content: { type: 'boolean', description: 'Extract only the main content, removing navbars, footers, ads (default: true)' },
                wait_for: { type: 'number', description: 'Milliseconds to wait for JavaScript to render before scraping (default: 0)' },
                timeout: { type: 'number', description: 'Request timeout in milliseconds (default: 30000)' },
            },
            required: ['url'],
        },
    },
    {
        name: 'crawl',
        description: 'Start an async crawl of an entire website from a starting URL. Returns a job ID to check progress. Follows links up to a configurable depth.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                url: { type: 'string', description: 'Starting URL to begin crawling from' },
                max_depth: { type: 'number', description: 'Maximum link depth to follow (default: 2, max: 10)' },
                limit: { type: 'number', description: 'Maximum number of pages to crawl (default: 50, max: 500)' },
                include_paths: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Glob patterns for paths to include (e.g. ["/blog/*", "/docs/*"])',
                },
                exclude_paths: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Glob patterns for paths to exclude (e.g. ["/admin/*", "/login"])',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'crawl_status',
        description: 'Check the status of an async crawl job and retrieve results when complete',
        inputSchema: {
            type: 'object' as const,
            properties: {
                job_id: { type: 'string', description: 'Crawl job ID returned by the crawl tool' },
            },
            required: ['job_id'],
        },
    },
    {
        name: 'map',
        description: 'Discover all URLs on a website without scraping content — returns a sitemap-like list of all pages found',
        inputSchema: {
            type: 'object' as const,
            properties: {
                url: { type: 'string', description: 'Website URL to map' },
                search: { type: 'string', description: 'Optional search query to filter URLs by relevance' },
                limit: { type: 'number', description: 'Maximum number of URLs to return (default: 100, max: 5000)' },
            },
            required: ['url'],
        },
    },
    {
        name: 'extract',
        description: 'Extract structured data from a web page using a natural language prompt or JSON schema. Returns clean, typed data.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                url: { type: 'string', description: 'URL of the page to extract data from' },
                prompt: { type: 'string', description: 'Natural language description of what data to extract (e.g. "Extract all product names and prices")' },
                schema: {
                    type: 'object',
                    description: 'Optional JSON schema defining the structure of data to extract (e.g. {"type":"object","properties":{"title":{"type":"string"},"price":{"type":"number"}}})',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'search',
        description: 'Search the web using Firecrawl and return scraped content from the top results — combines search + scrape in one call',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query' },
                limit: { type: 'number', description: 'Number of results to return (default: 5, max: 20)' },
                lang: { type: 'string', description: 'Language code for results (e.g. "en", "de", "fr")' },
                country: { type: 'string', description: 'Country code for localized results (e.g. "us", "uk", "de")' },
            },
            required: ['query'],
        },
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

const FC_BASE = 'https://api.firecrawl.dev/v1';

async function fcFetch(token: string, path: string, method = 'GET', body?: unknown): Promise<any> {
    const res = await fetch(`${FC_BASE}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json() as any;
    if (!res.ok || data.success === false) {
        throw new Error(data.error || data.message || `Firecrawl API ${res.status}`);
    }
    return data;
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Scrape a lightweight page to verify connectivity
            const data = await fcFetch(token, '/scrape', 'POST', {
                url: 'https://example.com',
                formats: ['markdown'],
            });
            return text(`Firecrawl API connected. Scrape test successful.`);
        }

        case 'scrape': {
            const url = args.url as string;
            const formats = (args.formats as string[]) || ['markdown'];
            const data = await fcFetch(token, '/scrape', 'POST', {
                url,
                formats,
                onlyMainContent: args.only_main_content !== false,
                waitFor: args.wait_for ? Number(args.wait_for) : undefined,
                timeout: args.timeout ? Number(args.timeout) : undefined,
            });
            const result: Record<string, unknown> = {
                url: data.data?.metadata?.sourceURL || url,
                title: data.data?.metadata?.title,
                description: data.data?.metadata?.description,
            };
            if (data.data?.markdown) result.markdown = data.data.markdown;
            if (data.data?.html) result.html = data.data.html.slice(0, 50000);
            if (data.data?.links) result.links = data.data.links;
            if (data.data?.screenshot) result.screenshot_url = data.data.screenshot;
            return json(result);
        }

        case 'crawl': {
            const url = args.url as string;
            const data = await fcFetch(token, '/crawl', 'POST', {
                url,
                maxDepth: Math.min(Number(args.max_depth ?? 2), 10),
                limit: Math.min(Number(args.limit ?? 50), 500),
                includePaths: args.include_paths || undefined,
                excludePaths: args.exclude_paths || undefined,
            });
            return json({
                job_id: data.id,
                status: 'started',
                message: `Crawl started for ${url}. Use crawl_status with job_id "${data.id}" to check progress.`,
            });
        }

        case 'crawl_status': {
            const jobId = args.job_id as string;
            const data = await fcFetch(token, `/crawl/${jobId}`);
            if (data.status === 'completed') {
                const pages = (data.data || []).map((p: any) => ({
                    url: p.metadata?.sourceURL,
                    title: p.metadata?.title,
                    markdown_length: p.markdown?.length,
                }));
                return json({
                    status: 'completed',
                    total_pages: data.total,
                    pages,
                });
            }
            return json({
                status: data.status,
                completed: data.completed,
                total: data.total,
                credits_used: data.creditsUsed,
            });
        }

        case 'map': {
            const url = args.url as string;
            const data = await fcFetch(token, '/map', 'POST', {
                url,
                search: args.search || undefined,
                limit: Math.min(Number(args.limit ?? 100), 5000),
            });
            return json({
                urls: data.links || [],
                count: data.links?.length ?? 0,
            });
        }

        case 'extract': {
            const url = args.url as string;
            const body: Record<string, unknown> = { urls: [url] };
            if (args.prompt) body.prompt = args.prompt;
            if (args.schema) body.schema = args.schema;
            const data = await fcFetch(token, '/extract', 'POST', body);
            return json({
                url,
                data: data.data,
                status: data.status,
            });
        }

        case 'search': {
            const query = args.query as string;
            const data = await fcFetch(token, '/search', 'POST', {
                query,
                limit: Math.min(Number(args.limit ?? 5), 20),
                lang: args.lang || undefined,
                country: args.country || undefined,
            });
            const results = (data.data || []).map((r: any) => ({
                url: r.metadata?.sourceURL || r.url,
                title: r.metadata?.title,
                description: r.metadata?.description,
                markdown: r.markdown?.slice(0, 2000),
            }));
            return json({ query, results, count: results.length });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ─── Worker Entry ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-firecrawl', version: '1.0.0' });
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
                serverInfo: { name: 'mcp-firecrawl', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-FIRECRAWL-API-KEY');
            if (!token) {
                return rpcErr(id, -32001, 'Missing FIRECRAWL_API_KEY secret — sign up at firecrawl.dev and add your API key to workspace secrets');
            }

            const { name, arguments: toolArgs = {} } = (params ?? {}) as {
                name: string;
                arguments?: Record<string, unknown>;
            };

            try {
                const result = await callTool(name, toolArgs, token);
                return rpcOk(id, result);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
