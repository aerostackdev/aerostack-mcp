/**
 * CircleCI MCP Worker
 * Implements MCP protocol over HTTP for CircleCI API v2 operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: CIRCLECI_TOKEN -> header: X-Mcp-Secret-CIRCLECI-TOKEN
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-circleci
 */

const CIRCLECI_API = 'https://circleci.com/api/v2';

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

function text(value: string) {
    return { content: [{ type: 'text', text: value }] };
}

function json(value: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify CircleCI token by fetching the current user. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'list_pipelines',
        description: 'List recent pipelines for a project (org-name/repo-name on a VCS)',
        inputSchema: {
            type: 'object',
            properties: {
                project_slug: { type: 'string', description: 'Project slug: gh/org-name/repo-name or bb/org-name/repo-name' },
                branch: { type: 'string', description: 'Filter by branch name (optional)' },
                page_token: { type: 'string', description: 'Pagination token from a previous response (optional)' },
            },
            required: ['project_slug'],
        },
    },
    {
        name: 'get_pipeline',
        description: 'Get details of a single pipeline by its ID',
        inputSchema: {
            type: 'object',
            properties: {
                pipeline_id: { type: 'string', description: 'Pipeline UUID' },
            },
            required: ['pipeline_id'],
        },
    },
    {
        name: 'list_workflows',
        description: 'List workflows for a given pipeline',
        inputSchema: {
            type: 'object',
            properties: {
                pipeline_id: { type: 'string', description: 'Pipeline UUID' },
                page_token: { type: 'string', description: 'Pagination token (optional)' },
            },
            required: ['pipeline_id'],
        },
    },
    {
        name: 'get_workflow',
        description: 'Get details of a single workflow by its ID',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'string', description: 'Workflow UUID' },
            },
            required: ['workflow_id'],
        },
    },
    {
        name: 'list_jobs',
        description: 'List jobs for a given workflow',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'string', description: 'Workflow UUID' },
                page_token: { type: 'string', description: 'Pagination token (optional)' },
            },
            required: ['workflow_id'],
        },
    },
    {
        name: 'get_job',
        description: 'Get details of a single job by its job number within a project',
        inputSchema: {
            type: 'object',
            properties: {
                project_slug: { type: 'string', description: 'Project slug: gh/org-name/repo-name' },
                job_number: { type: 'number', description: 'Job number' },
            },
            required: ['project_slug', 'job_number'],
        },
    },
    {
        name: 'get_job_artifacts',
        description: 'List artifacts produced by a job',
        inputSchema: {
            type: 'object',
            properties: {
                project_slug: { type: 'string', description: 'Project slug: gh/org-name/repo-name' },
                job_number: { type: 'number', description: 'Job number' },
            },
            required: ['project_slug', 'job_number'],
        },
    },
    {
        name: 'trigger_pipeline',
        description: 'Trigger a new pipeline for a project, optionally on a specific branch with parameters',
        inputSchema: {
            type: 'object',
            properties: {
                project_slug: { type: 'string', description: 'Project slug: gh/org-name/repo-name' },
                branch: { type: 'string', description: 'Branch to run the pipeline on (optional, defaults to default branch)' },
                tag: { type: 'string', description: 'Tag to run the pipeline on (optional)' },
                parameters: { type: 'object', description: 'Pipeline parameters as key-value pairs (optional)' },
            },
            required: ['project_slug'],
        },
    },
    {
        name: 'cancel_workflow',
        description: 'Cancel a running workflow',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'string', description: 'Workflow UUID to cancel' },
            },
            required: ['workflow_id'],
        },
    },
];

