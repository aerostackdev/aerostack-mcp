/**
 * Folk CRM MCP Worker
 * Implements MCP protocol over HTTP for Folk CRM operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   FOLK_API_KEY → X-Mcp-Secret-FOLK-API-KEY
 */

const FOLK_BASE = 'https://api.folk.app/v2';

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
        name: 'list_people',
        description: 'List people in Folk CRM',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default: 25)' },
                cursor: { type: 'string', description: 'Pagination cursor' },
                query: { type: 'string', description: 'Search query' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_person',
        description: 'Create a new person in Folk CRM',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Full name (required)' },
                email: { type: 'string' },
                phone: { type: 'string' },
                company: { type: 'string' },
                title: { type: 'string' },
                notes: { type: 'string' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_person',
        description: 'Get a specific person by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Person ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_person',
        description: 'Update a person in Folk CRM',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Person ID (required)' },
                name: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
                company: { type: 'string' },
                title: { type: 'string' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_person',
        description: 'Delete a person from Folk CRM',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Person ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_groups',
        description: 'List groups in Folk CRM',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default: 25)' },
                cursor: { type: 'string', description: 'Pagination cursor' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_group',
        description: 'Create a new group in Folk CRM',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Group name (required)' },
                description: { type: 'string' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'add_to_group',
        description: 'Add people to a Folk CRM group',
        inputSchema: {
            type: 'object',
            properties: {
                group_id: { type: 'string', description: 'Group ID (required)' },
                people_ids: { type: 'array', description: 'Array of person IDs to add (required)' },
            },
            required: ['group_id', 'people_ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'remove_from_group',
        description: 'Remove people from a Folk CRM group',
        inputSchema: {
            type: 'object',
            properties: {
                group_id: { type: 'string', description: 'Group ID (required)' },
                people_ids: { type: 'array', description: 'Array of person IDs to remove (required)' },
            },
            required: ['group_id', 'people_ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_companies',
        description: 'List companies in Folk CRM',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default: 25)' },
                cursor: { type: 'string' },
                query: { type: 'string', description: 'Search query' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_company',
        description: 'Create a new company in Folk CRM',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Company name (required)' },
                domain: { type: 'string' },
                industry: { type: 'string' },
                size: { type: 'string' },
                description: { type: 'string' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_company',
        description: 'Get a specific company by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Company ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_notes',
        description: 'List notes for a person',
        inputSchema: {
            type: 'object',
            properties: {
                person_id: { type: 'string', description: 'Person ID (required)' },
            },
            required: ['person_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_note',
        description: 'Create a note for a person',
        inputSchema: {
            type: 'object',
            properties: {
                person_id: { type: 'string', description: 'Person ID (required)' },
                content: { type: 'string', description: 'Note content (required)' },
            },
            required: ['person_id', 'content'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_pipelines',
        description: 'List pipelines in Folk CRM',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_pipeline_item',
        description: 'Add a person to a pipeline stage',
        inputSchema: {
            type: 'object',
            properties: {
                pipeline_id: { type: 'string', description: 'Pipeline ID (required)' },
                person_id: { type: 'string', description: 'Person ID (required)' },
                stage_id: { type: 'string', description: 'Stage ID (required)' },
            },
            required: ['pipeline_id', 'person_id', 'stage_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

async function folkFetch(path: string, apiKey: string, options: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${FOLK_BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Folk API ${res.status}: ${text}`);
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

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case 'list_people': {
            const q = buildQuery({ limit: args.limit ?? 25, cursor: args.cursor, query: args.query });
            const data = await folkFetch(`/people${q}`, apiKey) as any;
            return { people: data.data ?? data, next_cursor: data.next_cursor };
        }

        case 'create_person': {
            if (!args.name) throw new Error('name is required');
            const body: Record<string, unknown> = { name: args.name };
            if (args.email) body.email = args.email;
            if (args.phone) body.phone = args.phone;
            if (args.company) body.company = args.company;
            if (args.title) body.title = args.title;
            if (args.notes) body.notes = args.notes;
            return folkFetch('/people', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_person': {
            if (!args.id) throw new Error('id is required');
            return folkFetch(`/people/${args.id}`, apiKey);
        }

        case 'update_person': {
            if (!args.id) throw new Error('id is required');
            const { id, ...rest } = args;
            return folkFetch(`/people/${id}`, apiKey, {
                method: 'PATCH',
                body: JSON.stringify(rest),
            });
        }

        case 'delete_person': {
            if (!args.id) throw new Error('id is required');
            await folkFetch(`/people/${args.id}`, apiKey, { method: 'DELETE' });
            return { success: true, id: args.id };
        }

        case 'list_groups': {
            const q = buildQuery({ limit: args.limit ?? 25, cursor: args.cursor });
            const data = await folkFetch(`/groups${q}`, apiKey) as any;
            return { groups: data.data ?? data, next_cursor: data.next_cursor };
        }

        case 'create_group': {
            if (!args.name) throw new Error('name is required');
            const body: Record<string, unknown> = { name: args.name };
            if (args.description) body.description = args.description;
            return folkFetch('/groups', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'add_to_group': {
            if (!args.group_id) throw new Error('group_id is required');
            if (!args.people_ids) throw new Error('people_ids is required');
            const data = await folkFetch(`/groups/${args.group_id}/members`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ people_ids: args.people_ids }),
            }) as any;
            return { success: true, added_count: data.added_count ?? (args.people_ids as unknown[]).length };
        }

        case 'remove_from_group': {
            if (!args.group_id) throw new Error('group_id is required');
            if (!args.people_ids) throw new Error('people_ids is required');
            await folkFetch(`/groups/${args.group_id}/members`, apiKey, {
                method: 'DELETE',
                body: JSON.stringify({ people_ids: args.people_ids }),
            });
            return { success: true };
        }

        case 'list_companies': {
            const q = buildQuery({ limit: args.limit ?? 25, cursor: args.cursor, query: args.query });
            const data = await folkFetch(`/companies${q}`, apiKey) as any;
            return { companies: data.data ?? data, next_cursor: data.next_cursor };
        }

        case 'create_company': {
            if (!args.name) throw new Error('name is required');
            const body: Record<string, unknown> = { name: args.name };
            if (args.domain) body.domain = args.domain;
            if (args.industry) body.industry = args.industry;
            if (args.size) body.size = args.size;
            if (args.description) body.description = args.description;
            return folkFetch('/companies', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_company': {
            if (!args.id) throw new Error('id is required');
            return folkFetch(`/companies/${args.id}`, apiKey);
        }

        case 'list_notes': {
            if (!args.person_id) throw new Error('person_id is required');
            const data = await folkFetch(`/people/${args.person_id}/notes`, apiKey) as any;
            return { notes: data.data ?? data };
        }

        case 'create_note': {
            if (!args.person_id) throw new Error('person_id is required');
            if (!args.content) throw new Error('content is required');
            return folkFetch(`/people/${args.person_id}/notes`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ content: args.content }),
            });
        }

        case 'list_pipelines': {
            const data = await folkFetch('/pipelines', apiKey) as any;
            return { pipelines: data.data ?? data };
        }

        case 'add_pipeline_item': {
            if (!args.pipeline_id) throw new Error('pipeline_id is required');
            if (!args.person_id) throw new Error('person_id is required');
            if (!args.stage_id) throw new Error('stage_id is required');
            return folkFetch(`/pipelines/${args.pipeline_id}/items`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ person_id: args.person_id, stage_id: args.stage_id }),
            });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-folk', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-folk', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-FOLK-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: FOLK_API_KEY');
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
