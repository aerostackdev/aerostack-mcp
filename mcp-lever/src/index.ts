/**
 * Lever ATS MCP Worker
 * Implements MCP protocol over HTTP for Lever ATS operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   LEVER_API_KEY → X-Mcp-Secret-LEVER-API-KEY
 *
 * Auth: Basic auth with apiKey as username, empty password: btoa(apiKey + ':')
 */

const LEVER_BASE = 'https://api.lever.co/v1';

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
        name: 'list_postings',
        description: 'List job postings in Lever',
        inputSchema: {
            type: 'object',
            properties: {
                state: { type: 'string', enum: ['published', 'internal', 'closed', 'rejected', 'draft'], description: 'Posting state (default: published)' },
                limit: { type: 'number', description: 'Max results (default: 25)' },
                offset: { type: 'string', description: 'Pagination offset' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_posting',
        description: 'Get a specific job posting by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Posting ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_opportunities',
        description: 'List candidate opportunities in Lever',
        inputSchema: {
            type: 'object',
            properties: {
                posting_id: { type: 'string', description: 'Filter by posting ID' },
                stage_id: { type: 'string', description: 'Filter by stage ID' },
                owner: { type: 'string', description: 'Filter by owner user ID' },
                limit: { type: 'number', description: 'Max results (default: 25)' },
                offset: { type: 'string', description: 'Pagination offset' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_opportunity',
        description: 'Create a new candidate opportunity in Lever',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Candidate name (required)' },
                email: { type: 'string', description: 'Candidate email (required)' },
                posting_id: { type: 'string', description: 'Job posting ID' },
                stage_id: { type: 'string', description: 'Pipeline stage ID' },
                resume_url: { type: 'string', description: 'Resume URL' },
                phone: { type: 'string', description: 'Phone number' },
                links: { type: 'array', description: 'Array of profile URLs' },
                tags: { type: 'array', description: 'Array of tag strings' },
            },
            required: ['name', 'email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_opportunity',
        description: 'Get a specific opportunity by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Opportunity ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_opportunity_stage',
        description: 'Update the stage of an opportunity',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Opportunity ID (required)' },
                stage_id: { type: 'string', description: 'New stage ID (required)' },
            },
            required: ['id', 'stage_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'add_opportunity_note',
        description: 'Add a note to an opportunity',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Opportunity ID (required)' },
                value: { type: 'string', description: 'Note text (required)' },
                score: { type: 'string', enum: ['thumbsup', 'thumbsdown', ''], description: 'Note score' },
            },
            required: ['id', 'value'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_stages',
        description: 'List all pipeline stages in Lever',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_pipeline_stages',
        description: 'List all pipeline stages (alias for list_stages)',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_users',
        description: 'List users in Lever',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default: 25)' },
                offset: { type: 'string', description: 'Pagination offset' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_tags',
        description: 'List all tags in Lever',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_tag_to_opportunity',
        description: 'Add tags to an opportunity',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Opportunity ID (required)' },
                tags: { type: 'array', description: 'Array of tag strings (required)' },
            },
            required: ['id', 'tags'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'remove_tag_from_opportunity',
        description: 'Remove tags from an opportunity',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Opportunity ID (required)' },
                tags: { type: 'array', description: 'Array of tag strings (required)' },
            },
            required: ['id', 'tags'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_feedback_forms',
        description: 'List feedback for an opportunity',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Opportunity ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'advance_opportunity',
        description: 'Advance an opportunity to a new stage',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Opportunity ID (required)' },
                stage_id: { type: 'string', description: 'Target stage ID (required)' },
            },
            required: ['id', 'stage_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'archive_opportunity',
        description: 'Archive an opportunity',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Opportunity ID (required)' },
                reason_id: { type: 'string', description: 'Archive reason ID (required)' },
            },
            required: ['id', 'reason_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_archive_reasons',
        description: 'List available archive reasons',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_opportunity_resume',
        description: 'Get resumes for an opportunity',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Opportunity ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

function leverAuth(apiKey: string): string {
    return 'Basic ' + btoa(`${apiKey}:`);
}

async function leverFetch(path: string, apiKey: string, options: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${LEVER_BASE}${path}`, {
        ...options,
        headers: {
            Authorization: leverAuth(apiKey),
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Lever API ${res.status}: ${text}`);
    }
    return res.json();
}

function buildQuery(params: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
        if (v != null) parts.push(`${k}=${encodeURIComponent(String(v))}`);
    }
    return parts.length ? '?' + parts.join('&') : '';
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case 'list_postings': {
            const q = buildQuery({
                state: args.state ?? 'published',
                limit: args.limit ?? 25,
                offset: args.offset,
            });
            const data = await leverFetch(`/postings${q}`, apiKey) as any;
            return { postings: data.data ?? [], hasNext: data.hasNext ?? false };
        }

        case 'get_posting': {
            if (!args.id) throw new Error('id is required');
            const data = await leverFetch(`/postings/${args.id}`, apiKey) as any;
            return data.data ?? data;
        }

        case 'list_opportunities': {
            const q = buildQuery({
                posting_id: args.posting_id,
                stage_id: args.stage_id,
                owner: args.owner,
                limit: args.limit ?? 25,
                offset: args.offset,
            });
            const data = await leverFetch(`/opportunities${q}`, apiKey) as any;
            return { opportunities: data.data ?? [], hasNext: data.hasNext ?? false };
        }

        case 'create_opportunity': {
            if (!args.name) throw new Error('name is required');
            if (!args.email) throw new Error('email is required');
            const body: Record<string, unknown> = {
                name: args.name,
                emails: [{ type: 'work', value: args.email }],
            };
            if (args.posting_id) body.postings = [args.posting_id];
            if (args.stage_id) body.stage = args.stage_id;
            if (args.resume_url) body.resumeUrl = args.resume_url;
            if (args.phone) body.phones = [{ type: 'work', value: args.phone }];
            if (args.links) body.links = args.links;
            if (args.tags) body.tags = args.tags;
            const data = await leverFetch('/opportunities', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;
            return data.data ?? data;
        }

        case 'get_opportunity': {
            if (!args.id) throw new Error('id is required');
            const data = await leverFetch(`/opportunities/${args.id}`, apiKey) as any;
            return data.data ?? data;
        }

        case 'update_opportunity_stage': {
            if (!args.id) throw new Error('id is required');
            if (!args.stage_id) throw new Error('stage_id is required');
            const data = await leverFetch(`/opportunities/${args.id}/stage`, apiKey, {
                method: 'PUT',
                body: JSON.stringify({ stage: args.stage_id }),
            }) as any;
            return data.data ?? data;
        }

        case 'add_opportunity_note': {
            if (!args.id) throw new Error('id is required');
            if (!args.value) throw new Error('value is required');
            const body: Record<string, unknown> = { value: args.value };
            if (args.score != null) body.score = args.score;
            const data = await leverFetch(`/opportunities/${args.id}/notes`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;
            return data.data ?? data;
        }

        case 'list_stages':
        case 'list_pipeline_stages': {
            const data = await leverFetch('/stages', apiKey) as any;
            return { stages: data.data ?? [] };
        }

        case 'list_users': {
            const q = buildQuery({ limit: args.limit ?? 25, offset: args.offset });
            const data = await leverFetch(`/users${q}`, apiKey) as any;
            return { users: data.data ?? [] };
        }

        case 'list_tags': {
            const data = await leverFetch('/tags', apiKey) as any;
            return { tags: data.data ?? [] };
        }

        case 'add_tag_to_opportunity': {
            if (!args.id) throw new Error('id is required');
            if (!args.tags) throw new Error('tags is required');
            const data = await leverFetch(`/opportunities/${args.id}/addTags`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ tags: args.tags }),
            }) as any;
            return data.data ?? data;
        }

        case 'remove_tag_from_opportunity': {
            if (!args.id) throw new Error('id is required');
            if (!args.tags) throw new Error('tags is required');
            const data = await leverFetch(`/opportunities/${args.id}/removeTags`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ tags: args.tags }),
            }) as any;
            return data.data ?? data;
        }

        case 'list_feedback_forms': {
            if (!args.id) throw new Error('id is required');
            const data = await leverFetch(`/opportunities/${args.id}/feedback`, apiKey) as any;
            return { feedback: data.data ?? [] };
        }

        case 'advance_opportunity': {
            if (!args.id) throw new Error('id is required');
            if (!args.stage_id) throw new Error('stage_id is required');
            const data = await leverFetch(`/opportunities/${args.id}/advance`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ stage: args.stage_id }),
            }) as any;
            return data.data ?? data;
        }

        case 'archive_opportunity': {
            if (!args.id) throw new Error('id is required');
            if (!args.reason_id) throw new Error('reason_id is required');
            const data = await leverFetch(`/opportunities/${args.id}/archive`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ reason: args.reason_id }),
            }) as any;
            return data.data ?? data;
        }

        case 'list_archive_reasons': {
            const data = await leverFetch('/archive_reasons', apiKey) as any;
            return { reasons: data.data ?? [] };
        }

        case 'get_opportunity_resume': {
            if (!args.id) throw new Error('id is required');
            const data = await leverFetch(`/opportunities/${args.id}/resumes`, apiKey) as any;
            return { resumes: data.data ?? [] };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-lever', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-lever', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-LEVER-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: LEVER_API_KEY');
            }
            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};
            try {
                const result = await callTool(toolName, toolArgs, apiKey);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
