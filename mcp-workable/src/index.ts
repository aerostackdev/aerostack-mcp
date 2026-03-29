/**
 * Workable ATS MCP Worker
 * Implements MCP protocol over HTTP for Workable ATS operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   WORKABLE_API_KEY    → X-Mcp-Secret-WORKABLE-API-KEY
 *   WORKABLE_SUBDOMAIN  → X-Mcp-Secret-WORKABLE-SUBDOMAIN (e.g. "mycompany")
 */

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
        name: 'list_jobs',
        description: 'List jobs in Workable',
        inputSchema: {
            type: 'object',
            properties: {
                state: { type: 'string', enum: ['published', 'draft', 'closed', 'archived'], description: 'Filter by state' },
                limit: { type: 'number', description: 'Max results (default: 25)' },
                since_id: { type: 'string', description: 'Pagination: get records after this ID' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_job',
        description: 'Get a specific job by shortcode',
        inputSchema: {
            type: 'object',
            properties: { shortcode: { type: 'string', description: 'Job shortcode (required)' } },
            required: ['shortcode'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_candidates',
        description: 'List candidates in Workable',
        inputSchema: {
            type: 'object',
            properties: {
                stage: { type: 'string', description: 'Filter by stage slug' },
                limit: { type: 'number', description: 'Max results (default: 25)' },
                since_id: { type: 'string', description: 'Pagination offset' },
                job_shortcode: { type: 'string', description: 'Filter by job shortcode' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_candidate',
        description: 'Create a new candidate for a job in Workable',
        inputSchema: {
            type: 'object',
            properties: {
                shortcode: { type: 'string', description: 'Job shortcode (required)' },
                name: { type: 'string', description: 'Candidate full name (required)' },
                email: { type: 'string', description: 'Email address' },
                phone: { type: 'string', description: 'Phone number' },
                resume_url: { type: 'string', description: 'URL to resume' },
                cover_letter: { type: 'string', description: 'Cover letter text' },
                social_profiles: { type: 'array', description: 'Array of {type, url} objects' },
                answers: { type: 'array', description: 'Array of {field, value} objects' },
            },
            required: ['shortcode', 'name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_candidate',
        description: 'Get a specific candidate by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Candidate ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_candidate_stage',
        description: 'Move a candidate to a different stage',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Candidate ID (required)' },
                stage: { type: 'string', description: 'Stage slug (required)' },
            },
            required: ['id', 'stage'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_stages',
        description: 'List pipeline stages in Workable',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_members',
        description: 'List team members in Workable',
        inputSchema: {
            type: 'object',
            properties: {
                role: { type: 'string', description: 'Filter by role' },
                limit: { type: 'number', description: 'Max results (default: 25)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_departments',
        description: 'List departments in Workable',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_pipelines',
        description: 'List pipelines in Workable',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'post_comment',
        description: 'Post a comment on a candidate',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Candidate ID (required)' },
                comment: { type: 'string', description: 'Comment text (required)' },
                policy: { type: 'string', enum: ['simple', 'assessment'], description: 'Comment policy (default: simple)' },
                member_id: { type: 'string', description: 'Member ID of commenter' },
            },
            required: ['id', 'comment'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_comments',
        description: 'List comments for a candidate',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Candidate ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'rate_candidate',
        description: 'Rate a candidate (1-5)',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Candidate ID (required)' },
                rating: { type: 'number', description: 'Rating 1-5 (required)' },
                comment: { type: 'string', description: 'Optional comment' },
            },
            required: ['id', 'rating'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'add_tag',
        description: 'Add tags to a candidate',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Candidate ID (required)' },
                tags: { type: 'array', description: 'Array of tag strings (required)' },
            },
            required: ['id', 'tags'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'schedule_interview',
        description: 'Schedule an interview for a candidate',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Candidate ID (required)' },
                event_type: { type: 'string', description: 'Event type (required)', enum: ['interview', 'offer'] },
                interview_date: { type: 'string', description: 'Interview date (ISO 8601)' },
                interviewer_ids: { type: 'array', description: 'Array of interviewer member IDs' },
            },
            required: ['id', 'event_type'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_events',
        description: 'List events for a candidate',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Candidate ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'archive_candidate',
        description: 'Archive (delete) a candidate',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Candidate ID (required)' },
                reason: { type: 'string', description: 'Reason for archiving' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'search_candidates',
        description: 'Search for candidates by query',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query (required)' },
                job_shortcode: { type: 'string', description: 'Filter by job shortcode' },
                limit: { type: 'number', description: 'Max results (default: 25)' },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

function getSecrets(request: Request): { apiKey: string; subdomain: string } | null {
    const apiKey = request.headers.get('X-Mcp-Secret-WORKABLE-API-KEY');
    const subdomain = request.headers.get('X-Mcp-Secret-WORKABLE-SUBDOMAIN');
    if (!apiKey || !subdomain) return null;
    return { apiKey, subdomain };
}

async function workableFetch(
    path: string,
    apiKey: string,
    subdomain: string,
    options: RequestInit = {},
): Promise<unknown> {
    const base = `https://${subdomain}.workable.com/spi/v3`;
    const res = await fetch(`${base}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Workable API ${res.status}: ${text}`);
    }
    if (res.status === 204) return {};
    return res.json();
}

function buildQuery(params: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
        if (v != null) parts.push(`${k}=${encodeURIComponent(String(v))}`);
    }
    return parts.length ? '?' + parts.join('&') : '';
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string, subdomain: string): Promise<unknown> {
    switch (name) {
        case 'list_jobs': {
            const q = buildQuery({ state: args.state, limit: args.limit ?? 25, since_id: args.since_id });
            const data = await workableFetch(`/jobs${q}`, apiKey, subdomain) as any;
            return { jobs: data.jobs ?? [], paging: data.paging ?? {} };
        }

        case 'get_job': {
            if (!args.shortcode) throw new Error('shortcode is required');
            return workableFetch(`/jobs/${args.shortcode}`, apiKey, subdomain);
        }

        case 'list_candidates': {
            const q = buildQuery({
                stage: args.stage,
                limit: args.limit ?? 25,
                since_id: args.since_id,
                job_shortcode: args.job_shortcode,
            });
            const data = await workableFetch(`/candidates${q}`, apiKey, subdomain) as any;
            return { candidates: data.candidates ?? [], paging: data.paging ?? {} };
        }

        case 'create_candidate': {
            if (!args.shortcode) throw new Error('shortcode is required');
            if (!args.name) throw new Error('name is required');
            const candidate: Record<string, unknown> = { name: args.name };
            if (args.email) candidate.email = args.email;
            if (args.phone) candidate.phone = args.phone;
            if (args.resume_url) candidate.resume_url = args.resume_url;
            if (args.cover_letter) candidate.cover_letter = args.cover_letter;
            if (args.social_profiles) candidate.social_profiles = args.social_profiles;
            if (args.answers) candidate.answers = args.answers;
            const data = await workableFetch(`/jobs/${args.shortcode}/candidates`, apiKey, subdomain, {
                method: 'POST',
                body: JSON.stringify({ candidate }),
            }) as any;
            return data.candidate ?? data;
        }

        case 'get_candidate': {
            if (!args.id) throw new Error('id is required');
            return workableFetch(`/candidates/${args.id}`, apiKey, subdomain);
        }

        case 'update_candidate_stage': {
            if (!args.id) throw new Error('id is required');
            if (!args.stage) throw new Error('stage is required');
            const data = await workableFetch(`/candidates/${args.id}`, apiKey, subdomain, {
                method: 'PATCH',
                body: JSON.stringify({ stage: args.stage }),
            }) as any;
            return data.candidate ?? data;
        }

        case 'list_stages': {
            const data = await workableFetch('/stages', apiKey, subdomain) as any;
            return { stages: data.stages ?? [] };
        }

        case 'list_members': {
            const q = buildQuery({ role: args.role, limit: args.limit ?? 25 });
            const data = await workableFetch(`/members${q}`, apiKey, subdomain) as any;
            return { members: data.members ?? [] };
        }

        case 'list_departments': {
            const data = await workableFetch('/departments', apiKey, subdomain) as any;
            return { departments: data.departments ?? [] };
        }

        case 'list_pipelines': {
            const data = await workableFetch('/pipelines', apiKey, subdomain) as any;
            return { pipelines: data.pipelines ?? [] };
        }

        case 'post_comment': {
            if (!args.id) throw new Error('id is required');
            if (!args.comment) throw new Error('comment is required');
            const body: Record<string, unknown> = {
                comment: args.comment,
                policy: args.policy ?? 'simple',
            };
            if (args.member_id) body.member_id = args.member_id;
            const data = await workableFetch(`/candidates/${args.id}/comments`, apiKey, subdomain, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;
            return data.comment ?? data;
        }

        case 'list_comments': {
            if (!args.id) throw new Error('id is required');
            const data = await workableFetch(`/candidates/${args.id}/comments`, apiKey, subdomain) as any;
            return { comments: data.comments ?? [] };
        }

        case 'rate_candidate': {
            if (!args.id) throw new Error('id is required');
            if (args.rating == null) throw new Error('rating is required');
            const body: Record<string, unknown> = { rating: Number(args.rating) };
            if (args.comment) body.comment = args.comment;
            const data = await workableFetch(`/candidates/${args.id}/ratings`, apiKey, subdomain, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;
            return data.rating ?? data;
        }

        case 'add_tag': {
            if (!args.id) throw new Error('id is required');
            if (!args.tags) throw new Error('tags is required');
            const data = await workableFetch(`/candidates/${args.id}/tags`, apiKey, subdomain, {
                method: 'POST',
                body: JSON.stringify({ tags: args.tags }),
            }) as any;
            return { tags: data.tags ?? args.tags };
        }

        case 'schedule_interview': {
            if (!args.id) throw new Error('id is required');
            if (!args.event_type) throw new Error('event_type is required');
            const body: Record<string, unknown> = { event_type: args.event_type };
            if (args.interview_date) body.interview_date = args.interview_date;
            if (args.interviewer_ids) body.interviewer_ids = args.interviewer_ids;
            const data = await workableFetch(`/candidates/${args.id}/events`, apiKey, subdomain, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;
            return data.event ?? data;
        }

        case 'list_events': {
            if (!args.id) throw new Error('id is required');
            const data = await workableFetch(`/candidates/${args.id}/events`, apiKey, subdomain) as any;
            return { events: data.events ?? [] };
        }

        case 'archive_candidate': {
            if (!args.id) throw new Error('id is required');
            const q = args.reason ? `?reason=${encodeURIComponent(String(args.reason))}` : '';
            await workableFetch(`/candidates/${args.id}${q}`, apiKey, subdomain, { method: 'DELETE' });
            return { success: true, id: args.id };
        }

        case 'search_candidates': {
            if (!args.query) throw new Error('query is required');
            const q = buildQuery({
                query: args.query,
                job_shortcode: args.job_shortcode,
                limit: args.limit ?? 25,
            });
            const data = await workableFetch(`/candidates${q}`, apiKey, subdomain) as any;
            return { candidates: data.candidates ?? [], paging: data.paging ?? {} };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-workable', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-workable', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const secrets = getSecrets(request);
            if (!secrets) {
                return rpcErr(id, -32001, 'Missing required secrets: WORKABLE_API_KEY, WORKABLE_SUBDOMAIN');
            }
            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};
            try {
                const result = await callTool(toolName, toolArgs, secrets.apiKey, secrets.subdomain);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