async function circleci(
    path: string,
    token: string,
    method: 'GET' | 'POST' = 'GET',
    body?: Record<string, unknown>,
): Promise<any> {
    const opts: RequestInit = {
        method,
        headers: {
            'Circle-Token': token,
            'Content-Type': 'application/json',
        },
    };
    if (body && method === 'POST') {
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${CIRCLECI_API}${path}`, opts);
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`CircleCI HTTP ${res.status}: ${errText}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await circleci('/me', token);
            return text(`Connected to CircleCI as "${data.name}" (${data.login})`);
        }

        case 'list_pipelines': {
            const slug = args.project_slug as string;
            const qs = new URLSearchParams();
            if (args.branch) qs.set('branch', args.branch as string);
            if (args.page_token) qs.set('page-token', args.page_token as string);
            const query = qs.toString();
            const data = await circleci(`/project/${slug}/pipeline${query ? '?' + query : ''}`, token);
            const pipelines = data.items?.map((p: any) => ({
                id: p.id,
                number: p.number,
                state: p.state,
                branch: p.vcs?.branch ?? null,
                tag: p.vcs?.tag ?? null,
                commit_subject: p.vcs?.commit?.subject ?? null,
                created_at: p.created_at,
            })) ?? [];
            return json({ pipelines, next_page_token: data.next_page_token ?? null });
        }

        case 'get_pipeline': {
            const data = await circleci(`/pipeline/${args.pipeline_id}`, token);
            return json({
                id: data.id,
                number: data.number,
                state: data.state,
                project_slug: data.project_slug,
                branch: data.vcs?.branch ?? null,
                tag: data.vcs?.tag ?? null,
                commit_subject: data.vcs?.commit?.subject ?? null,
                commit_body: data.vcs?.commit?.body ?? null,
                revision: data.vcs?.revision ?? null,
                created_at: data.created_at,
                trigger: data.trigger,
            });
        }

        case 'list_workflows': {
            const qs = new URLSearchParams();
            if (args.page_token) qs.set('page-token', args.page_token as string);
            const query = qs.toString();
            const data = await circleci(`/pipeline/${args.pipeline_id}/workflow${query ? '?' + query : ''}`, token);
            const workflows = data.items?.map((w: any) => ({
                id: w.id,
                name: w.name,
                status: w.status,
                created_at: w.created_at,
                stopped_at: w.stopped_at,
            })) ?? [];
            return json({ workflows, next_page_token: data.next_page_token ?? null });
        }

        case 'get_workflow': {
            const data = await circleci(`/workflow/${args.workflow_id}`, token);
            return json({
                id: data.id,
                name: data.name,
                status: data.status,
                pipeline_id: data.pipeline_id,
                pipeline_number: data.pipeline_number,
                project_slug: data.project_slug,
                created_at: data.created_at,
                stopped_at: data.stopped_at,
            });
        }

        case 'list_jobs': {
            const qs = new URLSearchParams();
            if (args.page_token) qs.set('page-token', args.page_token as string);
            const query = qs.toString();
            const data = await circleci(`/workflow/${args.workflow_id}/job${query ? '?' + query : ''}`, token);
            const jobs = data.items?.map((j: any) => ({
                id: j.id,
                name: j.name,
                type: j.type,
                status: j.status,
                job_number: j.job_number,
                started_at: j.started_at,
                stopped_at: j.stopped_at,
            })) ?? [];
            return json({ jobs, next_page_token: data.next_page_token ?? null });
        }

        case 'get_job': {
            const data = await circleci(`/project/${args.project_slug}/job/${args.job_number}`, token);
            return json({
                name: data.name,
                status: data.status,
                job_number: data.job_number,
                web_url: data.web_url,
                started_at: data.started_at,
                stopped_at: data.stopped_at,
                duration: data.duration,
                executor: data.executor,
                parallelism: data.parallelism,
                contexts: data.contexts,
            });
        }

        case 'get_job_artifacts': {
            const data = await circleci(`/project/${args.project_slug}/${args.job_number}/artifacts`, token);
            const artifacts = data.items?.map((a: any) => ({
                path: a.path,
                url: a.url,
                node_index: a.node_index,
            })) ?? [];
            return json({ artifacts });
        }

        case 'trigger_pipeline': {
            const body: Record<string, unknown> = {};
            if (args.branch) body.branch = args.branch;
            if (args.tag) body.tag = args.tag;
            if (args.parameters) body.parameters = args.parameters;
            const data = await circleci(`/project/${args.project_slug}/pipeline`, token, 'POST', body);
            return json({
                id: data.id,
                number: data.number,
                state: data.state,
                created_at: data.created_at,
            });
        }

        case 'cancel_workflow': {
            await circleci(`/workflow/${args.workflow_id}/cancel`, token, 'POST');
            return text(`Workflow ${args.workflow_id} has been cancelled.`);
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'circleci-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
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
                serverInfo: { name: 'circleci-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-CIRCLECI-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing CIRCLECI_TOKEN secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
                return rpcOk(id, result);
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
