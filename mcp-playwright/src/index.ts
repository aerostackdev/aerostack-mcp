/**
 * Playwright (Browser Automation) MCP Worker
 * Browser automation on the edge using Cloudflare's Browser Rendering REST API.
 *
 * Uses the BROWSER binding — no npm dependencies required.
 * The Browser Rendering API provides a CDP-compatible endpoint.
 *
 * No external secrets required.
 *
 * Covers: Navigation (2), Extraction (3), Screenshots (2), Content (2) = 9 tools
 */

interface Env {
    BROWSER: Fetcher;
}

function rpcOk(id: number | string, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { 'Content-Type': 'application/json' } });
}

function rpcErr(id: number | string | null, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const TOOLS = [
    // ── Navigation ──────────────────────────────────────────────────────────
    { name: 'fetch_page', description: 'Fetch a web page and return its rendered HTML content after JavaScript execution',
        inputSchema: { type: 'object', properties: {
            url: { type: 'string', description: 'URL to fetch' },
            wait_for: { type: 'string', description: 'CSS selector to wait for before returning (optional)' },
        }, required: ['url'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'fetch_page_text', description: 'Fetch a web page and return only its visible text content (no HTML tags)',
        inputSchema: { type: 'object', properties: {
            url: { type: 'string', description: 'URL to fetch' },
            selector: { type: 'string', description: 'CSS selector to scope extraction (optional — whole page if omitted)' },
        }, required: ['url'] }, annotations: { readOnlyHint: true, destructiveHint: false } },

    // ── Extraction ──────────────────────────────────────────────────────────
    { name: 'extract_links', description: 'Extract all links from a web page with their text and href',
        inputSchema: { type: 'object', properties: {
            url: { type: 'string', description: 'URL to fetch' },
            selector: { type: 'string', description: 'CSS selector to scope link extraction (optional)' },
            limit: { type: 'number', description: 'Max links to return (default 50)' },
        }, required: ['url'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'extract_structured', description: 'Extract structured data from a page using CSS selectors',
        inputSchema: { type: 'object', properties: {
            url: { type: 'string', description: 'URL to fetch' },
            selectors: { type: 'object', description: 'Map of field names to CSS selectors, e.g. {"title": "h1", "price": ".price"}' },
        }, required: ['url', 'selectors'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'extract_tables', description: 'Extract HTML tables from a page as arrays of row objects',
        inputSchema: { type: 'object', properties: {
            url: { type: 'string', description: 'URL to fetch' },
            table_index: { type: 'number', description: 'Index of the table to extract (default: 0 = first table)' },
        }, required: ['url'] }, annotations: { readOnlyHint: true, destructiveHint: false } },

    // ── Screenshots ─────────────────────────────────────────────────────────
    { name: 'screenshot', description: 'Take a screenshot of a web page (returns base64 PNG)',
        inputSchema: { type: 'object', properties: {
            url: { type: 'string', description: 'URL to screenshot' },
            full_page: { type: 'boolean', description: 'Capture the full scrollable page (default: false)' },
            width: { type: 'number', description: 'Viewport width in pixels (default: 1280)' },
            height: { type: 'number', description: 'Viewport height in pixels (default: 720)' },
        }, required: ['url'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'screenshot_element', description: 'Take a screenshot of a specific element on a page',
        inputSchema: { type: 'object', properties: {
            url: { type: 'string', description: 'URL to load' },
            selector: { type: 'string', description: 'CSS selector of the element to capture' },
        }, required: ['url', 'selector'] }, annotations: { readOnlyHint: true, destructiveHint: false } },

    // ── Content ─────────────────────────────────────────────────────────────
    { name: 'evaluate_js', description: 'Execute JavaScript on a page and return the result',
        inputSchema: { type: 'object', properties: {
            url: { type: 'string', description: 'URL to load first' },
            expression: { type: 'string', description: 'JavaScript expression to evaluate (must return a serializable value)' },
        }, required: ['url', 'expression'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'get_page_metadata', description: 'Get page title, meta tags, Open Graph data, and canonical URL',
        inputSchema: { type: 'object', properties: {
            url: { type: 'string', description: 'URL to fetch' },
        }, required: ['url'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
];

// ── Browser Rendering REST API helper ────────────────────────────────────────

async function browserFetch(env: Env, url: string, options?: {
    js?: string;
    waitFor?: string;
    viewport?: { width: number; height: number };
    screenshot?: boolean | { fullPage?: boolean; selector?: string };
}): Promise<Response> {
    // Cloudflare Browser Rendering API — /content endpoint renders a page
    const params = new URLSearchParams({ url });

    // Use the BROWSER binding to render pages
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const body: Record<string, unknown> = { url };

    if (options?.js) body.javascript = options.js;
    if (options?.waitFor) body.waitForSelector = options.waitFor;
    if (options?.viewport) body.viewport = options.viewport;
    if (options?.screenshot) body.screenshot = options.screenshot === true ? {} : options.screenshot;

    return env.BROWSER.fetch('https://internal/render', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
}

async function getRenderedContent(env: Env, url: string, js?: string, waitFor?: string): Promise<string> {
    const jsCode = js || 'document.documentElement.outerHTML';
    const res = await browserFetch(env, url, { js: jsCode, waitFor });
    if (!res.ok) throw new Error(`Browser render failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return res.text();
}

// ── Tool Handlers ────────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>, env: Env): Promise<unknown> {
    switch (name) {
        case 'fetch_page': {
            const html = await getRenderedContent(env, args.url as string, 'document.documentElement.outerHTML', args.wait_for as string | undefined);
            return { html: html.slice(0, 100_000), url: args.url, truncated: html.length > 100_000 };
        }
        case 'fetch_page_text': {
            const selector = args.selector ? `document.querySelector('${args.selector}')?.innerText || ''` : 'document.body.innerText';
            const text = await getRenderedContent(env, args.url as string, selector);
            return { text: text.slice(0, 50_000), url: args.url };
        }
        case 'extract_links': {
            const limit = (args.limit as number) || 50;
            const scope = args.selector ? `document.querySelector('${args.selector}')` : 'document';
            const js = `JSON.stringify(Array.from(${scope}?.querySelectorAll('a[href]') || []).slice(0, ${limit}).map(a => ({ text: a.textContent?.trim()?.slice(0, 200), href: a.href })))`;
            const raw = await getRenderedContent(env, args.url as string, js);
            try { return { links: JSON.parse(raw) }; } catch { return { links: [], raw }; }
        }
        case 'extract_structured': {
            const selectors = args.selectors as Record<string, string>;
            const entries = Object.entries(selectors).map(([field, sel]) =>
                `"${field}": document.querySelector('${sel}')?.textContent?.trim() || null`
            ).join(', ');
            const js = `JSON.stringify({${entries}})`;
            const raw = await getRenderedContent(env, args.url as string, js);
            try { return JSON.parse(raw); } catch { return { raw }; }
        }
        case 'extract_tables': {
            const idx = (args.table_index as number) || 0;
            const js = `(() => {
                const table = document.querySelectorAll('table')[${idx}];
                if (!table) return JSON.stringify({ error: 'No table found at index ${idx}' });
                const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th, tr:first-child td')).map(h => h.textContent?.trim() || '');
                const rows = Array.from(table.querySelectorAll('tbody tr, tr:not(:first-child)')).map(row =>
                    Object.fromEntries(Array.from(row.querySelectorAll('td')).map((cell, i) => [headers[i] || 'col_' + i, cell.textContent?.trim() || '']))
                );
                return JSON.stringify({ headers, rows: rows.slice(0, 100) });
            })()`;
            const raw = await getRenderedContent(env, args.url as string, js);
            try { return JSON.parse(raw); } catch { return { raw }; }
        }
        case 'screenshot': {
            const width = (args.width as number) || 1280;
            const height = (args.height as number) || 720;
            const res = await browserFetch(env, args.url as string, {
                viewport: { width, height },
                screenshot: { fullPage: !!args.full_page },
            });
            if (!res.ok) throw new Error(`Screenshot failed (${res.status})`);
            const buf = await res.arrayBuffer();
            return { image: btoa(String.fromCharCode(...new Uint8Array(buf))), format: 'base64/png' };
        }
        case 'screenshot_element': {
            const res = await browserFetch(env, args.url as string, {
                screenshot: { selector: args.selector as string },
            });
            if (!res.ok) throw new Error(`Element screenshot failed (${res.status})`);
            const buf = await res.arrayBuffer();
            return { image: btoa(String.fromCharCode(...new Uint8Array(buf))), format: 'base64/png' };
        }
        case 'evaluate_js': {
            const result = await getRenderedContent(env, args.url as string, args.expression as string);
            return { result };
        }
        case 'get_page_metadata': {
            const js = `JSON.stringify({
                title: document.title,
                url: location.href,
                canonical: document.querySelector('link[rel="canonical"]')?.href || null,
                description: document.querySelector('meta[name="description"]')?.content || null,
                og: Object.fromEntries(Array.from(document.querySelectorAll('meta[property^="og:"]')).map(m => [m.getAttribute('property'), m.content])),
                twitter: Object.fromEntries(Array.from(document.querySelectorAll('meta[name^="twitter:"]')).map(m => [m.getAttribute('name'), m.content])),
            })`;
            const raw = await getRenderedContent(env, args.url as string, js);
            try { return JSON.parse(raw); } catch { return { raw }; }
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker Entry ─────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-playwright', version: '1.0.0', tools: TOOLS.length }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
        try { body = await request.json(); } catch { return rpcErr(null, -32700, 'Parse error'); }
        const { id, method, params } = body;

        if (method === 'initialize') return rpcOk(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mcp-playwright', version: '1.0.0' } });
        if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });

        if (method === 'tools/call') {
            try {
                const result = await callTool(params?.name as string, (params?.arguments ?? {}) as Record<string, unknown>, env);
                return rpcOk(id, { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] });
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            }
        }
        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
