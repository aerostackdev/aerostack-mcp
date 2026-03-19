/**
 * mcp-notion — Notion MCP Server (API Key auth)
 *
 * Full read/write access to Notion pages, databases, and blocks
 * using a simple integration token (secret_xxx). No OAuth required.
 */

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// ─── TOOL DEFINITIONS ───────────────────────────────────────────────────────

const TOOLS = [
	{
		name: 'search',
		description: 'Search across all pages and databases shared with your integration. Returns matching pages and databases by title or content.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search query text' },
				filter_type: {
					type: 'string',
					enum: ['page', 'database'],
					description: 'Filter results to only pages or only databases. Omit for both.',
				},
				page_size: { type: 'integer', description: 'Number of results (1-100, default 10)' },
				start_cursor: { type: 'string', description: 'Pagination cursor from previous response' },
			},
		},
	},
	{
		name: 'get_page',
		description: 'Get a Notion page with all its properties (title, status, dates, tags, etc.). Does NOT return page body content — use get_page_content for that.',
		inputSchema: {
			type: 'object',
			properties: {
				page_id: { type: 'string', description: 'The Notion page ID' },
			},
			required: ['page_id'],
		},
	},
	{
		name: 'create_page',
		description: 'Create a new page in a Notion database with properties and optional body content blocks.',
		inputSchema: {
			type: 'object',
			properties: {
				database_id: { type: 'string', description: 'The database to create the page in' },
				properties: { type: 'object', description: 'Property values matching the database schema' },
				content: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							type: { type: 'string', description: 'Block type: paragraph, heading_1, heading_2, heading_3, bulleted_list_item, numbered_list_item, code, quote, divider' },
							text: { type: 'string', description: 'Text content of the block' },
						},
						required: ['type', 'text'],
					},
					description: 'Optional page body content as an array of blocks',
				},
			},
			required: ['database_id', 'properties'],
		},
	},
	{
		name: 'update_page',
		description: 'Update properties on an existing Notion page. Only include the properties you want to change — others remain untouched. Can also archive a page.',
		inputSchema: {
			type: 'object',
			properties: {
				page_id: { type: 'string', description: 'The page ID to update' },
				properties: { type: 'object', description: 'Property values to update (partial — only changed fields)' },
				archived: { type: 'boolean', description: 'Set to true to archive (soft-delete) the page' },
			},
			required: ['page_id'],
		},
	},
	{
		name: 'query_database',
		description: 'Query a Notion database with optional filters and sorts. Returns matching pages with their properties.',
		inputSchema: {
			type: 'object',
			properties: {
				database_id: { type: 'string', description: 'The database ID to query' },
				filter: { type: 'object', description: 'Notion filter object (e.g. { "property": "Status", "select": { "equals": "Published" } })' },
				sorts: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							property: { type: 'string' },
							direction: { type: 'string', enum: ['ascending', 'descending'] },
						},
					},
					description: 'Sort order for results',
				},
				page_size: { type: 'integer', description: 'Number of results (1-100, default 10)' },
				start_cursor: { type: 'string', description: 'Pagination cursor from previous response' },
			},
			required: ['database_id'],
		},
	},
	{
		name: 'get_database',
		description: 'Get a database schema — all property names, types, and options (select choices, relation targets, etc.). Use this to understand a database structure before querying or creating pages.',
		inputSchema: {
			type: 'object',
			properties: {
				database_id: { type: 'string', description: 'The database ID' },
			},
			required: ['database_id'],
		},
	},
	{
		name: 'get_page_content',
		description: 'Read the body content of a Notion page — all blocks (paragraphs, headings, lists, code, etc.). Returns both structured blocks and a plain text version.',
		inputSchema: {
			type: 'object',
			properties: {
				page_id: { type: 'string', description: 'The page ID to read content from' },
				page_size: { type: 'integer', description: 'Number of blocks to return (1-100, default 100)' },
				start_cursor: { type: 'string', description: 'Pagination cursor for long pages' },
			},
			required: ['page_id'],
		},
	},
	{
		name: 'append_blocks',
		description: 'Append content blocks to the end of a Notion page. Use this to add text, headings, lists, or other content to an existing page.',
		inputSchema: {
			type: 'object',
			properties: {
				page_id: { type: 'string', description: 'The page ID to append content to' },
				blocks: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							type: { type: 'string', description: 'Block type: paragraph, heading_1, heading_2, heading_3, bulleted_list_item, numbered_list_item, code, quote, divider' },
							text: { type: 'string', description: 'Text content of the block' },
						},
						required: ['type', 'text'],
					},
					description: 'Array of content blocks to append',
				},
			},
			required: ['page_id', 'blocks'],
		},
	},
	{
		name: 'list_databases',
		description: 'List all databases shared with your integration. Useful to discover available databases before querying.',
		inputSchema: {
			type: 'object',
			properties: {
				page_size: { type: 'integer', description: 'Number of results (1-100, default 20)' },
				start_cursor: { type: 'string', description: 'Pagination cursor from previous response' },
			},
		},
	},
];

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

