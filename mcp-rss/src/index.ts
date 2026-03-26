/**
 * mcp-rss — RSS/Atom Feed Reader MCP Server
 *
 * Read and monitor any RSS or Atom feed. No API key required —
 * just provide a feed URL. Great for auto-sharing blog posts,
 * monitoring news, or building content pipelines.
 */

// ─── TOOL DEFINITIONS ───────────────────────────────────────────────────────

const TOOLS = [
	{
		name: 'read_feed',
		description: 'Fetch and parse an RSS or Atom feed. Returns the latest items with title, link, description, and publish date.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'Full URL of the RSS/Atom feed (e.g. https://blog.example.com/rss)' },
				limit: { type: 'integer', description: 'Max items to return (default 10, max 50)' },
			},
			required: ['url'],
		},
		annotations: { readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'read_multiple_feeds',
		description: 'Fetch multiple feeds at once and return combined results sorted by date (newest first).',
		inputSchema: {
			type: 'object',
			properties: {
				urls: {
					type: 'array',
					items: { type: 'string' },
					description: 'Array of RSS/Atom feed URLs',
				},
				limit: { type: 'integer', description: 'Max total items to return (default 20)' },
			},
			required: ['urls'],
		},
		annotations: { readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'get_new_items',
		description: 'Get feed items published after a specific date. Useful for polling — pass the last seen date to get only new content.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'Feed URL' },
				since: { type: 'string', description: 'ISO 8601 datetime — only return items published after this date' },
				limit: { type: 'integer', description: 'Max items (default 20)' },
			},
			required: ['url', 'since'],
		},
		annotations: { readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'get_feed_info',
		description: 'Get metadata about a feed — title, description, language, last updated, number of items.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'Feed URL' },
			},
			required: ['url'],
		},
		annotations: { readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'discover_feed',
		description: 'Given a website URL, try to discover its RSS/Atom feed by checking common paths (/rss, /feed, /atom.xml, etc.).',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'Website URL (e.g. https://blog.example.com)' },
			},
			required: ['url'],
		},
		annotations: { readOnlyHint: true, destructiveHint: false },
	},
];

// ─── RSS/ATOM PARSER ────────────────────────────────────────────────────────

interface FeedItem {
	title: string;
	link: string;
	description: string;
	published: string | null;
	author: string | null;
	categories: string[];
}

interface FeedMeta {
	title: string;
	description: string;
	link: string;
	language: string | null;
	last_updated: string | null;
	item_count: number;
	feed_type: 'rss' | 'atom' | 'unknown';
}

