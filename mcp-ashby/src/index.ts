/**
 * Ashby ATS MCP Worker
 * Implements MCP protocol over HTTP for Ashby ATS operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   ASHBY_API_KEY → X-Mcp-Secret-ASHBY-API-KEY
 *
 * Auth: Basic auth with apiKey as username, empty password: btoa(apiKey + ':')
 * Note: Ashby uses POST for most endpoints with JSON body
 */

const ASHBY_BASE = 'https://api.ashbyhq.com';

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
        name: '_ping',
        description: 'Verify Ashby credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_job_postings',
        description: 'List job postings in Ashby',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default: 25)' },
                cursor: { type: 'string', description: 'Pagination cursor' },
                is_listed: { type: 'boolean', description: 'Filter to listed postings only' },
                application_portal_type: { type: 'string', enum: ['External', 'Internal'], description: 'Portal type filter' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_job_posting',
        description: 'Get a specific job posting by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Job posting ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_candidates',
        description: 'List candidates in Ashby',
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
        name: 'create_candidate',
        description: 'Create a new candidate in Ashby',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Candidate name (required)' },
                email: { type: 'string', description: 'Email address (required)' },
                phone: { type: 'string', description: 'Phone number' },
                linked_in_url: { type: 'string', description: 'LinkedIn profile URL' },
                github_url: { type: 'string', description: 'GitHub profile URL' },
                website: { type: 'string', description: 'Personal website URL' },
            },
            required: ['name', 'email'],
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
        name: 'search_candidates',
        description: 'Search candidates by email in Ashby',
        inputSchema: {
            type: 'object',
            properties: { email: { type: 'string', description: 'Email to search for (required)' } },
            required: ['email'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_applications',
        description: 'List applications in Ashby',
        inputSchema: {
            type: 'object',
            properties: {
                job_id: { type: 'string', description: 'Filter by job ID' },
                limit: { type: 'number', description: 'Max results (default: 25)' },
                cursor: { type: 'string', description: 'Pagination cursor' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_application',
        description: 'Get a specific application by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Application ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_application',
        description: 'Create a new application in Ashby',
        inputSchema: {
            type: 'object',
            properties: {
                job_posting_id: { type: 'string', description: 'Job posting ID (required)' },
                candidate_id: { type: 'string', description: 'Candidate ID (required)' },
                source_id: { type: 'string', description: 'Source ID' },
                credit_to_user_id: { type: 'string', description: 'User to credit for referral' },
            },
            required: ['job_posting_id', 'candidate_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'change_application_stage',
        description: 'Move an application to a different interview stage',
        inputSchema: {
            type: 'object',
            properties: {
                application_id: { type: 'string', description: 'Application ID (required)' },
                interview_stage_id: { type: 'string', description: 'Target interview stage ID (required)' },
            },
            required: ['application_id', 'interview_stage_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_interview_stages',
        description: 'List interview stages for a job',
        inputSchema: {
            type: 'object',
            properties: { job_id: { type: 'string', description: 'Job ID (required)' } },
            required: ['job_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_jobs',
        description: 'List jobs in Ashby',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default: 25)' },
                cursor: { type: 'string', description: 'Pagination cursor' },
                status: { type: 'string', enum: ['Open', 'Closed', 'Draft'], description: 'Filter by status' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_job',
        description: 'Get a specific job by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Job ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_departments',
        description: 'List departments in Ashby',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_sources',
        description: 'List candidate sources in Ashby',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_note',
        description: 'Add a note to a candidate',
        inputSchema: {
            type: 'object',
            properties: {
                candidate_id: { type: 'string', description: 'Candidate ID (required)' },
                note: { type: 'string', description: 'Note text (required)' },
                note_type: { type: 'string', enum: ['general', 'private'], description: 'Note type (default: general)' },
            },
            required: ['candidate_id', 'note'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_notes',
        description: 'List notes for a candidate',
        inputSchema: {
            type: 'object',
            properties: { candidate_id: { type: 'string', description: 'Candidate ID (required)' } },
            required: ['candidate_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_users',
        description: 'List users in Ashby',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

function ashbyAuth(apiKey: string): string {
    return 'Basic ' + btoa(`${apiKey}:`);
}

async function ashbyFetch(endpoint: string, apiKey: string, body: Record<string, unknown> = {}): Promise<unknown> {
    const res = await fetch(`${ASHBY_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
            Authorization: ashbyAuth(apiKey),
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ashby API ${res.status}: ${text}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            await ashbyFetch('/whoami', apiKey, {});
            return { content: [{ type: 'text', text: 'Connected to Ashby' }] };
        }

        case 'list_job_postings': {
            const body: Record<string, unknown> = { limit: args.limit ?? 25 };
            if (args.cursor) body.cursor = args.cursor;
            if (args.is_listed != null) body.isListed = args.is_listed;
            if (args.application_portal_type) body.applicationPortalType = args.application_portal_type;
            const data = await ashbyFetch('/jobPosting.list', apiKey, body) as any;
            return { results: data.results ?? [], nextCursor: data.nextCursor };
        }

        case 'get_job_posting': {
            if (!args.id) throw new Error('id is required');
            const data = await ashbyFetch('/jobPosting.info', apiKey, { jobPostingId: args.id }) as any;
            return data.results ?? data;
        }

        case 'list_candidates': {
            const body: Record<string, unknown> = { limit: args.limit ?? 25 };
            if (args.cursor) body.cursor = args.cursor;
            const data = await ashbyFetch('/candidate.list', apiKey, body) as any;
            return { results: data.results ?? [], nextCursor: data.nextCursor };
        }

        case 'create_candidate': {
            if (!args.name) throw new Error('name is required');
            if (!args.email) throw new Error('email is required');
            const body: Record<string, unknown> = { name: args.name, email: args.email };
            if (args.phone) body.phoneNumber = args.phone;
            if (args.linked_in_url) body.linkedInUrl = args.linked_in_url;
            if (args.github_url) body.githubUrl = args.github_url;
            if (args.website) body.website = args.website;
            const data = await ashbyFetch('/candidate.create', apiKey, body) as any;
            return data.results ?? data;
        }

        case 'get_candidate': {
            if (!args.id) throw new Error('id is required');
            const data = await ashbyFetch('/candidate.info', apiKey, { id: args.id }) as any;
            return data.results ?? data;
        }

        case 'search_candidates': {
            if (!args.email) throw new Error('email is required');
            const data = await ashbyFetch('/candidate.search', apiKey, { email: args.email }) as any;
            return { results: data.results ?? [] };
        }

        case 'list_applications': {
            const body: Record<string, unknown> = { limit: args.limit ?? 25 };
            if (args.cursor) body.cursor = args.cursor;
            if (args.job_id) body.jobId = args.job_id;
            const data = await ashbyFetch('/application.list', apiKey, body) as any;
            return { results: data.results ?? [], nextCursor: data.nextCursor };
        }

        case 'get_application': {
            if (!args.id) throw new Error('id is required');
            const data = await ashbyFetch('/application.info', apiKey, { id: args.id }) as any;
            return data.results ?? data;
        }

        case 'create_application': {
            if (!args.job_posting_id) throw new Error('job_posting_id is required');
            if (!args.candidate_id) throw new Error('candidate_id is required');
            const body: Record<string, unknown> = {
                jobPostingId: args.job_posting_id,
                candidateId: args.candidate_id,
            };
            if (args.source_id) body.sourceId = args.source_id;
            if (args.credit_to_user_id) body.creditToUserId = args.credit_to_user_id;
            const data = await ashbyFetch('/application.create', apiKey, body) as any;
            return data.results ?? data;
        }

        case 'change_application_stage': {
            if (!args.application_id) throw new Error('application_id is required');
            if (!args.interview_stage_id) throw new Error('interview_stage_id is required');
            const data = await ashbyFetch('/application.changeStage', apiKey, {
                applicationId: args.application_id,
                interviewStageId: args.interview_stage_id,
            }) as any;
            return data.results ?? data;
        }

        case 'list_interview_stages': {
            if (!args.job_id) throw new Error('job_id is required');
            const data = await ashbyFetch('/interviewStage.list', apiKey, { jobId: args.job_id }) as any;
            return { stages: data.results ?? [] };
        }

        case 'list_jobs': {
            const body: Record<string, unknown> = { limit: args.limit ?? 25 };
            if (args.cursor) body.cursor = args.cursor;
            if (args.status) body.status = args.status;
            const data = await ashbyFetch('/job.list', apiKey, body) as any;
            return { results: data.results ?? [], nextCursor: data.nextCursor };
        }

        case 'get_job': {
            if (!args.id) throw new Error('id is required');
            const data = await ashbyFetch('/job.info', apiKey, { id: args.id }) as any;
            return data.results ?? data;
        }

        case 'list_departments': {
            const data = await ashbyFetch('/department.list', apiKey, {}) as any;
            return { results: data.results ?? [] };
        }

        case 'list_sources': {
            const data = await ashbyFetch('/source.list', apiKey, {}) as any;
            return { results: data.results ?? [] };
        }

        case 'add_note': {
            if (!args.candidate_id) throw new Error('candidate_id is required');
            if (!args.note) throw new Error('note is required');
            const data = await ashbyFetch('/note.create', apiKey, {
                candidateId: args.candidate_id,
                note: args.note,
                noteType: args.note_type ?? 'general',
            }) as any;
            return data.results ?? data;
        }

        case 'list_notes': {
            if (!args.candidate_id) throw new Error('candidate_id is required');
            const data = await ashbyFetch('/note.list', apiKey, { candidateId: args.candidate_id }) as any;
            return { results: data.results ?? [] };
        }

        case 'list_users': {
            const data = await ashbyFetch('/user.list', apiKey, {}) as any;
            return { results: data.results ?? [] };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-ashby', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-ashby', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-ASHBY-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: ASHBY_API_KEY');
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
