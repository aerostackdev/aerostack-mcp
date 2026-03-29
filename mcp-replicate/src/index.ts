/**
 * Replicate MCP Worker
 * Implements MCP protocol over HTTP for Replicate AI model inference operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   REPLICATE_API_TOKEN → X-Mcp-Secret-REPLICATE-API-TOKEN
 *
 * Auth: Authorization: Token {API_TOKEN} on every request
 * Docs: https://replicate.com/docs/reference/http
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const REPLICATE_API_BASE = 'https://api.replicate.com/v1';

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpcOk(id: number | string, result: unknown): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: number | string | null, code: number, message: string): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function toolOk(data: unknown): { content: { type: string; text: string }[] } {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

function getApiToken(request: Request): string | null {
    return request.headers.get('X-Mcp-Secret-REPLICATE-API-TOKEN');
}

async function replicateGet(path: string, apiToken: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${REPLICATE_API_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
        headers: {
            'Authorization': `Token ${apiToken}`,
            'Accept': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Replicate API ${res.status}: ${text}`);
    }
    return res.json();
}

async function replicatePost(path: string, apiToken: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${REPLICATE_API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Authorization': `Token ${apiToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Replicate API ${res.status}: ${text}`);
    }
    return res.json();
}

async function replicateDelete(path: string, apiToken: string): Promise<void> {
    const res = await fetch(`${REPLICATE_API_BASE}${path}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Token ${apiToken}` },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Replicate API ${res.status}: ${text}`);
    }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'run_model',
        description: 'Run a Replicate model with a specific version and inputs. Returns prediction output or a prediction ID for async polling',
        inputSchema: {
            type: 'object',
            properties: {
                model: {
                    type: 'string',
                    description: 'Model identifier in format "owner/model-name" (e.g. "stability-ai/stable-diffusion")',
                },
                version: {
                    type: 'string',
                    description: 'Specific model version SHA256 hash. Omit to use the latest deployed version',
                },
                input: {
                    type: 'object',
                    description: 'Input parameters for the model (schema varies by model)',
                },
                webhook: {
                    type: 'string',
                    description: 'URL to receive a POST request when the prediction completes',
                },
                webhook_events_filter: {
                    type: 'array',
                    items: { type: 'string', enum: ['start', 'output', 'logs', 'completed'] },
                    description: 'Events to send to the webhook URL',
                },
            },
            required: ['model', 'input'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_prediction',
        description: 'Get the current status and output of a prediction by its ID',
        inputSchema: {
            type: 'object',
            properties: {
                prediction_id: { type: 'string', description: 'The prediction ID returned by run_model or create_prediction' },
            },
            required: ['prediction_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'cancel_prediction',
        description: 'Cancel a prediction that is currently queued or in progress',
        inputSchema: {
            type: 'object',
            properties: {
                prediction_id: { type: 'string', description: 'The prediction ID to cancel' },
            },
            required: ['prediction_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_predictions',
        description: 'List your recent predictions with status, model, and output URLs',
        inputSchema: {
            type: 'object',
            properties: {
                cursor: {
                    type: 'string',
                    description: 'Pagination cursor from a previous response next field',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_model',
        description: 'Get details about a Replicate model: description, visibility, run count, and latest version',
        inputSchema: {
            type: 'object',
            properties: {
                model_owner: { type: 'string', description: 'The username or organization that owns the model (e.g. "stability-ai")' },
                model_name: { type: 'string', description: 'The name of the model (e.g. "stable-diffusion")' },
            },
            required: ['model_owner', 'model_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_model_versions',
        description: 'List all available versions of a Replicate model with their creation dates and OpenAPI schemas',
        inputSchema: {
            type: 'object',
            properties: {
                model_owner: { type: 'string', description: 'The username or organization that owns the model' },
                model_name: { type: 'string', description: 'The name of the model' },
            },
            required: ['model_owner', 'model_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_model_version',
        description: 'Get the OpenAPI input/output schema for a specific model version',
        inputSchema: {
            type: 'object',
            properties: {
                model_owner: { type: 'string', description: 'The username or organization that owns the model' },
                model_name: { type: 'string', description: 'The name of the model' },
                version_id: { type: 'string', description: 'The version SHA256 hash' },
            },
            required: ['model_owner', 'model_name', 'version_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_models',
        description: 'Search Replicate public models by keyword, returning name, description, run count, and latest version',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query (e.g. "stable diffusion", "image upscaling", "speech to text")' },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_deployments',
        description: 'List your Replicate deployments (dedicated hosted model instances)',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_deployment_prediction',
        description: 'Run a prediction on a specific named deployment (useful for consistent latency with dedicated compute)',
        inputSchema: {
            type: 'object',
            properties: {
                deployment_owner: { type: 'string', description: 'The owner of the deployment' },
                deployment_name: { type: 'string', description: 'The name of the deployment' },
                input: { type: 'object', description: 'Input parameters for the model' },
                webhook: {
                    type: 'string',
                    description: 'URL to receive a POST request when the prediction completes',
                },
            },
            required: ['deployment_owner', 'deployment_name', 'input'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_account',
        description: 'Get your Replicate account information: username, name, and account type',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_model',
        description: 'Create a new model on Replicate with a specified owner, name, visibility, and hardware',
        inputSchema: {
            type: 'object',
            properties: {
                owner: { type: 'string', description: 'Your Replicate username or organization name' },
                name: { type: 'string', description: 'Name for the new model (lowercase letters, numbers, hyphens only)' },
                description: { type: 'string', description: 'Short description of what the model does' },
                visibility: {
                    type: 'string',
                    description: 'Model visibility',
                    enum: ['public', 'private'],
                },
                hardware: {
                    type: 'string',
                    description: 'Default hardware to run the model on',
                    enum: ['cpu', 'gpu-a40-small', 'gpu-a40-large', 'gpu-a100-40gb', 'gpu-a100-80gb'],
                },
                github_url: { type: 'string', description: 'URL to the GitHub repository containing the model source' },
                paper_url: { type: 'string', description: 'URL to the paper describing the model' },
                license_url: { type: 'string', description: 'URL to the model license' },
                cover_image_url: { type: 'string', description: 'URL to a cover image for the model' },
            },
            required: ['owner', 'name', 'visibility', 'hardware'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiToken: string,
): Promise<unknown> {
    switch (name) {
        case 'run_model': {
            validateRequired(args, ['model', 'input']);

            const [modelOwner, modelName] = String(args.model).split('/');
            if (!modelOwner || !modelName) {
                throw new Error('model must be in "owner/model-name" format');
            }

            const requestBody: Record<string, unknown> = {
                input: args.input,
            };
            if (args.version) requestBody.version = args.version;
            if (args.webhook) requestBody.webhook = args.webhook;
            if (args.webhook_events_filter) requestBody.webhook_events_filter = args.webhook_events_filter;

            const path = args.version
                ? '/predictions'
                : `/models/${modelOwner}/${modelName}/predictions`;

            if (args.version) {
                requestBody.version = args.version;
            }

            const data = await replicatePost(path, apiToken, requestBody) as any;
            return {
                prediction_id: data.id,
                status: data.status,
                model: data.model ?? args.model,
                version: data.version ?? null,
                urls: data.urls ?? {},
                output: data.output ?? null,
                error: data.error ?? null,
                created_at: data.created_at,
            };
        }

        case 'get_prediction': {
            validateRequired(args, ['prediction_id']);
            const data = await replicateGet(`/predictions/${args.prediction_id}`, apiToken) as any;
            return {
                prediction_id: data.id,
                status: data.status,
                model: data.model ?? null,
                version: data.version ?? null,
                input: data.input ?? {},
                output: data.output ?? null,
                error: data.error ?? null,
                logs: data.logs ?? null,
                metrics: data.metrics ?? null,
                urls: data.urls ?? {},
                created_at: data.created_at,
                started_at: data.started_at ?? null,
                completed_at: data.completed_at ?? null,
            };
        }

        case 'cancel_prediction': {
            validateRequired(args, ['prediction_id']);
            const data = await replicatePost(`/predictions/${args.prediction_id}/cancel`, apiToken, {}) as any;
            return {
                prediction_id: data.id,
                status: data.status,
                cancelled_at: data.completed_at ?? null,
            };
        }

        case 'list_predictions': {
            const params: Record<string, string> = {};
            if (args.cursor) params.cursor = String(args.cursor);
            const data = await replicateGet('/predictions', apiToken, params) as any;
            return {
                predictions: (data.results ?? []).map((p: any) => ({
                    prediction_id: p.id,
                    model: p.model ?? null,
                    version: p.version ?? null,
                    status: p.status,
                    created_at: p.created_at,
                    completed_at: p.completed_at ?? null,
                    urls: p.urls ?? {},
                })),
                next_cursor: data.next ?? null,
                previous_cursor: data.previous ?? null,
            };
        }

        case 'get_model': {
            validateRequired(args, ['model_owner', 'model_name']);
            const data = await replicateGet(`/models/${args.model_owner}/${args.model_name}`, apiToken) as any;
            return {
                url: data.url ?? null,
                owner: data.owner,
                name: data.name,
                description: data.description ?? '',
                visibility: data.visibility,
                github_url: data.github_url ?? null,
                paper_url: data.paper_url ?? null,
                license_url: data.license_url ?? null,
                run_count: data.run_count ?? 0,
                cover_image_url: data.cover_image_url ?? null,
                default_example: data.default_example ?? null,
                latest_version: data.latest_version
                    ? {
                        id: data.latest_version.id,
                        created_at: data.latest_version.created_at,
                        cog_version: data.latest_version.cog_version ?? null,
                    }
                    : null,
            };
        }

        case 'list_model_versions': {
            validateRequired(args, ['model_owner', 'model_name']);
            const data = await replicateGet(
                `/models/${args.model_owner}/${args.model_name}/versions`,
                apiToken,
            ) as any;
            return {
                versions: (data.results ?? []).map((v: any) => ({
                    id: v.id,
                    created_at: v.created_at,
                    cog_version: v.cog_version ?? null,
                    openapi_schema: v.openapi_schema ?? null,
                })),
                next_cursor: data.next ?? null,
            };
        }

        case 'get_model_version': {
            validateRequired(args, ['model_owner', 'model_name', 'version_id']);
            const data = await replicateGet(
                `/models/${args.model_owner}/${args.model_name}/versions/${args.version_id}`,
                apiToken,
            ) as any;
            return {
                id: data.id,
                created_at: data.created_at,
                cog_version: data.cog_version ?? null,
                openapi_schema: data.openapi_schema ?? null,
            };
        }

        case 'search_models': {
            validateRequired(args, ['query']);
            const data = await replicateGet('/models', apiToken, { query: String(args.query) }) as any;
            return {
                models: (data.results ?? []).map((m: any) => ({
                    owner: m.owner,
                    name: m.name,
                    description: m.description ?? '',
                    visibility: m.visibility,
                    run_count: m.run_count ?? 0,
                    url: m.url ?? null,
                    cover_image_url: m.cover_image_url ?? null,
                    latest_version_id: m.latest_version?.id ?? null,
                })),
                next_cursor: data.next ?? null,
            };
        }

        case 'list_deployments': {
            const data = await replicateGet('/deployments', apiToken) as any;
            return {
                deployments: (data.results ?? []).map((d: any) => ({
                    owner: d.owner,
                    name: d.name,
                    current_release: d.current_release
                        ? {
                            number: d.current_release.number,
                            model: d.current_release.model,
                            version: d.current_release.version,
                            created_at: d.current_release.created_at,
                            configuration: {
                                hardware: d.current_release.configuration?.hardware,
                                min_instances: d.current_release.configuration?.min_instances,
                                max_instances: d.current_release.configuration?.max_instances,
                            },
                        }
                        : null,
                })),
                next_cursor: data.next ?? null,
            };
        }

        case 'create_deployment_prediction': {
            validateRequired(args, ['deployment_owner', 'deployment_name', 'input']);
            const requestBody: Record<string, unknown> = { input: args.input };
            if (args.webhook) requestBody.webhook = args.webhook;

            const data = await replicatePost(
                `/deployments/${args.deployment_owner}/${args.deployment_name}/predictions`,
                apiToken,
                requestBody,
            ) as any;
            return {
                prediction_id: data.id,
                status: data.status,
                deployment: `${args.deployment_owner}/${args.deployment_name}`,
                urls: data.urls ?? {},
                output: data.output ?? null,
                created_at: data.created_at,
            };
        }

        case 'get_account': {
            const data = await replicateGet('/account', apiToken) as any;
            return {
                username: data.username,
                name: data.name ?? '',
                type: data.type,
                github_url: data.github_url ?? null,
            };
        }

        case 'create_model': {
            validateRequired(args, ['owner', 'name', 'visibility', 'hardware']);
            const requestBody: Record<string, unknown> = {
                owner: args.owner,
                name: args.name,
                visibility: args.visibility,
                hardware: args.hardware,
            };
            if (args.description) requestBody.description = args.description;
            if (args.github_url) requestBody.github_url = args.github_url;
            if (args.paper_url) requestBody.paper_url = args.paper_url;
            if (args.license_url) requestBody.license_url = args.license_url;
            if (args.cover_image_url) requestBody.cover_image_url = args.cover_image_url;

            const data = await replicatePost('/models', apiToken, requestBody) as any;
            return {
                url: data.url ?? null,
                owner: data.owner,
                name: data.name,
                visibility: data.visibility,
                description: data.description ?? '',
                created_at: data.created_at ?? null,
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-replicate', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (body.jsonrpc !== '2.0') {
            return rpcErr(id ?? null, -32600, 'Invalid Request: jsonrpc must be "2.0"');
        }

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-replicate', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiToken = getApiToken(request);
            if (!apiToken) {
                return rpcErr(id, -32001, 'Missing required secret: REPLICATE_API_TOKEN (header: X-Mcp-Secret-REPLICATE-API-TOKEN)');
            }

            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name ?? '';
            const toolArgs = p?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, apiToken);
                return rpcOk(id, toolOk(result));
            } catch (err: unknown) {
                if (err instanceof Error) {
                    return rpcErr(id, -32603, err.message);
                }
                return rpcErr(id, -32603, 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