function getTextContent(xml: string, tag: string): string {
	// Handle CDATA and regular content
	const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${tag}>`, 'i');
	const match = xml.match(regex);
	if (!match) return '';
	const raw = (match[1] ?? match[2] ?? '').trim();
	// Strip HTML tags for clean text
	return raw.replace(/<[^>]*>/g, '').trim();
}

function getAttribute(xml: string, tag: string, attr: string): string {
	const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
	const match = xml.match(regex);
	return match?.[1] ?? '';
}

function parseRSS(xml: string): { meta: FeedMeta; items: FeedItem[] } {
	const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');

	if (isAtom) {
		return parseAtom(xml);
	}

	const meta: FeedMeta = {
		title: getTextContent(xml, 'title'),
		description: getTextContent(xml, 'description'),
		link: getTextContent(xml, 'link'),
		language: getTextContent(xml, 'language') || null,
		last_updated: getTextContent(xml, 'lastBuildDate') || getTextContent(xml, 'pubDate') || null,
		item_count: 0,
		feed_type: 'rss',
	};

	const items: FeedItem[] = [];
	const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
	let match;
	while ((match = itemRegex.exec(xml)) !== null) {
		const itemXml = match[1]!;
		const categories: string[] = [];
		const catRegex = /<category[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/category>/gi;
		let catMatch;
		while ((catMatch = catRegex.exec(itemXml)) !== null) {
			categories.push((catMatch[1] ?? catMatch[2] ?? '').trim());
		}

		items.push({
			title: getTextContent(itemXml, 'title'),
			link: getTextContent(itemXml, 'link'),
			description: getTextContent(itemXml, 'description').slice(0, 500),
			published: getTextContent(itemXml, 'pubDate') || null,
			author: getTextContent(itemXml, 'author') || getTextContent(itemXml, 'dc:creator') || null,
			categories,
		});
	}

	meta.item_count = items.length;
	return { meta, items };
}

function parseAtom(xml: string): { meta: FeedMeta; items: FeedItem[] } {
	const meta: FeedMeta = {
		title: getTextContent(xml, 'title'),
		description: getTextContent(xml, 'subtitle') || '',
		link: getAttribute(xml, 'link', 'href'),
		language: null,
		last_updated: getTextContent(xml, 'updated') || null,
		item_count: 0,
		feed_type: 'atom',
	};

	const items: FeedItem[] = [];
	const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
	let match;
	while ((match = entryRegex.exec(xml)) !== null) {
		const entryXml = match[1]!;
		const categories: string[] = [];
		const catRegex = /<category[^>]*term="([^"]*)"[^>]*\/?>/gi;
		let catMatch;
		while ((catMatch = catRegex.exec(entryXml)) !== null) {
			categories.push(catMatch[1]!);
		}

		items.push({
			title: getTextContent(entryXml, 'title'),
			link: getAttribute(entryXml, 'link', 'href'),
			description: (getTextContent(entryXml, 'summary') || getTextContent(entryXml, 'content')).slice(0, 500),
			published: getTextContent(entryXml, 'published') || getTextContent(entryXml, 'updated') || null,
			author: getTextContent(entryXml, 'name') || null,
			categories,
		});
	}

	meta.item_count = items.length;
	return { meta, items };
}

async function fetchFeed(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: {
			Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
			'User-Agent': 'Aerostack-MCP-RSS/1.0',
		},
	});
	if (!res.ok) throw new Error(`Failed to fetch feed ${url}: ${res.status}`);
	return res.text();
}

// ─── TOOL EXECUTION ─────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, any>): Promise<any> {
	switch (name) {
		case 'read_feed': {
			const xml = await fetchFeed(args.url);
			const { items } = parseRSS(xml);
			const limit = Math.min(args.limit || 10, 50);
			return items.slice(0, limit);
		}

		case 'read_multiple_feeds': {
			if (!args.urls?.length) throw new Error('urls array is required');
			const limit = Math.min(args.limit || 20, 100);
			const results = await Promise.allSettled(
				args.urls.map((url: string) => fetchFeed(url).then(xml => {
					const { items } = parseRSS(xml);
					return items.map(item => ({ ...item, feed_url: url }));
				}))
			);

			const allItems: any[] = [];
			for (const r of results) {
				if (r.status === 'fulfilled') allItems.push(...r.value);
			}

			// Sort by date descending
			allItems.sort((a, b) => {
				const da = a.published ? new Date(a.published).getTime() : 0;
				const db = b.published ? new Date(b.published).getTime() : 0;
				return db - da;
			});

			return allItems.slice(0, limit);
		}

		case 'get_new_items': {
			const sinceDate = new Date(args.since).getTime();
			if (isNaN(sinceDate)) throw new Error('Invalid since date — use ISO 8601 format');
			const xml = await fetchFeed(args.url);
			const { items } = parseRSS(xml);
			const limit = Math.min(args.limit || 20, 50);

			return items
				.filter(item => {
					if (!item.published) return false;
					return new Date(item.published).getTime() > sinceDate;
				})
				.slice(0, limit);
		}

		case 'get_feed_info': {
			const xml = await fetchFeed(args.url);
			const { meta } = parseRSS(xml);
			return meta;
		}

		case 'discover_feed': {
			let baseUrl = args.url.replace(/\/$/, '');
			if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;

			const candidates = [
				'/rss', '/feed', '/rss.xml', '/atom.xml', '/feed.xml',
				'/blog/rss', '/blog/feed', '/index.xml', '/feed/rss',
				'/feeds/posts/default', // Blogger
			];

			const found: string[] = [];
			const checks = await Promise.allSettled(
				candidates.map(async (path) => {
					const url = `${baseUrl}${path}`;
					const res = await fetch(url, {
						method: 'HEAD',
						headers: { 'User-Agent': 'Aerostack-MCP-RSS/1.0' },
					});
					if (res.ok) {
						const ct = res.headers.get('content-type') || '';
						if (ct.includes('xml') || ct.includes('rss') || ct.includes('atom')) {
							return url;
						}
						// Try GET to verify it's actually a feed
						const body = await fetch(url, {
							headers: { 'User-Agent': 'Aerostack-MCP-RSS/1.0' },
						}).then(r => r.text()).catch(() => '');
						if (body.includes('<rss') || body.includes('<feed') || body.includes('<channel')) {
							return url;
						}
					}
					return null;
				})
			);

			for (const r of checks) {
				if (r.status === 'fulfilled' && r.value) found.push(r.value);
			}

			return {
				website: baseUrl,
				feeds_found: found.length,
				feeds: found,
			};
		}

		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function rpcOk(id: string | number | null, result: unknown) {
	return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
		headers: { 'Content-Type': 'application/json' },
	});
}

function rpcErr(id: string | number | null, code: number, message: string) {
	return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}

// ─── WORKER HANDLER ─────────────────────────────────────────────────────────

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
			return new Response(JSON.stringify({ status: 'ok', server: 'rss-mcp', version: '1.0.0' }), {
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

		const { id, method, params } = body;

		if (method === 'initialize') {
			return rpcOk(id, {
				protocolVersion: '2024-11-05',
				capabilities: { tools: {} },
				serverInfo: { name: 'rss-mcp', version: '1.0.0' },
			});
		}

		if (method === 'tools/list') {
			return rpcOk(id, { tools: TOOLS });
		}

		if (method === 'tools/call') {
			const toolName = params?.name;
			const toolArgs = params?.arguments ?? {};

			try {
				const result = await callTool(toolName, toolArgs);
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
