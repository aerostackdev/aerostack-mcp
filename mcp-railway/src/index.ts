/**
 * Railway MCP Worker
 * Implements MCP protocol over HTTP for Railway API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: RAILWAY_API_TOKEN -> header: X-Mcp-Secret-RAILWAY-API-TOKEN
 */

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2';

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
        description: 'Verify Railway credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_projects',
        description: 'List all Railway projects for the authenticated user',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_project',
        description: 'Get details of a Railway project including environments and services',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Project ID' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_services',
        description: 'List services in a Railway project',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project ID' },
            },
            required: ['projectId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_deployments',
        description: 'List recent deployments for a Railway service (last 10)',
        inputSchema: {
            type: 'object',
            properties: {
                serviceId: { type: 'string', description: 'Service ID' },
            },
            required: ['serviceId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_deployment_logs',
        description: 'Get logs for a specific Railway deployment',
        inputSchema: {
            type: 'object',
            properties: {
                deploymentId: { type: 'string', description: 'Deployment ID' },
            },
            required: ['deploymentId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_variables',
        description: 'List environment variables for a service in a specific environment',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project ID' },
                environmentId: { type: 'string', description: 'Environment ID' },
                serviceId: { type: 'string', description: 'Service ID' },
            },
            required: ['projectId', 'environmentId', 'serviceId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'redeploy_service',
        description: 'Trigger a redeploy of a Railway service in a specific environment',
        inputSchema: {
            type: 'object',
            properties: {
                serviceId: { type: 'string', description: 'Service ID' },
                environmentId: { type: 'string', description: 'Environment ID' },
            },
            required: ['serviceId', 'environmentId'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

async function gql(query: string, variables: Record<string, unknown>, token: string) {
    const res = await fetch(RAILWAY_API, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Railway API ${res.status}: ${await res.text()}`);
    const json = await res.json() as any;
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.data;
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await gql('query { me { id name } }', {}, token);
            return { content: [{ type: 'text', text: 'Connected to Railway' }] };
        }

        case 'list_projects': {
            const data = await gql(
                `query { me { projects { edges { node { id name description createdAt updatedAt } } } } }`,
                {},
                token
            );
            return (data.me.projects.edges ?? []).map((e: any) => ({
                id: e.node.id,
                name: e.node.name,
                description: e.node.description,
                createdAt: e.node.createdAt,
                updatedAt: e.node.updatedAt,
            }));
        }

        case 'get_project': {
            const data = await gql(
                `query($id: String!) { project(id: $id) { id name description createdAt environments { edges { node { id name } } } services { edges { node { id name } } } } }`,
                { id: args.id },
                token
            );
            const p = data.project;
            return {
                id: p.id,
                name: p.name,
                description: p.description,
                createdAt: p.createdAt,
                environments: (p.environments.edges ?? []).map((e: any) => ({
                    id: e.node.id,
                    name: e.node.name,
                })),
                services: (p.services.edges ?? []).map((e: any) => ({
                    id: e.node.id,
                    name: e.node.name,
                })),
            };
        }

        case 'list_services': {
            const data = await gql(
                `query($projectId: String!) { project(id: $projectId) { services { edges { node { id name createdAt updatedAt } } } } }`,
                { projectId: args.projectId },
                token
            );
            return (data.project.services.edges ?? []).map((e: any) => ({
                id: e.node.id,
                name: e.node.name,
                createdAt: e.node.createdAt,
                updatedAt: e.node.updatedAt,
            }));
        }

        case 'list_deployments': {
            const data = await gql(
                `query($serviceId: String!) { deployments(first: 10, input: { serviceId: $serviceId }) { edges { node { id status createdAt } } } }`,
                { serviceId: args.serviceId },
                token
            );
            return (data.deployments.edges ?? []).map((e: any) => ({
                id: e.node.id,
                status: e.node.status,
                createdAt: e.node.createdAt,
            }));
        }

        case 'get_deployment_logs': {
            const data = await gql(
                `query($deploymentId: String!) { deploymentLogs(deploymentId: $deploymentId, limit: 100) { message timestamp severity } }`,
                { deploymentId: args.deploymentId },
                token
            );
            return (data.deploymentLogs ?? []).map((log: any) => ({
                message: log.message,
                timestamp: log.timestamp,
                severity: log.severity,
            }));
        }

        case 'list_variables': {
            const data = await gql(
                `query($projectId: String!, $environmentId: String!, $serviceId: String!) { variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }`,
                {
                    projectId: args.projectId,
                    environmentId: args.environmentId,
                    serviceId: args.serviceId,
                },
                token
            );
            // Railway returns variables as a JSON object of key-value pairs
            const vars = data.variables ?? {};
            return Object.entries(vars).map(([key, value]) => ({ key, value }));
        }

        case 'redeploy_service': {
            await gql(
                `mutation($serviceId: String!, $environmentId: String!) { serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId) }`,
                {
                    serviceId: args.serviceId,
                    environmentId: args.environmentId,
                },
                token
            );
            return { success: true, message: 'Redeploy triggered successfully' };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'railway-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'railway-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            // Read token from injected secret header (underscore key -> hyphen header)
            const token = request.headers.get('X-Mcp-Secret-RAILWAY-API-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing RAILWAY_API_TOKEN secret — add it to your workspace secrets');
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