async function notion(path: string, apiKey: string, opts: RequestInit = {}): Promise<any> {
	const res = await fetch(`${NOTION_API}${path}`, {
		...opts,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Notion-Version': NOTION_VERSION,
			'Content-Type': 'application/json',
			...(opts.headers as Record<string, string> ?? {}),
		},
	});
	if (!res.ok) {
		let errMsg: string;
		try {
			const err = await res.json() as any;
			errMsg = err.message || err.code || JSON.stringify(err);
		} catch {
			errMsg = await res.text();
		}
		throw new Error(`Notion API ${res.status}: ${errMsg}`);
	}
	const text = await res.text();
	return text ? JSON.parse(text) : {};
}

function extractText(richTextArray: any[]): string {
	if (!Array.isArray(richTextArray)) return '';
	return richTextArray.map((rt: any) => rt.plain_text || rt.text?.content || '').join('');
}

function blockToText(block: any): string {
	const type = block.type;
	const data = block[type];
	if (!data) return '';
	if (data.rich_text) return extractText(data.rich_text);
	if (type === 'divider') return '---';
	if (type === 'equation' && data.expression) return data.expression;
	return '';
}

function buildChildren(blocks: { type: string; text: string }[]): unknown[] {
	return blocks.map((block) => {
		if (block.type === 'divider') {
			return { object: 'block', type: 'divider', divider: {} };
		}
		return {
			object: 'block',
			type: block.type || 'paragraph',
			[block.type || 'paragraph']: {
				rich_text: [{ type: 'text', text: { content: block.text } }],
			},
		};
	});
}

function extractPageTitle(page: any): string {
	if (!page.properties) return '';
	for (const prop of Object.values(page.properties) as any[]) {
		if (prop.type === 'title' && prop.title) {
			return extractText(prop.title);
		}
	}
	return '';
}

