/**
 * Playwright (Browser Automation) MCP Worker
 * Browser automation on the edge using Cloudflare's Browser Rendering API.
 * Uses @cloudflare/puppeteer to control a headless Chromium instance.
 *
 * No external secrets required — uses the BROWSER binding from Cloudflare.
 *
 * Covers: Navigation (3), Interaction (4), Extraction (4), Screenshots (2), Evaluation (2) = 15 tools
 */

import puppeteer from '@cloudflare/puppeteer';

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
    { name: 'navigate', description: 'Navigate to a URL and wait for the page to load',
        inputSchema: { type: 'object', properties: {
            url: { type: 'string', description: 'URL to navigate to' },
            wait_until: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], description: 'Wait condition (default: load)' },
            timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' },
        }, required: ['url'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'go_back', description: 'Navigate back in browser history',
        inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'wait_for_selector', description: 'Wait for a CSS selector to appear on the page',
        inputSchema: { type: 'object', properties: {
            selector: { type: 'string', description: 'CSS selector to wait for' },
            timeout: { type: 'number', description: 'Timeout in ms (default: 10000)' },
            visible: { type: 'boolean', description: 'Wait for element to be visible (default: true)' },
        }, required: ['selector'] }, annotations: { readOnlyHint: true, destructiveHint: false } },

    // ── Interaction ─────────────────────────────────────────────────────────
    { name: 'click', description: 'Click an element matching a CSS selector',
        inputSchema: { type: 'object', properties: {
            selector: { type: 'string', description: 'CSS selector of the element to click' },
        }, required: ['selector'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'type_text', description: 'Type text into an input field',
        inputSchema: { type: 'object', properties: {
            selector: { type: 'string', description: 'CSS selector of the input field' },
            text: { type: 'string', description: 'Text to type' },
            clear_first: { type: 'boolean', description: 'Clear the field before typing (default: true)' },
            delay: { type: 'number', description: 'Delay between keystrokes in ms (default: 0)' },
        }, required: ['selector', 'text'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'select_option', description: 'Select an option from a dropdown by value or label',
        inputSchema: { type: 'object', properties: {
            selector: { type: 'string', description: 'CSS selector of the <select> element' },
            value: { type: 'string', description: 'Option value to select' },
        }, required: ['selector', 'value'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'press_key', description: 'Press a keyboard key (Enter, Tab, Escape, etc.)',
        inputSchema: { type: 'object', properties: {
            key: { type: 'string', description: 'Key to press (e.g. "Enter", "Tab", "Escape", "ArrowDown")' },
        }, required: ['key'] }, annotations: { readOnlyHint: false, destructiveHint: false } },

    // ── Extraction ──────────────────────────────────────────────────────────
    { name: 'get_text', description: 'Get the text content of an element',
        inputSchema: { type: 'object', properties: {
            selector: { type: 'string', description: 'CSS selector' },
        }, required: ['selector'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'get_attribute', description: 'Get an attribute value from an element',
        inputSchema: { type: 'object', properties: {
            selector: { type: 'string', description: 'CSS selector' },
            attribute: { type: 'string', description: 'Attribute name (e.g. "href", "src", "data-id")' },
        }, required: ['selector', 'attribute'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'get_page_content', description: 'Get the full page HTML or text content',
        inputSchema: { type: 'object', properties: {
            format: { type: 'string', enum: ['html', 'text'], description: 'Output format (default: text)' },
            selector: { type: 'string', description: 'CSS selector to scope extraction (optional — whole page if omitted)' },
        } }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'query_selector_all', description: 'Find all elements matching a selector and extract their text + attributes',
        inputSchema: { type: 'object', properties: {
            selector: { type: 'string', description: 'CSS selector' },
            attributes: { type: 'array', items: { type: 'string' }, description: 'Attributes to extract (default: ["href"])' },
            limit: { type: 'number', description: 'Max elements (default: 50)' },
        }, required: ['selector'] }, annotations: { readOnlyHint: true, destructiveHint: false } },

    // ── Screenshots ─────────────────────────────────────────────────────────
    { name: 'screenshot', description: 'Take a screenshot of the current page (returns base64 PNG)',
        inputSchema: { type: 'object', properties: {
            full_page: { type: 'boolean', description: 'Capture the full scrollable page (default: false)' },
            selector: { type: 'string', description: 'CSS selector to capture specific element (optional)' },
        } }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'pdf', description: 'Generate a PDF of the current page (returns base64)',
        inputSchema: { type: 'object', properties: {
            format: { type: 'string', enum: ['A4', 'Letter', 'Legal'], description: 'Page format (default: A4)' },
            landscape: { type: 'boolean', description: 'Landscape orientation (default: false)' },
        } }, annotations: { readOnlyHint: true, destructiveHint: false } },

    // ── JavaScript Evaluation ───────────────────────────────────────────────
    { name: 'evaluate', description: 'Execute JavaScript in the page context and return the result',
        inputSchema: { type: 'object', properties: {
            expression: { type: 'string', description: 'JavaScript expression to evaluate' },
        }, required: ['expression'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'get_page_info', description: 'Get current page URL, title, and meta tags',
        inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false } },
];

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
            const toolName = params?.name as string;
            const args = (params?.arguments ?? {}) as Record<string, unknown>;

            let browser;
            try {
                browser = await puppeteer.launch(env.BROWSER);
                const page = await browser.newPage();
                await page.setViewport({ width: 1280, height: 720 });

                const result = await callTool(toolName, args, page, browser);
                return rpcOk(id, { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] });
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            } finally {
                try { await browser?.close(); } catch { /* ignore */ }
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};

async function callTool(
    name: string, args: Record<string, unknown>,
    page: puppeteer.Page, browser: puppeteer.Browser,
): Promise<unknown> {
    switch (name) {
        case 'navigate': {
            const waitUntil = (args.wait_until as string) || 'load';
            const timeout = (args.timeout as number) || 30000;
            const response = await page.goto(args.url as string, { waitUntil: waitUntil as any, timeout });
            return { url: page.url(), status: response?.status(), title: await page.title() };
        }
        case 'go_back': {
            await page.goBack();
            return { url: page.url(), title: await page.title() };
        }
        case 'wait_for_selector': {
            const timeout = (args.timeout as number) || 10000;
            const visible = args.visible !== false;
            await page.waitForSelector(args.selector as string, { timeout, visible });
            return { found: true, selector: args.selector };
        }
        case 'click':
            await page.click(args.selector as string);
            return { clicked: args.selector };
        case 'type_text': {
            if (args.clear_first !== false) {
                await page.click(args.selector as string, { count: 3 });
                await page.keyboard.press('Backspace');
            }
            await page.type(args.selector as string, args.text as string, { delay: (args.delay as number) || 0 });
            return { typed: true, selector: args.selector };
        }
        case 'select_option':
            await page.select(args.selector as string, args.value as string);
            return { selected: args.value };
        case 'press_key':
            await page.keyboard.press(args.key as string);
            return { pressed: args.key };
        case 'get_text': {
            const text = await page.$eval(args.selector as string, el => el.textContent?.trim() || '');
            return { text };
        }
        case 'get_attribute': {
            const value = await page.$eval(args.selector as string, (el, attr) => el.getAttribute(attr as string), args.attribute);
            return { attribute: args.attribute, value };
        }
        case 'get_page_content': {
            const format = (args.format as string) || 'text';
            if (args.selector) {
                const content = format === 'html'
                    ? await page.$eval(args.selector as string, el => el.innerHTML)
                    : await page.$eval(args.selector as string, el => el.textContent?.trim() || '');
                return { content, selector: args.selector };
            }
            const content = format === 'html' ? await page.content() : await page.evaluate(() => document.body.innerText);
            return { content: (content as string).slice(0, 100_000) };
        }
        case 'query_selector_all': {
            const attrs = (args.attributes as string[]) || ['href'];
            const limit = (args.limit as number) || 50;
            const elements = await page.$$eval(args.selector as string, (els, { attrs, limit }) => {
                return els.slice(0, limit).map(el => {
                    const result: Record<string, string | null> = { text: el.textContent?.trim()?.slice(0, 200) || '' };
                    for (const attr of attrs) result[attr] = el.getAttribute(attr);
                    return result;
                });
            }, { attrs, limit });
            return { count: elements.length, elements };
        }
        case 'screenshot': {
            let imageData: string;
            if (args.selector) {
                const el = await page.$(args.selector as string);
                if (!el) throw new Error(`Element not found: ${args.selector}`);
                imageData = (await el.screenshot({ encoding: 'base64' })) as string;
            } else {
                imageData = (await page.screenshot({ encoding: 'base64', fullPage: !!args.full_page })) as string;
            }
            return { image: imageData, format: 'base64/png' };
        }
        case 'pdf': {
            const pdf = await page.pdf({
                format: (args.format as any) || 'A4',
                landscape: !!args.landscape,
                printBackground: true,
            });
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pdf)));
            return { pdf: base64, format: 'base64/pdf' };
        }
        case 'evaluate': {
            const result = await page.evaluate(args.expression as string);
            return { result };
        }
        case 'get_page_info': {
            const [title, url, meta] = await Promise.all([
                page.title(),
                page.url(),
                page.evaluate(() => {
                    const metas: Record<string, string> = {};
                    document.querySelectorAll('meta').forEach(m => {
                        const name = m.getAttribute('name') || m.getAttribute('property') || '';
                        if (name) metas[name] = m.getAttribute('content') || '';
                    });
                    return metas;
                }),
            ]);
            return { title, url, meta };
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
