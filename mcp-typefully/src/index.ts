/**
 * mcp-typefully — Social Media Drafts & Scheduling MCP Server
 *
 * Write, schedule, and manage drafts across X/Twitter, LinkedIn,
 * Threads, Bluesky, and Mastodon via Typefully's v2 API.
 */

const TYPEFULLY_API = 'https://api.typefully.com/v2';

// ─── TOOL DEFINITIONS ───────────────────────────────────────────────────────

const TOOLS = [
	{
		name: 'get_me',
		description: 'Get authenticated user details.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'list_social_sets',
		description: 'List all social sets (connected account groups). Each social set has platform connections (X, LinkedIn, Threads, Bluesky, Mastodon). Use the social_set_id for other operations.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'get_social_set',
		description: 'Get details of a specific social set including connected platforms.',
		inputSchema: {
			type: 'object',
			properties: {
				social_set_id: { type: 'string', description: 'Social set ID' },
			},
			required: ['social_set_id'],
		},
	},
	{
		name: 'create_draft',
		description: 'Create a new draft post. Can be saved as draft, scheduled, or added to queue. Supports threads (multiple content items) for X/Twitter.',
		inputSchema: {
			type: 'object',
			properties: {
				social_set_id: { type: 'string', description: 'Social set ID to create draft in' },
				content: { type: 'string', description: 'Post text content. For threads, separate tweets with \\n\\n---\\n\\n' },
				platforms: {
					type: 'array',
					items: { type: 'string', enum: ['twitter', 'linkedin', 'threads', 'bluesky', 'mastodon'] },
					description: 'Target platforms (omit for all connected)',
				},
				schedule_date: { type: 'string', description: 'ISO 8601 datetime to schedule (e.g. 2026-03-20T09:00:00Z)' },
				add_to_queue: { type: 'boolean', description: 'Add to the next available queue slot instead of scheduling' },
				tags: {
					type: 'array',
					items: { type: 'string' },
					description: 'Tag names to attach to the draft',
				},
			},
			required: ['social_set_id', 'content'],
		},
	},
	{
		name: 'list_drafts',
		description: 'List drafts in a social set. Filter by status: draft, scheduled, published.',
		inputSchema: {
			type: 'object',
			properties: {
				social_set_id: { type: 'string', description: 'Social set ID' },
				status: {
					type: 'string',
					enum: ['draft', 'scheduled', 'published'],
					description: 'Filter by status',
				},
				limit: { type: 'integer', description: 'Max results (1-50, default 25)' },
				offset: { type: 'integer', description: 'Pagination offset' },
			},
			required: ['social_set_id'],
		},
	},
	{
		name: 'get_draft',
		description: 'Get details of a specific draft.',
		inputSchema: {
			type: 'object',
			properties: {
				social_set_id: { type: 'string', description: 'Social set ID' },
				draft_id: { type: 'string', description: 'Draft ID' },
			},
			required: ['social_set_id', 'draft_id'],
		},
	},
	{
		name: 'update_draft',
		description: 'Update an existing draft — change content, schedule, or platforms.',
		inputSchema: {
			type: 'object',
			properties: {
				social_set_id: { type: 'string', description: 'Social set ID' },
				draft_id: { type: 'string', description: 'Draft ID to update' },
				content: { type: 'string', description: 'New content' },
				schedule_date: { type: 'string', description: 'New schedule datetime (ISO 8601)' },
				platforms: {
					type: 'array',
					items: { type: 'string' },
					description: 'Updated target platforms',
				},
			},
			required: ['social_set_id', 'draft_id'],
		},
	},
	{
		name: 'delete_draft',
		description: 'Delete a draft.',
		inputSchema: {
			type: 'object',
			properties: {
				social_set_id: { type: 'string', description: 'Social set ID' },
				draft_id: { type: 'string', description: 'Draft ID to delete' },
			},
			required: ['social_set_id', 'draft_id'],
		},
	},
	{
		name: 'get_queue',
		description: 'Get the posting queue with upcoming time slots and scheduled drafts.',
		inputSchema: {
			type: 'object',
			properties: {
				social_set_id: { type: 'string', description: 'Social set ID' },
			},
			required: ['social_set_id'],
		},
	},
	{
		name: 'get_queue_schedule',
		description: 'Get the queue schedule rules (which days/times posts go out).',
		inputSchema: {
			type: 'object',
			properties: {
				social_set_id: { type: 'string', description: 'Social set ID' },
			},
			required: ['social_set_id'],
		},
	},
	{
		name: 'list_tags',
		description: 'List tags in a social set for organizing drafts.',
		inputSchema: {
			type: 'object',
			properties: {
				social_set_id: { type: 'string', description: 'Social set ID' },
			},
			required: ['social_set_id'],
		},
	},
	{
		name: 'get_analytics',
		description: 'Get post analytics/metrics for a specific platform.',
		inputSchema: {
			type: 'object',
			properties: {
				social_set_id: { type: 'string', description: 'Social set ID' },
				platform: {
					type: 'string',
					enum: ['twitter', 'linkedin', 'threads', 'bluesky', 'mastodon'],
					description: 'Platform to get analytics for',
				},
				limit: { type: 'integer', description: 'Max results (default 25)' },
			},
			required: ['social_set_id', 'platform'],
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

async function typefully(path: string, apiKey: string, opts: RequestInit = {}): Promise<any> {
	const res = await fetch(`${TYPEFULLY_API}${path}`, {
		...opts,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
			...(opts.headers as Record<string, string> ?? {}),
		},
	});
	if (!res.ok) {
		let errMsg: string;
		try {
			const err = await res.json() as any;
			errMsg = err.detail || err.message || err.error || JSON.stringify(err);
		} catch {
			errMsg = await res.text();
		}
		throw new Error(`Typefully API ${res.status}: ${errMsg}`);
	}
	const text = await res.text();
	return text ? JSON.parse(text) : {};
}

// ─── TOOL EXECUTION ─────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, any>, apiKey: string): Promise<any> {
	switch (name) {
		case 'get_me':
			return typefully('/me', apiKey);

		case 'list_social_sets': {
			const data = await typefully('/social-sets', apiKey);
			return data.results ?? data;
		}

		case 'get_social_set': {
			return typefully(`/social-sets/${encodeURIComponent(args.social_set_id)}/`, apiKey);
		}

		case 'create_draft': {
			const body: Record<string, any> = { content: args.content };
			if (args.platforms?.length) body.platforms = args.platforms;
			if (args.schedule_date) body.schedule_date = args.schedule_date;
			if (args.add_to_queue) body.add_to_queue = true;
			if (args.tags?.length) body.tags = args.tags;
			return typefully(`/social-sets/${encodeURIComponent(args.social_set_id)}/drafts`, apiKey, {
				method: 'POST',
				body: JSON.stringify(body),
			});
		}

		case 'list_drafts': {
			let path = `/social-sets/${encodeURIComponent(args.social_set_id)}/drafts`;
			const params: string[] = [];
			if (args.status) params.push(`status=${args.status}`);
			if (args.limit) params.push(`limit=${Math.min(args.limit, 50)}`);
			if (args.offset) params.push(`offset=${args.offset}`);
			if (params.length) path += `?${params.join('&')}`;
			const data = await typefully(path, apiKey);
			return data.results ?? data;
		}

		case 'get_draft': {
			return typefully(
				`/social-sets/${encodeURIComponent(args.social_set_id)}/drafts/${encodeURIComponent(args.draft_id)}`,
				apiKey,
			);
		}

		case 'update_draft': {
			const body: Record<string, any> = {};
			if (args.content !== undefined) body.content = args.content;
			if (args.schedule_date) body.schedule_date = args.schedule_date;
			if (args.platforms) body.platforms = args.platforms;
			return typefully(
				`/social-sets/${encodeURIComponent(args.social_set_id)}/drafts/${encodeURIComponent(args.draft_id)}`,
				apiKey,
				{ method: 'PATCH', body: JSON.stringify(body) },
			);
		}

		case 'delete_draft': {
			await typefully(
				`/social-sets/${encodeURIComponent(args.social_set_id)}/drafts/${encodeURIComponent(args.draft_id)}`,
				apiKey,
				{ method: 'DELETE' },
			);
			return { success: true, draft_id: args.draft_id };
		}

		case 'get_queue': {
			return typefully(`/social-sets/${encodeURIComponent(args.social_set_id)}/queue`, apiKey);
		}

		case 'get_queue_schedule': {
			return typefully(`/social-sets/${encodeURIComponent(args.social_set_id)}/queue/schedule`, apiKey);
		}

		case 'list_tags': {
			const data = await typefully(`/social-sets/${encodeURIComponent(args.social_set_id)}/tags`, apiKey);
			return data.results ?? data;
		}

		case 'get_analytics': {
			let path = `/social-sets/${encodeURIComponent(args.social_set_id)}/analytics/${encodeURIComponent(args.platform)}/posts`;
			if (args.limit) path += `?limit=${Math.min(args.limit, 50)}`;
			return typefully(path, apiKey);
		}

		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}

// ─── WORKER HANDLER ─────────────────────────────────────────────────────────

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
			return new Response(JSON.stringify({ status: 'ok', server: 'typefully-mcp', version: '1.0.0' }), {
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
				serverInfo: { name: 'typefully-mcp', version: '1.0.0' },
			});
		}

		if (method === 'tools/list') {
			return rpcOk(id, { tools: TOOLS });
		}

		if (method === 'tools/call') {
			const toolName = params?.name;
			const toolArgs = params?.arguments ?? {};

			const apiKey = request.headers.get('X-Mcp-Secret-TYPEFULLY-API-KEY');
			if (!apiKey) {
				return rpcErr(id, -32001, 'Missing TYPEFULLY_API_KEY secret. Generate one from Typefully Settings.');
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