// ─── TOOL EXECUTION ─────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, any>, apiKey: string): Promise<any> {
	switch (name) {
		case 'search': {
			const body: Record<string, any> = {};
			if (args.query) body.query = args.query;
			if (args.filter_type) body.filter = { value: args.filter_type, property: 'object' };
			body.page_size = Math.min(args.page_size ?? 10, 100);
			if (args.start_cursor) body.start_cursor = args.start_cursor;

			const data = await notion('/search', apiKey, { method: 'POST', body: JSON.stringify(body) });
			return {
				results: (data.results ?? []).map((r: any) => ({
					id: r.id,
					type: r.object,
					title: extractPageTitle(r) || (r.title ? extractText(r.title) : ''),
					url: r.url,
					last_edited: r.last_edited_time,
				})),
				has_more: data.has_more ?? false,
				next_cursor: data.next_cursor ?? null,
			};
		}

		case 'get_page': {
			if (!args.page_id) throw new Error('page_id is required');
			const page = await notion(`/pages/${args.page_id}`, apiKey);
			return {
				id: page.id,
				url: page.url,
				created: page.created_time,
				last_edited: page.last_edited_time,
				archived: page.archived,
				properties: page.properties,
			};
		}

		case 'create_page': {
			if (!args.database_id) throw new Error('database_id is required');
			if (!args.properties) throw new Error('properties is required');

			const body: Record<string, any> = {
				parent: { database_id: args.database_id },
				properties: args.properties,
			};
			if (args.content?.length) {
				body.children = buildChildren(args.content);
			}

			const page = await notion('/pages', apiKey, { method: 'POST', body: JSON.stringify(body) });
			return { page_id: page.id, url: page.url, created: true };
		}

		case 'update_page': {
			if (!args.page_id) throw new Error('page_id is required');

			const body: Record<string, any> = {};
			if (args.properties) body.properties = args.properties;
			if (args.archived !== undefined) body.archived = args.archived;

			if (Object.keys(body).length === 0) {
				throw new Error('Provide properties or archived flag to update');
			}

			const page = await notion(`/pages/${args.page_id}`, apiKey, { method: 'PATCH', body: JSON.stringify(body) });
			return { page_id: page.id, url: page.url, updated: true };
		}

		case 'query_database': {
			if (!args.database_id) throw new Error('database_id is required');

			const body: Record<string, any> = {
				page_size: Math.min(args.page_size ?? 10, 100),
			};
			if (args.filter) body.filter = args.filter;
			if (args.sorts?.length) body.sorts = args.sorts;
			if (args.start_cursor) body.start_cursor = args.start_cursor;

			const data = await notion(`/databases/${args.database_id}/query`, apiKey, {
				method: 'POST',
				body: JSON.stringify(body),
			});

			return {
				results: (data.results ?? []).map((r: any) => ({
					id: r.id,
					url: r.url,
					title: extractPageTitle(r),
					created: r.created_time,
					last_edited: r.last_edited_time,
					properties: r.properties,
				})),
				has_more: data.has_more ?? false,
				next_cursor: data.next_cursor ?? null,
				count: (data.results ?? []).length,
			};
		}

		case 'get_database': {
			if (!args.database_id) throw new Error('database_id is required');
			const db = await notion(`/databases/${args.database_id}`, apiKey);
			const properties: Record<string, any> = {};
			for (const [name, prop] of Object.entries(db.properties ?? {}) as [string, any][]) {
				const info: Record<string, any> = { type: prop.type };
				if (prop.select?.options) info.options = prop.select.options.map((o: any) => o.name);
				if (prop.multi_select?.options) info.options = prop.multi_select.options.map((o: any) => o.name);
				if (prop.status?.options) info.options = prop.status.options.map((o: any) => o.name);
				if (prop.status?.groups) info.groups = prop.status.groups.map((g: any) => ({ name: g.name, options: g.option_ids }));
				if (prop.relation) info.relation_database_id = prop.relation.database_id;
				properties[name] = info;
			}
			return {
				id: db.id,
				title: db.title ? extractText(db.title) : '',
				url: db.url,
				properties,
			};
		}

		case 'get_page_content': {
			if (!args.page_id) throw new Error('page_id is required');
			const pageSize = Math.min(args.page_size ?? 100, 100);
			let url = `/blocks/${args.page_id}/children?page_size=${pageSize}`;
			if (args.start_cursor) url += `&start_cursor=${encodeURIComponent(args.start_cursor)}`;

			const data = await notion(url, apiKey);
			const blocks = (data.results ?? []).map((b: any) => ({
				id: b.id,
				type: b.type,
				text: blockToText(b),
				has_children: b.has_children ?? false,
			}));
			const plainText = blocks.map((b: any) => b.text).filter(Boolean).join('\n');

			return {
				blocks,
				plain_text: plainText,
				has_more: data.has_more ?? false,
				next_cursor: data.next_cursor ?? null,
				count: blocks.length,
			};
		}

		case 'append_blocks': {
			if (!args.page_id) throw new Error('page_id is required');
			if (!args.blocks?.length) throw new Error('blocks array is required and cannot be empty');

			const children = buildChildren(args.blocks);
			const data = await notion(`/blocks/${args.page_id}/children`, apiKey, {
				method: 'PATCH',
				body: JSON.stringify({ children }),
			});

			return {
				appended: (data.results ?? []).length,
				page_id: args.page_id,
				success: true,
			};
		}

		case 'list_databases': {
			const body: Record<string, any> = {
				filter: { value: 'database', property: 'object' },
				page_size: Math.min(args.page_size ?? 20, 100),
			};
			if (args.start_cursor) body.start_cursor = args.start_cursor;

			const data = await notion('/search', apiKey, { method: 'POST', body: JSON.stringify(body) });
			return {
				databases: (data.results ?? []).map((db: any) => ({
					id: db.id,
					title: db.title ? extractText(db.title) : '',
					url: db.url,
					last_edited: db.last_edited_time,
				})),
				has_more: data.has_more ?? false,
				next_cursor: data.next_cursor ?? null,
			};
		}

		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}

// ─── WORKER HANDLER ─────────────────────────────────────────────────────────

export default {
	async fetch(request: Request): Promise<Response> {
		// Health check
		if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
			return new Response(JSON.stringify({ status: 'ok', server: 'notion-mcp', version: '1.0.0' }), {
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
				serverInfo: { name: 'notion-mcp', version: '1.0.0' },
			});
		}

		if (method === 'tools/list') {
			return rpcOk(id, { tools: TOOLS });
		}

		if (method === 'tools/call') {
			const toolName = params?.name;
			const toolArgs = params?.arguments ?? {};

			const apiKey = request.headers.get('X-Mcp-Secret-NOTION_API_KEY');
			if (!apiKey) {
				return rpcErr(id, -32001, 'Missing NOTION_API_KEY secret. Add your Notion integration token in the dashboard. Get one at notion.so/my-integrations');
			}

			try {
				const result = await callTool(toolName, toolArgs, apiKey);
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
