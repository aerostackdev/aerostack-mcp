/**
 * mcp-ayrshare — Universal Social Media API MCP Server
 *
 * Post, schedule, and analyze across 13 platforms: Facebook, Instagram,
 * X/Twitter, LinkedIn, TikTok, Bluesky, Threads, Reddit, Pinterest,
 * YouTube, Telegram, Snapchat, Google Business.
 */

const AYRSHARE_API = 'https://api.ayrshare.com/api';

const ALL_PLATFORMS = [
	'bluesky', 'facebook', 'gmb', 'instagram', 'linkedin',
	'pinterest', 'reddit', 'snapchat', 'telegram', 'threads',
	'tiktok', 'twitter', 'youtube',
];

// ─── TOOL DEFINITIONS ───────────────────────────────────────────────────────

const TOOLS = [
	{
		name: 'create_post',
		description: 'Create and publish or schedule a social media post across up to 13 platforms simultaneously. Supports text, images, and videos.',
		inputSchema: {
			type: 'object',
			properties: {
				post: { type: 'string', description: 'Post text content (can be empty string for media-only posts)' },
				platforms: {
					type: 'array',
					items: { type: 'string', enum: ALL_PLATFORMS },
					description: 'Target platforms. Use specific names or omit for all connected.',
				},
				media_urls: {
					type: 'array',
					items: { type: 'string' },
					description: 'Array of HTTPS URLs for images/videos to attach',
				},
				schedule_date: {
					type: 'string',
					description: 'UTC datetime to schedule: YYYY-MM-DDThh:mm:ssZ (e.g. 2026-03-20T09:00:00Z). Omit for immediate posting.',
				},
				is_video: { type: 'boolean', description: 'Set true if media_urls contain videos' },
				shorten_links: { type: 'boolean', description: 'Auto-shorten links in the post' },
				auto_hashtag: { type: 'boolean', description: 'Auto-generate and append relevant hashtags' },
				notes: { type: 'string', description: 'Internal notes (not published)' },
			},
			required: ['post', 'platforms'],
		},
	},
	{
		name: 'get_post',
		description: 'Get details and status of a specific post by its Ayrshare ID.',
		inputSchema: {
			type: 'object',
			properties: {
				post_id: { type: 'string', description: 'Ayrshare post ID' },
			},
			required: ['post_id'],
		},
	},
	{
		name: 'delete_post',
		description: 'Delete a post from social platforms. Works for scheduled and most published posts.',
		inputSchema: {
			type: 'object',
			properties: {
				post_id: { type: 'string', description: 'Ayrshare post ID to delete' },
			},
			required: ['post_id'],
		},
	},
	{
		name: 'delete_all_scheduled',
		description: 'Delete ALL scheduled (pending) posts. Use with caution.',
		inputSchema: {
			type: 'object',
			properties: {
				confirm: { type: 'boolean', description: 'Must be true to proceed' },
			},
			required: ['confirm'],
		},
	},
	{
		name: 'get_history',
		description: 'Get post history — all posts with their status and platform results.',
		inputSchema: {
			type: 'object',
			properties: {
				platform: {
					type: 'string',
					enum: ALL_PLATFORMS,
					description: 'Filter by platform (optional)',
				},
				status: {
					type: 'string',
					enum: ['success', 'error', 'pending', 'deleted'],
					description: 'Filter by status (optional)',
				},
				limit: { type: 'integer', description: 'Max results (default 20)' },
			},
		},
	},
	{
		name: 'get_analytics',
		description: 'Get engagement analytics for a specific post (likes, shares, comments, impressions).',
		inputSchema: {
			type: 'object',
			properties: {
				post_id: { type: 'string', description: 'Ayrshare post ID to get analytics for' },
				platforms: {
					type: 'array',
					items: { type: 'string', enum: ALL_PLATFORMS },
					description: 'Platforms to get analytics for',
				},
			},
			required: ['post_id', 'platforms'],
		},
	},
	{
		name: 'get_comments',
		description: 'Get comments on a specific post from supported platforms.',
		inputSchema: {
			type: 'object',
			properties: {
				post_id: { type: 'string', description: 'Ayrshare post ID' },
			},
			required: ['post_id'],
		},
	},
	{
		name: 'post_comment',
		description: 'Add a comment/reply to an existing post on supported platforms (Facebook, Instagram, LinkedIn, YouTube).',
		inputSchema: {
			type: 'object',
			properties: {
				post_id: { type: 'string', description: 'Ayrshare post ID to comment on' },
				comment: { type: 'string', description: 'Comment text' },
				platforms: {
					type: 'array',
					items: { type: 'string' },
					description: 'Platforms to comment on',
				},
			},
			required: ['post_id', 'comment', 'platforms'],
		},
	},
	{
		name: 'auto_hashtags',
		description: 'Generate trending, relevant hashtags for a given post text.',
		inputSchema: {
			type: 'object',
			properties: {
				post: { type: 'string', description: 'Post text to generate hashtags for' },
				num_hashtags: { type: 'integer', description: 'Number of hashtags to generate (default 5)' },
			},
			required: ['post'],
		},
	},
	{
		name: 'shorten_link',
		description: 'Shorten a URL using Ayrshare link shortener.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'URL to shorten' },
			},
			required: ['url'],
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

async function ayrshare(path: string, apiKey: string, opts: RequestInit = {}): Promise<any> {
	const res = await fetch(`${AYRSHARE_API}${path}`, {
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
			errMsg = err.message || err.error || (err.errors ? JSON.stringify(err.errors) : JSON.stringify(err));
		} catch {
			errMsg = await res.text();
		}
		throw new Error(`Ayrshare API ${res.status}: ${errMsg}`);
	}
	const text = await res.text();
	return text ? JSON.parse(text) : {};
}

// ─── TOOL EXECUTION ─────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, any>, apiKey: string): Promise<any> {
	switch (name) {
		case 'create_post': {
			const body: Record<string, any> = {
				post: args.post,
				platforms: args.platforms,
			};
			if (args.media_urls?.length) body.mediaUrls = args.media_urls;
			if (args.schedule_date) body.scheduleDate = args.schedule_date;
			if (args.is_video) body.isVideo = true;
			if (args.shorten_links) body.shortenLinks = true;
			if (args.auto_hashtag) body.autoHashtag = { max: 5 };
			if (args.notes) body.notes = args.notes;

			const data = await ayrshare('/post', apiKey, {
				method: 'POST',
				body: JSON.stringify(body),
			});
			return {
				id: data.id,
				status: data.status,
				post_ids: data.postIds,
			};
		}

		case 'get_post': {
			return ayrshare(`/post/${encodeURIComponent(args.post_id)}`, apiKey);
		}

		case 'delete_post': {
			return ayrshare('/post', apiKey, {
				method: 'DELETE',
				body: JSON.stringify({ id: args.post_id }),
			});
		}

		case 'delete_all_scheduled': {
			if (!args.confirm) throw new Error('Must set confirm: true to delete all scheduled posts');
			return ayrshare('/post', apiKey, {
				method: 'DELETE',
				body: JSON.stringify({ deleteAllScheduled: true }),
			});
		}

		case 'get_history': {
			let path = '/history';
			const params: string[] = [];
			if (args.platform) params.push(`platform=${args.platform}`);
			if (args.status) params.push(`status=${args.status}`);
			if (args.limit) params.push(`limit=${args.limit}`);
			if (params.length) path += `?${params.join('&')}`;
			return ayrshare(path, apiKey);
		}

		case 'get_analytics': {
			return ayrshare('/analytics/post', apiKey, {
				method: 'POST',
				body: JSON.stringify({
					id: args.post_id,
					platforms: args.platforms,
				}),
			});
		}

		case 'get_comments': {
			return ayrshare(`/comments/${encodeURIComponent(args.post_id)}`, apiKey);
		}

		case 'post_comment': {
			return ayrshare('/comments', apiKey, {
				method: 'POST',
				body: JSON.stringify({
					id: args.post_id,
					comment: args.comment,
					platforms: args.platforms,
				}),
			});
		}

		case 'auto_hashtags': {
			return ayrshare('/auto-hashtag', apiKey, {
				method: 'POST',
				body: JSON.stringify({
					post: args.post,
					max: args.num_hashtags || 5,
				}),
			});
		}

		case 'shorten_link': {
			return ayrshare('/shorten-link', apiKey, {
				method: 'POST',
				body: JSON.stringify({ url: args.url }),
			});
		}

		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}

// ─── WORKER HANDLER ─────────────────────────────────────────────────────────

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
			return new Response(JSON.stringify({ status: 'ok', server: 'ayrshare-mcp', version: '1.0.0' }), {
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
				serverInfo: { name: 'ayrshare-mcp', version: '1.0.0' },
			});
		}

		if (method === 'tools/list') {
			return rpcOk(id, { tools: TOOLS });
		}

		if (method === 'tools/call') {
			const toolName = params?.name;
			const toolArgs = params?.arguments ?? {};

			const apiKey = request.headers.get('X-Mcp-Secret-AYRSHARE-API-KEY');
			if (!apiKey) {
				return rpcErr(id, -32001, 'Missing AYRSHARE_API_KEY secret. Get your key from ayrshare.com dashboard.');
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
