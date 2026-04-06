/**
 * mcp-ocoya — Social Media Scheduling MCP Server
 *
 * Schedule and manage posts across Facebook, Instagram, X, LinkedIn,
 * TikTok, Pinterest, YouTube, and Google Business via Ocoya.
 */

const OCOYA_API = 'https://app.ocoya.com/api/_public/v1';

// ─── TOOL DEFINITIONS ───────────────────────────────────────────────────────

const TOOLS = [
	{
		name: '_ping',
		description: 'Verify Ocoya credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
		inputSchema: { type: 'object', properties: {}, required: [] },
		annotations: { readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'list_workspaces',
		description: 'List all Ocoya workspaces you have access to. Use this first to get a workspace ID for other operations.',
		inputSchema: {
			type: 'object',
			properties: {},
		},
		annotations: { readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'list_social_profiles',
		description: 'List connected social media profiles (accounts) in a workspace. Returns profile IDs needed for scheduling posts.',
		inputSchema: {
			type: 'object',
			properties: {
				workspace_id: { type: 'string', description: 'Ocoya workspace ID' },
			},
			required: ['workspace_id'],
		},
		annotations: { readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'create_post',
		description:
			'Create and optionally schedule a social media post. Provide caption and/or media URLs. If no socialProfileIds are given, post is saved as a draft. If scheduledAt is omitted, post is published immediately.',
		inputSchema: {
			type: 'object',
			properties: {
				workspace_id: { type: 'string', description: 'Ocoya workspace ID' },
				caption: { type: 'string', description: 'Post text content (up to 10,000 chars)' },
				media_urls: {
					type: 'array',
					items: { type: 'string' },
					description: 'Array of public URLs for images/videos to attach',
				},
				social_profile_ids: {
					type: 'array',
					items: { type: 'string' },
					description: 'Profile IDs to post to (omit for draft). Get IDs from list_social_profiles.',
				},
				scheduled_at: {
					type: 'string',
					description: 'ISO 8601 datetime to schedule the post (e.g. 2026-03-20T09:00:00Z). Omit for immediate posting.',
				},
			},
			required: ['workspace_id'],
		},
		annotations: { readOnlyHint: false, destructiveHint: false },
	},
	{
		name: 'list_posts',
		description: 'List posts in a workspace, optionally filtered by status.',
		inputSchema: {
			type: 'object',
			properties: {
				workspace_id: { type: 'string', description: 'Ocoya workspace ID' },
				statuses: {
					type: 'array',
					items: {
						type: 'string',
						enum: ['DRAFT', 'PENDING_CLIENT_APPROVAL', 'PENDING_INTERNAL_APPROVAL', 'SCHEDULED', 'POSTED', 'ERROR'],
					},
					description: 'Filter by post statuses. Omit for all posts.',
				},
				page: { type: 'integer', description: 'Page number (default 1)' },
				per_page: { type: 'integer', description: 'Posts per page (default 20)' },
			},
			required: ['workspace_id'],
		},
		annotations: { readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'update_post',
		description: 'Update a scheduled post — currently supports changing the scheduled time.',
		inputSchema: {
			type: 'object',
			properties: {
				post_id: { type: 'string', description: 'The post ID to update' },
				scheduled_at: { type: 'string', description: 'New ISO 8601 datetime for the schedule' },
			},
			required: ['post_id'],
		},
		annotations: { readOnlyHint: false, destructiveHint: false },
	},
	{
		name: 'delete_post',
		description: 'Delete a post and cancel all its schedules.',
		inputSchema: {
			type: 'object',
			properties: {
				post_id: { type: 'string', description: 'The post ID to delete' },
			},
			required: ['post_id'],
		},
		annotations: { readOnlyHint: false, destructiveHint: true },
	},
	{
		name: 'list_automations',
		description: 'List Ocoya automation workflows in a workspace (e.g. daily poster, mention responder).',
		inputSchema: {
			type: 'object',
			properties: {
				workspace_id: { type: 'string', description: 'Ocoya workspace ID' },
			},
			required: ['workspace_id'],
		},
		annotations: { readOnlyHint: true, destructiveHint: false },
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

async function ocoya(path: string, apiKey: string, opts: RequestInit = {}): Promise<any> {
	const url = new URL(path, OCOYA_API);
	// Preserve query params if path includes them
	const fullUrl = path.startsWith('http') ? path : `${OCOYA_API}${path}`;
	const res = await fetch(fullUrl, {
		...opts,
		headers: {
			'X-API-Key': apiKey,
			'Content-Type': 'application/json',
			Accept: 'application/json',
			...(opts.headers as Record<string, string> ?? {}),
		},
	});
	if (!res.ok) {
		let errMsg: string;
		try {
			const err = await res.json() as any;
			errMsg = err.message || err.error || JSON.stringify(err);
		} catch {
			errMsg = await res.text();
		}
		throw new Error(`Ocoya API ${res.status}: ${errMsg}`);
	}
	const text = await res.text();
	return text ? JSON.parse(text) : {};
}

// ─── TOOL EXECUTION ─────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, any>, apiKey: string): Promise<any> {
	switch (name) {
		case '_ping': {
			await ocoya('/workspaces', apiKey);
			return { content: [{ type: 'text', text: 'Connected to Ocoya' }] };
		}

		case 'list_workspaces': {
			const data = await ocoya('/workspaces', apiKey);
			return Array.isArray(data)
				? data.map((w: any) => ({ id: w.id, name: w.name, user_count: w.userCount }))
				: data;
		}

		case 'list_social_profiles': {
			if (!args.workspace_id) throw new Error('workspace_id is required');
			const data = await ocoya(`/social-profiles?workspaceId=${encodeURIComponent(args.workspace_id)}`, apiKey);
			return Array.isArray(data)
				? data.map((p: any) => ({ id: p.id, provider: p.provider, name: p.name }))
				: data;
		}

		case 'create_post': {
			if (!args.workspace_id) throw new Error('workspace_id is required');
			if (!args.caption && !args.media_urls?.length) {
				throw new Error('Either caption or media_urls is required');
			}
			const body: Record<string, any> = {};
			if (args.caption) body.caption = args.caption;
			if (args.media_urls?.length) body.mediaUrls = args.media_urls;
			if (args.social_profile_ids?.length) body.socialProfileIds = args.social_profile_ids;
			if (args.scheduled_at) body.scheduledAt = args.scheduled_at;

			const data = await ocoya(`/post?workspaceId=${encodeURIComponent(args.workspace_id)}`, apiKey, {
				method: 'POST',
				body: JSON.stringify(body),
			});

			const status = args.social_profile_ids?.length
				? args.scheduled_at ? 'scheduled' : 'publishing'
				: 'draft';
			return { post_group_id: data.postGroupId, status };
		}

		case 'list_posts': {
			if (!args.workspace_id) throw new Error('workspace_id is required');
			let path = `/post?workspaceId=${encodeURIComponent(args.workspace_id)}`;
			if (args.statuses?.length) {
				for (const s of args.statuses) {
					path += `&statuses=${encodeURIComponent(s)}`;
				}
			}
			if (args.page) path += `&page=${args.page}`;
			if (args.per_page) path += `&perPage=${args.per_page}`;

			const data = await ocoya(path, apiKey);
			return Array.isArray(data)
				? data.map((p: any) => ({
						id: p.id,
						status: p.status,
						post_type: p.postType,
						scheduled_at: p.scheduledAt,
						platforms: p.socialProfiles?.map((sp: any) => sp.provider) ?? [],
						caption_preview: p.posts?.[0]?.caption?.slice(0, 100) ?? null,
					}))
				: data;
		}

		case 'update_post': {
			if (!args.post_id) throw new Error('post_id is required');
			const body: Record<string, any> = {};
			if (args.scheduled_at) body.scheduledAt = args.scheduled_at;
			await ocoya(`/post/${encodeURIComponent(args.post_id)}`, apiKey, {
				method: 'PATCH',
				body: JSON.stringify(body),
			});
			return { success: true, post_id: args.post_id };
		}

		case 'delete_post': {
			if (!args.post_id) throw new Error('post_id is required');
			await ocoya(`/post/${encodeURIComponent(args.post_id)}`, apiKey, { method: 'DELETE' });
			return { success: true, post_id: args.post_id, message: 'Post deleted and schedules cancelled' };
		}

		case 'list_automations': {
			if (!args.workspace_id) throw new Error('workspace_id is required');
			const data = await ocoya(`/workflow?workspaceId=${encodeURIComponent(args.workspace_id)}`, apiKey);
			return Array.isArray(data)
				? data.map((w: any) => ({ id: w.id, name: w.name, active: w.on, created_at: w.createdAt }))
				: data;
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
			return new Response(JSON.stringify({ status: 'ok', server: 'ocoya-mcp', version: '1.0.0' }), {
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
				serverInfo: { name: 'ocoya-mcp', version: '1.0.0' },
			});
		}

		if (method === 'tools/list') {
			return rpcOk(id, { tools: TOOLS });
		}

		if (method === 'tools/call') {
			const toolName = params?.name;
			const toolArgs = params?.arguments ?? {};

			const apiKey = request.headers.get('X-Mcp-Secret-OCOYA-API-KEY');
			if (!apiKey) {
				return rpcErr(id, -32001, 'Missing OCOYA_API_KEY secret. Add your Ocoya API key in the dashboard.');
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
