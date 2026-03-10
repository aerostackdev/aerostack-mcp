/**
 * Vercel MCP Worker
 * Implements MCP protocol over HTTP for Vercel API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: VERCEL_TOKEN -> header: X-Mcp-Secret-VERCEL-TOKEN
 */

const VERCEL_API = 'https://api.vercel.com';

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
        name: 'list_projects',
        description: 'List all Vercel projects for the authenticated user or team',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max projects to return (default 20, max 100)' },
            },
        },
    },
    {
        name: 'get_project',
        description: 'Get details of a specific Vercel project',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project ID or name' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'list_deployments',
        description: 'List deployments for a Vercel project',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project ID or name' },
                limit: { type: 'number', description: 'Max deployments to return (default 20, max 100)' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'get_deployment',
        description: 'Get details of a specific deployment',
        inputSchema: {
            type: 'object',
            properties: {
                deploymentId: { type: 'string', description: 'Deployment ID or URL' },
            },
            required: ['deploymentId'],
        },
    },
    {
        name: 'list_domains',
        description: 'List all domains configured for a Vercel project',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project ID or name' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'add_domain',
        description: 'Add a custom domain to a Vercel project',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project ID or name' },
                domain: { type: 'string', description: 'Domain name to add (e.g. example.com)' },
            },
            required: ['projectId', 'domain'],
        },
    },
    {
        name: 'list_env_vars',
        description: 'List environment variables for a Vercel project',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project ID or name' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'create_env_var',
        description: 'Create an environment variable for a Vercel project',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project ID or name' },
                key: { type: 'string', description: 'Environment variable name' },
                value: { type: 'string', description: 'Environment variable value' },
                target: {
                    type: 'array',
                    items: { type: 'string', enum: ['production', 'preview', 'development'] },
                    description: 'Deployment targets (default: all three)',
                },
                type: {
                    type: 'string',
                    enum: ['encrypted', 'plain', 'secret', 'sensitive'],
                    description: 'Variable type (default: encrypted)',
                },
            },
            required: ['projectId', 'key', 'value'],
        },
    },
];

async function vc(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${VERCEL_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Aerostack-MCP/1.0',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Vercel API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'list_projects': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const data = await vc(`/v9/projects?limit=${limit}`, token) as any;
            return (data.projects ?? []).map((p: any) => ({
                id: p.id,
                name: p.name,
                framework: p.framework ?? null,
                url: p.alias?.[0] ? `https://${p.alias[0]}` : null,
                created_at: p.createdAt,
                updated_at: p.updatedAt,
            }));
        }

        case 'get_project': {
            const project = await vc(`/v9/projects/${encodeURIComponent(args.projectId as string)}`, token) as any;
            return {
                id: project.id,
                name: project.name,
                framework: project.framework ?? null,
                node_version: project.nodeVersion ?? null,
                build_command: project.buildCommand ?? null,
                output_directory: project.outputDirectory ?? null,
                root_directory: project.rootDirectory ?? null,
                repo: project.link?.type
                    ? { type: project.link.type, repo: project.link.repo ?? null }
                    : null,
                domains: project.alias ?? [],
                created_at: project.createdAt,
                updated_at: project.updatedAt,
            };
        }

        case 'list_deployments': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const data = await vc(`/v6/deployments?projectId=${encodeURIComponent(args.projectId as string)}&limit=${limit}`, token) as any;
            return (data.deployments ?? []).map((d: any) => ({
                id: d.uid,
                url: d.url ? `https://${d.url}` : null,
                state: d.state ?? d.readyState ?? null,
                target: d.target ?? null,
                created_at: d.createdAt ?? d.created,
                meta: d.meta?.githubCommitMessage ?? d.meta?.gitlabCommitMessage ?? null,
            }));
        }

        case 'get_deployment': {
            const deployment = await vc(`/v13/deployments/${encodeURIComponent(args.deploymentId as string)}`, token) as any;
            return {
                id: deployment.id,
                name: deployment.name,
                url: deployment.url ? `https://${deployment.url}` : null,
                state: deployment.readyState ?? deployment.state ?? null,
                target: deployment.target ?? null,
                source: deployment.source ?? null,
                regions: deployment.regions ?? [],
                created_at: deployment.createdAt,
                ready_at: deployment.ready ?? null,
                build_error: deployment.errorMessage ?? null,
                meta: {
                    commit_message: deployment.meta?.githubCommitMessage ?? deployment.meta?.gitlabCommitMessage ?? null,
                    commit_sha: deployment.meta?.githubCommitSha ?? deployment.meta?.gitlabCommitSha ?? null,
                    branch: deployment.meta?.githubCommitRef ?? deployment.meta?.gitlabCommitRef ?? null,
                },
            };
        }

        case 'list_domains': {
            const data = await vc(`/v9/projects/${encodeURIComponent(args.projectId as string)}/domains`, token) as any;
            return (data.domains ?? []).map((d: any) => ({
                name: d.name,
                redirect: d.redirect ?? null,
                redirect_status_code: d.redirectStatusCode ?? null,
                configured: d.verified ?? false,
                created_at: d.createdAt,
            }));
        }

        case 'add_domain': {
            const domain = await vc(
                `/v10/projects/${encodeURIComponent(args.projectId as string)}/domains`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({ name: args.domain }),
                },
            ) as any;
            return {
                name: domain.name,
                configured: domain.verified ?? false,
                created_at: domain.createdAt,
            };
        }

        case 'list_env_vars': {
            const data = await vc(`/v9/projects/${encodeURIComponent(args.projectId as string)}/env`, token) as any;
            return (data.envs ?? []).map((e: any) => ({
                id: e.id,
                key: e.key,
                target: e.target ?? [],
                type: e.type ?? null,
                created_at: e.createdAt,
                updated_at: e.updatedAt,
            }));
        }

        case 'create_env_var': {
            const target = (args.target as string[]) ?? ['production', 'preview', 'development'];
            const type = (args.type as string) ?? 'encrypted';
            const envVar = await vc(
                `/v10/projects/${encodeURIComponent(args.projectId as string)}/env`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        key: args.key,
                        value: args.value,
                        target,
                        type,
                    }),
                },
            ) as any;
            return {
                id: envVar.id ?? envVar.created?.id,
                key: envVar.key ?? args.key,
                target: envVar.target ?? target,
                type: envVar.type ?? type,
                created_at: envVar.createdAt,
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'vercel-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'vercel-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            // Read token from injected secret header (underscore key -> hyphen header)
            const token = request.headers.get('X-Mcp-Secret-VERCEL-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing VERCEL_TOKEN secret \u2014 add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
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
