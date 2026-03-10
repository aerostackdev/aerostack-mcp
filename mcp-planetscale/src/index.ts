/**
 * PlanetScale MCP Worker
 * Implements MCP protocol over HTTP for PlanetScale API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: PLANETSCALE_TOKEN -> header: X-Mcp-Secret-PLANETSCALE-TOKEN
 * Token format: {service_token_id}:{service_token}
 */

const PS_API = 'https://api.planetscale.com/v1';

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
        name: 'list_databases',
        description: 'List all databases in a PlanetScale organization',
        inputSchema: {
            type: 'object',
            properties: {
                org: { type: 'string', description: 'PlanetScale organization name' },
            },
            required: ['org'],
        },
    },
    {
        name: 'get_database',
        description: 'Get details of a specific PlanetScale database',
        inputSchema: {
            type: 'object',
            properties: {
                org: { type: 'string', description: 'PlanetScale organization name' },
                database: { type: 'string', description: 'Database name' },
            },
            required: ['org', 'database'],
        },
    },
    {
        name: 'list_branches',
        description: 'List branches of a PlanetScale database',
        inputSchema: {
            type: 'object',
            properties: {
                org: { type: 'string', description: 'PlanetScale organization name' },
                database: { type: 'string', description: 'Database name' },
            },
            required: ['org', 'database'],
        },
    },
    {
        name: 'get_branch',
        description: 'Get details of a specific database branch',
        inputSchema: {
            type: 'object',
            properties: {
                org: { type: 'string', description: 'PlanetScale organization name' },
                database: { type: 'string', description: 'Database name' },
                branch: { type: 'string', description: 'Branch name' },
            },
            required: ['org', 'database', 'branch'],
        },
    },
    {
        name: 'create_branch',
        description: 'Create a new branch from a parent branch in a PlanetScale database',
        inputSchema: {
            type: 'object',
            properties: {
                org: { type: 'string', description: 'PlanetScale organization name' },
                database: { type: 'string', description: 'Database name' },
                name: { type: 'string', description: 'New branch name' },
                parent_branch: { type: 'string', description: 'Parent branch to fork from (default: main)' },
            },
            required: ['org', 'database', 'name'],
        },
    },
    {
        name: 'list_deploy_requests',
        description: 'List deploy requests for a PlanetScale database',
        inputSchema: {
            type: 'object',
            properties: {
                org: { type: 'string', description: 'PlanetScale organization name' },
                database: { type: 'string', description: 'Database name' },
            },
            required: ['org', 'database'],
        },
    },
    {
        name: 'create_deploy_request',
        description: 'Create a deploy request to merge schema changes from one branch into another',
        inputSchema: {
            type: 'object',
            properties: {
                org: { type: 'string', description: 'PlanetScale organization name' },
                database: { type: 'string', description: 'Database name' },
                branch: { type: 'string', description: 'Source branch with schema changes' },
                into_branch: { type: 'string', description: 'Target branch to deploy into (default: main)' },
            },
            required: ['org', 'database', 'branch'],
        },
    },
];

async function ps(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${PS_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Aerostack-MCP/1.0',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`PlanetScale API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    const org = args.org as string;
    const database = args.database as string;

    switch (name) {
        case 'list_databases': {
            const data = (await ps(`/organizations/${org}/databases`, token)) as any;
            return (data.data ?? []).map((db: any) => ({
                name: db.name,
                region: db.region?.slug,
                plan: db.plan,
                state: db.state,
                created_at: db.created_at,
                updated_at: db.updated_at,
                url: db.html_url,
            }));
        }

        case 'get_database': {
            const db = (await ps(`/organizations/${org}/databases/${database}`, token)) as any;
            return {
                name: db.name,
                region: db.region?.slug,
                plan: db.plan,
                state: db.state,
                default_branch: db.default_branch,
                branches_count: db.branches_count,
                production_branches_count: db.production_branches_count,
                data_size: db.data_size,
                created_at: db.created_at,
                updated_at: db.updated_at,
                url: db.html_url,
            };
        }

        case 'list_branches': {
            const data = (await ps(`/organizations/${org}/databases/${database}/branches`, token)) as any;
            return (data.data ?? []).map((b: any) => ({
                name: b.name,
                production: b.production,
                ready: b.ready,
                parent_branch: b.parent_branch,
                created_at: b.created_at,
                updated_at: b.updated_at,
            }));
        }

        case 'get_branch': {
            const branch = args.branch as string;
            const b = (await ps(
                `/organizations/${org}/databases/${database}/branches/${branch}`,
                token
            )) as any;
            return {
                name: b.name,
                production: b.production,
                ready: b.ready,
                parent_branch: b.parent_branch,
                schema_last_updated_at: b.schema_last_updated_at,
                mysql_address: b.mysql_address,
                mysql_edge_address: b.mysql_edge_address,
                created_at: b.created_at,
                updated_at: b.updated_at,
            };
        }

        case 'create_branch': {
            const b = (await ps(`/organizations/${org}/databases/${database}/branches`, token, {
                method: 'POST',
                body: JSON.stringify({
                    name: args.name,
                    parent_branch: args.parent_branch ?? 'main',
                }),
            })) as any;
            return {
                name: b.name,
                parent_branch: b.parent_branch,
                production: b.production,
                ready: b.ready,
                created_at: b.created_at,
            };
        }

        case 'list_deploy_requests': {
            const data = (await ps(
                `/organizations/${org}/databases/${database}/deploy-requests`,
                token
            )) as any;
            return (data.data ?? []).map((dr: any) => ({
                number: dr.number,
                branch: dr.branch,
                into_branch: dr.into_branch,
                state: dr.state,
                deployment_state: dr.deployment_state,
                approved: dr.approved,
                created_at: dr.created_at,
                updated_at: dr.updated_at,
            }));
        }

        case 'create_deploy_request': {
            const dr = (await ps(
                `/organizations/${org}/databases/${database}/deploy-requests`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        branch: args.branch,
                        into_branch: args.into_branch ?? 'main',
                    }),
                }
            )) as any;
            return {
                number: dr.number,
                branch: dr.branch,
                into_branch: dr.into_branch,
                state: dr.state,
                deployment_state: dr.deployment_state,
                created_at: dr.created_at,
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'planetscale-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'planetscale-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            // Read token from injected secret header (underscore key -> hyphen header)
            const token = request.headers.get('X-Mcp-Secret-PLANETSCALE-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing PLANETSCALE_TOKEN secret — add it to your workspace secrets');
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
