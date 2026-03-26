/**
 * Render MCP Worker
 * Implements MCP protocol over HTTP for the Render REST API.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: RENDER_API_KEY -> header: X-Mcp-Secret-RENDER-API-KEY
 * Docs: https://api-docs.render.com/reference
 */

const RENDER_API = 'https://api.render.com/v1';

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
        description: 'Verify Render API connectivity by listing the first service. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_services',
        description: 'List all services on your Render account with optional type and status filters',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    description: 'Filter by service type',
                    enum: ['web_service', 'private_service', 'background_worker', 'static_site', 'cron_job'],
                },
                status: {
                    type: 'string',
                    description: 'Filter by service status',
                    enum: ['created', 'building', 'build_failed', 'deploying', 'deploy_failed', 'live', 'deactivated', 'suspended'],
                },
                limit: { type: 'number', description: 'Max results to return (default: 20, max: 100)' },
                cursor: { type: 'string', description: 'Pagination cursor from a previous response' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_service',
        description: 'Get full details of a specific Render service by ID',
        inputSchema: {
            type: 'object',
            properties: {
                serviceId: { type: 'string', description: 'Render service ID (e.g. srv-abc123)' },
            },
            required: ['serviceId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_deploys',
        description: 'List recent deploys for a Render service',
        inputSchema: {
            type: 'object',
            properties: {
                serviceId: { type: 'string', description: 'Render service ID' },
                limit: { type: 'number', description: 'Max results (default: 10, max: 100)' },
                cursor: { type: 'string', description: 'Pagination cursor' },
            },
            required: ['serviceId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'trigger_deploy',
        description: 'Trigger a new deploy for a Render service. Optionally deploy a specific commit.',
        inputSchema: {
            type: 'object',
            properties: {
                serviceId: { type: 'string', description: 'Render service ID' },
                clearCache: { type: 'string', description: 'Set to "clear" to clear build cache for this deploy', enum: ['clear', 'do_not_clear'] },
            },
            required: ['serviceId'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_deploy',
        description: 'Get details of a specific deploy by deploy ID',
        inputSchema: {
            type: 'object',
            properties: {
                serviceId: { type: 'string', description: 'Render service ID' },
                deployId: { type: 'string', description: 'Deploy ID (e.g. dep-abc123)' },
            },
            required: ['serviceId', 'deployId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_env_vars',
        description: 'List all environment variables for a Render service',
        inputSchema: {
            type: 'object',
            properties: {
                serviceId: { type: 'string', description: 'Render service ID' },
            },
            required: ['serviceId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'set_env_var',
        description: 'Create or update an environment variable on a Render service',
        inputSchema: {
            type: 'object',
            properties: {
                serviceId: { type: 'string', description: 'Render service ID' },
                key: { type: 'string', description: 'Environment variable name' },
                value: { type: 'string', description: 'Environment variable value' },
            },
            required: ['serviceId', 'key', 'value'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_env_var',
        description: 'Delete an environment variable from a Render service',
        inputSchema: {
            type: 'object',
            properties: {
                serviceId: { type: 'string', description: 'Render service ID' },
                key: { type: 'string', description: 'Environment variable name to delete' },
            },
            required: ['serviceId', 'key'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_custom_domains',
        description: 'List all custom domains attached to a Render service',
        inputSchema: {
            type: 'object',
            properties: {
                serviceId: { type: 'string', description: 'Render service ID' },
            },
            required: ['serviceId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_service_logs',
        description: 'Retrieve recent logs for a Render service (build or deploy logs via the deploy endpoint)',
        inputSchema: {
            type: 'object',
            properties: {
                serviceId: { type: 'string', description: 'Render service ID' },
                deployId: { type: 'string', description: 'Deploy ID to get logs for. If omitted, fetches logs for the most recent deploy.' },
            },
            required: ['serviceId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function renderFetch(path: string, apiKey: string, options: RequestInit = {}): Promise<unknown> {
    const url = `${RENDER_API}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(options.headers ?? {}),
        },
    });

    if (res.status === 204) return { success: true };

    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Render API ${res.status}: ${text}`);
    }

    try {
        return JSON.parse(text);
    } catch {
        return { response: text };
    }
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await renderFetch('/services?limit=1', apiKey) as any[];
            return {
                status: 'connected',
                serviceCount: data.length,
                message: data.length > 0
                    ? `Connected to Render. Found service: ${data[0].service?.name ?? 'unknown'}`
                    : 'Connected to Render. No services found.',
            };
        }

        case 'list_services': {
            const params = new URLSearchParams();
            if (args.type) params.set('type', args.type as string);
            if (args.status) params.set('status', args.status as string);
            params.set('limit', String(Math.min(Number(args.limit ?? 20), 100)));
            if (args.cursor) params.set('cursor', args.cursor as string);

            const data = await renderFetch(`/services?${params}`, apiKey) as any[];
            return data.map((item: any) => ({
                id: item.service.id,
                name: item.service.name,
                type: item.service.type,
                status: item.service.suspended === 'suspended' ? 'suspended' : item.service.serviceDetails?.buildCommand ? 'active' : 'active',
                repo: item.service.repo,
                branch: item.service.branch,
                region: item.service.region,
                url: item.service.serviceDetails?.url ?? null,
                createdAt: item.service.createdAt,
                updatedAt: item.service.updatedAt,
            }));
        }

        case 'get_service': {
            const data = await renderFetch(`/services/${args.serviceId}`, apiKey) as any;
            return {
                id: data.id,
                name: data.name,
                type: data.type,
                repo: data.repo,
                branch: data.branch,
                region: data.region,
                suspended: data.suspended,
                autoDeploy: data.autoDeploy,
                notifyOnFail: data.notifyOnFail,
                slug: data.slug,
                url: data.serviceDetails?.url ?? null,
                buildCommand: data.serviceDetails?.buildCommand ?? null,
                startCommand: data.serviceDetails?.startCommand ?? null,
                plan: data.serviceDetails?.plan ?? null,
                runtime: data.serviceDetails?.env ?? data.serviceDetails?.runtime ?? null,
                healthCheckPath: data.serviceDetails?.healthCheckPath ?? null,
                numInstances: data.serviceDetails?.numInstances ?? null,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
            };
        }

        case 'list_deploys': {
            const params = new URLSearchParams();
            params.set('limit', String(Math.min(Number(args.limit ?? 10), 100)));
            if (args.cursor) params.set('cursor', args.cursor as string);

            const data = await renderFetch(`/services/${args.serviceId}/deploys?${params}`, apiKey) as any[];
            return data.map((item: any) => ({
                id: item.deploy.id,
                status: item.deploy.status,
                trigger: item.deploy.trigger,
                commitId: item.deploy.commit?.id ?? null,
                commitMessage: item.deploy.commit?.message ?? null,
                createdAt: item.deploy.createdAt,
                updatedAt: item.deploy.updatedAt,
                finishedAt: item.deploy.finishedAt,
            }));
        }

        case 'trigger_deploy': {
            const body: Record<string, unknown> = {};
            if (args.clearCache === 'clear') body.clearCache = 'clear';

            const data = await renderFetch(`/services/${args.serviceId}/deploys`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;

            return {
                id: data.id,
                status: data.status,
                trigger: data.trigger,
                createdAt: data.createdAt,
                message: `Deploy triggered for service ${args.serviceId}`,
            };
        }

        case 'get_deploy': {
            const data = await renderFetch(`/services/${args.serviceId}/deploys/${args.deployId}`, apiKey) as any;
            return {
                id: data.id,
                status: data.status,
                trigger: data.trigger,
                commitId: data.commit?.id ?? null,
                commitMessage: data.commit?.message ?? null,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                finishedAt: data.finishedAt,
            };
        }

        case 'list_env_vars': {
            const data = await renderFetch(`/services/${args.serviceId}/env-vars`, apiKey) as any[];
            return data.map((item: any) => ({
                key: item.envVar.key,
                value: item.envVar.value,
            }));
        }

        case 'set_env_var': {
            const data = await renderFetch(`/services/${args.serviceId}/env-vars`, apiKey, {
                method: 'PUT',
                body: JSON.stringify([{ key: args.key, value: args.value }]),
            }) as any[];
            return {
                success: true,
                message: `Environment variable "${args.key}" set on service ${args.serviceId}`,
                vars: data.map((item: any) => ({
                    key: item.envVar.key,
                    value: item.envVar.value,
                })),
            };
        }

        case 'delete_env_var': {
            await renderFetch(`/services/${args.serviceId}/env-vars/${args.key}`, apiKey, {
                method: 'DELETE',
            });
            return {
                success: true,
                message: `Environment variable "${args.key}" deleted from service ${args.serviceId}`,
            };
        }

        case 'list_custom_domains': {
            const data = await renderFetch(`/services/${args.serviceId}/custom-domains`, apiKey) as any[];
            return data.map((item: any) => ({
                id: item.customDomain.id,
                name: item.customDomain.name,
                domainType: item.customDomain.domainType,
                verificationStatus: item.customDomain.verificationStatus,
                createdAt: item.customDomain.createdAt,
            }));
        }

        case 'get_service_logs': {
            let deployId = args.deployId as string | undefined;

            // If no deployId, fetch the most recent deploy
            if (!deployId) {
                const deploys = await renderFetch(`/services/${args.serviceId}/deploys?limit=1`, apiKey) as any[];
                if (!deploys.length) {
                    return { logs: [], message: 'No deploys found for this service' };
                }
                deployId = deploys[0].deploy.id;
            }

            // Fetch deploy logs
            const data = await renderFetch(`/services/${args.serviceId}/deploys/${deployId}/logs`, apiKey) as any[];

            if (!Array.isArray(data)) {
                return { deployId, logs: [], message: 'No logs available for this deploy' };
            }

            return {
                deployId,
                logCount: data.length,
                logs: data.map((entry: any) => ({
                    timestamp: entry.timestamp,
                    message: entry.message,
                })),
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-render', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-render', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const apiKey = request.headers.get('X-Mcp-Secret-RENDER-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing RENDER_API_KEY secret — add it to your workspace secrets');
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
