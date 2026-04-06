/**
 * Mistral AI MCP Worker
 * Implements MCP protocol over HTTP for Mistral AI language model operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   MISTRAL_API_KEY → X-Mcp-Secret-MISTRAL-API-KEY
 *
 * Auth: Authorization: Bearer {API_KEY}
 * Docs: https://docs.mistral.ai/api/
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const MISTRAL_API_BASE = 'https://api.mistral.ai/v1';

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

function getApiKey(request: Request): string | null {
    return request.headers.get('X-Mcp-Secret-MISTRAL-API-KEY');
}

async function mistralPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${MISTRAL_API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Mistral API ${res.status}: ${text}`);
    }
    return res.json();
}

async function mistralGet(path: string, apiKey: string): Promise<unknown> {
    const res = await fetch(`${MISTRAL_API_BASE}${path}`, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Mistral API ${res.status}: ${text}`);
    }
    return res.json();
}

async function mistralDelete(path: string, apiKey: string): Promise<unknown> {
    const res = await fetch(`${MISTRAL_API_BASE}${path}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Mistral API ${res.status}: ${text}`);
    }
    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Mistral credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'chat',
        description: 'Send messages to a Mistral model and receive a response. Supports multi-turn conversations, system prompts, and JSON mode',
        inputSchema: {
            type: 'object',
            properties: {
                messages: {
                    type: 'array',
                    description: 'Conversation messages as [{role: "user"|"assistant"|"system", content: "..."}]',
                    items: {
                        type: 'object',
                        properties: {
                            role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                            content: { type: 'string' },
                        },
                    },
                },
                model: {
                    type: 'string',
                    description: 'Mistral model to use (default: mistral-large-latest)',
                    enum: [
                        'mistral-large-latest',
                        'mistral-medium-latest',
                        'mistral-small-latest',
                        'codestral-latest',
                        'mistral-nemo',
                        'open-mistral-7b',
                        'open-mixtral-8x7b',
                        'open-mixtral-8x22b',
                        'open-codestral-mamba',
                    ],
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature (0.0–1.0)',
                },
                max_tokens: {
                    type: 'number',
                    description: 'Maximum number of tokens to generate',
                },
                top_p: {
                    type: 'number',
                    description: 'Top-p nucleus sampling (0.0–1.0)',
                },
                response_format: {
                    type: 'string',
                    description: 'Force JSON output format by setting to "json_object"',
                    enum: ['text', 'json_object'],
                },
                safe_prompt: {
                    type: 'boolean',
                    description: 'Inject safety prompt before user messages (default: false)',
                },
                random_seed: {
                    type: 'number',
                    description: 'Seed for deterministic output',
                },
            },
            required: ['messages'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'embed',
        description: 'Generate text embeddings using Mistral Embed model for semantic search and similarity tasks',
        inputSchema: {
            type: 'object',
            properties: {
                inputs: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of texts to embed (max 16,384 tokens total)',
                },
                model: {
                    type: 'string',
                    description: 'Embedding model to use (default: mistral-embed)',
                    enum: ['mistral-embed'],
                },
                encoding_format: {
                    type: 'string',
                    description: 'Encoding format for embeddings (default: float)',
                    enum: ['float'],
                },
            },
            required: ['inputs'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'fill_in_middle',
        description: 'Fill in the middle of code using Codestral — provide prefix and suffix code, get completion',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'The code before the cursor / completion point',
                },
                suffix: {
                    type: 'string',
                    description: 'The code after the cursor — Codestral will fill the gap between prompt and suffix',
                },
                model: {
                    type: 'string',
                    description: 'Model to use (default: codestral-latest)',
                    enum: ['codestral-latest', 'open-codestral-mamba'],
                },
                max_tokens: {
                    type: 'number',
                    description: 'Maximum tokens to generate',
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature (0.0–1.0)',
                },
                stop: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Stop sequences',
                },
            },
            required: ['prompt', 'suffix'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_models',
        description: 'List all available Mistral models including fine-tuned and base models',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_model',
        description: 'Get details about a specific Mistral model by its ID',
        inputSchema: {
            type: 'object',
            properties: {
                model_id: {
                    type: 'string',
                    description: 'The model identifier (e.g. "mistral-large-latest")',
                },
            },
            required: ['model_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'upload_file',
        description: 'Upload a file to Mistral for use in fine-tuning jobs. Returns a file ID',
        inputSchema: {
            type: 'object',
            properties: {
                filename: {
                    type: 'string',
                    description: 'Name for the uploaded file (must end in .jsonl)',
                },
                content_base64: {
                    type: 'string',
                    description: 'Base64-encoded file content (JSONL format for fine-tuning)',
                },
                purpose: {
                    type: 'string',
                    description: 'Purpose of the file upload',
                    enum: ['fine-tune', 'batch'],
                },
            },
            required: ['filename', 'content_base64', 'purpose'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_files',
        description: 'List all uploaded files in your Mistral account',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_file',
        description: 'Delete an uploaded file from your Mistral account',
        inputSchema: {
            type: 'object',
            properties: {
                file_id: { type: 'string', description: 'The ID of the file to delete' },
            },
            required: ['file_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'create_fine_tuning_job',
        description: 'Create a fine-tuning job to train a custom Mistral model on your data',
        inputSchema: {
            type: 'object',
            properties: {
                model: {
                    type: 'string',
                    description: 'Base model to fine-tune',
                    enum: ['open-mistral-7b', 'mistral-small-latest', 'codestral-latest'],
                },
                training_files: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of file IDs to use as training data',
                },
                validation_files: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional array of file IDs for validation',
                },
                suffix: {
                    type: 'string',
                    description: 'Custom suffix appended to the fine-tuned model name (max 18 chars)',
                },
                hyperparameters: {
                    type: 'object',
                    description: 'Training hyperparameters: {training_steps?: number, learning_rate?: number}',
                },
            },
            required: ['model', 'training_files'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_fine_tuning_jobs',
        description: 'List all fine-tuning jobs with their status, model, and created date',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (default: 1)' },
                page_size: { type: 'number', description: 'Results per page (default: 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_fine_tuning_job',
        description: 'Get details and current status of a specific fine-tuning job',
        inputSchema: {
            type: 'object',
            properties: {
                job_id: { type: 'string', description: 'The fine-tuning job ID' },
            },
            required: ['job_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'cancel_fine_tuning_job',
        description: 'Cancel a running fine-tuning job',
        inputSchema: {
            type: 'object',
            properties: {
                job_id: { type: 'string', description: 'The fine-tuning job ID to cancel' },
            },
            required: ['job_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const data = await mistralGet('/models', apiKey) as { data?: Array<{ id: string }> };
            return `Connected to Mistral — ${data.data?.length ?? 0} models available`;
        }

        case 'chat': {
            validateRequired(args, ['messages']);
            if (!Array.isArray(args.messages) || args.messages.length === 0) {
                throw new Error('messages must be a non-empty array');
            }

            const requestBody: Record<string, unknown> = {
                model: args.model ?? 'mistral-large-latest',
                messages: args.messages,
            };
            if (args.temperature !== undefined) requestBody.temperature = args.temperature;
            if (args.max_tokens !== undefined) requestBody.max_tokens = args.max_tokens;
            if (args.top_p !== undefined) requestBody.top_p = args.top_p;
            if (args.response_format) requestBody.response_format = { type: args.response_format };
            if (args.safe_prompt !== undefined) requestBody.safe_prompt = args.safe_prompt;
            if (args.random_seed !== undefined) requestBody.random_seed = args.random_seed;

            const data = await mistralPost('/chat/completions', apiKey, requestBody) as any;
            const choice = data.choices?.[0];
            return {
                content: choice?.message?.content ?? '',
                model: data.model,
                finish_reason: choice?.finish_reason ?? null,
                usage: {
                    prompt_tokens: data.usage?.prompt_tokens ?? 0,
                    completion_tokens: data.usage?.completion_tokens ?? 0,
                    total_tokens: data.usage?.total_tokens ?? 0,
                },
                id: data.id,
            };
        }

        case 'embed': {
            validateRequired(args, ['inputs']);
            if (!Array.isArray(args.inputs) || args.inputs.length === 0) {
                throw new Error('inputs must be a non-empty array');
            }

            const data = await mistralPost('/embeddings', apiKey, {
                model: args.model ?? 'mistral-embed',
                inputs: args.inputs,
                encoding_format: args.encoding_format ?? 'float',
            }) as any;

            return {
                embeddings: (data.data ?? []).map((d: any) => ({
                    index: d.index,
                    embedding: d.embedding,
                })),
                model: data.model,
                usage: data.usage ?? null,
            };
        }

        case 'fill_in_middle': {
            validateRequired(args, ['prompt', 'suffix']);

            const requestBody: Record<string, unknown> = {
                model: args.model ?? 'codestral-latest',
                prompt: args.prompt,
                suffix: args.suffix,
            };
            if (args.max_tokens !== undefined) requestBody.max_tokens = args.max_tokens;
            if (args.temperature !== undefined) requestBody.temperature = args.temperature;
            if (args.stop) requestBody.stop = args.stop;

            const data = await mistralPost('/fim/completions', apiKey, requestBody) as any;
            const choice = data.choices?.[0];
            return {
                completion: choice?.message?.content ?? '',
                model: data.model,
                finish_reason: choice?.finish_reason ?? null,
                usage: data.usage ?? null,
            };
        }

        case 'list_models': {
            const data = await mistralGet('/models', apiKey) as any;
            return {
                models: (data.data ?? []).map((m: any) => ({
                    id: m.id,
                    object: m.object,
                    created: m.created,
                    owned_by: m.owned_by,
                    name: m.name ?? m.id,
                    description: m.description ?? '',
                    max_context_length: m.max_context_length ?? null,
                    aliases: m.aliases ?? [],
                    deprecation: m.deprecation ?? null,
                    default_model_temperature: m.default_model_temperature ?? null,
                    type: m.type ?? 'base',
                })),
                total: data.data?.length ?? 0,
            };
        }

        case 'get_model': {
            validateRequired(args, ['model_id']);
            const data = await mistralGet(`/models/${args.model_id}`, apiKey) as any;
            return {
                id: data.id,
                object: data.object,
                created: data.created,
                owned_by: data.owned_by,
                name: data.name ?? data.id,
                description: data.description ?? '',
                max_context_length: data.max_context_length ?? null,
                type: data.type ?? 'base',
            };
        }

        case 'upload_file': {
            validateRequired(args, ['filename', 'content_base64', 'purpose']);

            const binary = atob(String(args.content_base64));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/octet-stream' });

            const form = new FormData();
            form.append('purpose', String(args.purpose));
            form.append('file', blob, String(args.filename));

            const res = await fetch(`${MISTRAL_API_BASE}/files`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: form,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Mistral API ${res.status}: ${text}`);
            }
            const data = await res.json() as any;
            return {
                file_id: data.id,
                filename: data.filename,
                purpose: data.purpose,
                size: data.bytes ?? 0,
                created_at: data.created_at,
                status: data.status ?? 'uploaded',
            };
        }

        case 'list_files': {
            const data = await mistralGet('/files', apiKey) as any;
            return {
                files: (data.data ?? []).map((f: any) => ({
                    file_id: f.id,
                    filename: f.filename,
                    purpose: f.purpose,
                    size: f.bytes ?? 0,
                    created_at: f.created_at,
                    status: f.status ?? 'uploaded',
                })),
                total: data.data?.length ?? 0,
            };
        }

        case 'delete_file': {
            validateRequired(args, ['file_id']);
            const data = await mistralDelete(`/files/${args.file_id}`, apiKey) as any;
            return {
                success: data.deleted ?? true,
                file_id: data.id ?? args.file_id,
            };
        }

        case 'create_fine_tuning_job': {
            validateRequired(args, ['model', 'training_files']);
            if (!Array.isArray(args.training_files) || args.training_files.length === 0) {
                throw new Error('training_files must be a non-empty array');
            }

            const requestBody: Record<string, unknown> = {
                model: args.model,
                training_files: (args.training_files as string[]).map(id => ({ file_id: id })),
            };
            if (args.validation_files) {
                requestBody.validation_files = (args.validation_files as string[]).map(id => ({ file_id: id }));
            }
            if (args.suffix) requestBody.suffix = args.suffix;
            if (args.hyperparameters) requestBody.hyperparameters = args.hyperparameters;

            const data = await mistralPost('/fine_tuning/jobs', apiKey, requestBody) as any;
            return {
                job_id: data.id,
                model: data.model,
                status: data.status,
                training_files: data.training_files ?? [],
                created_at: data.created_at,
                fine_tuned_model: data.fine_tuned_model ?? null,
            };
        }

        case 'list_fine_tuning_jobs': {
            const url = new URL(`${MISTRAL_API_BASE}/fine_tuning/jobs`);
            if (args.page) url.searchParams.set('page', String(args.page));
            if (args.page_size) url.searchParams.set('page_size', String(args.page_size));

            const res = await fetch(url.toString(), {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json',
                },
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Mistral API ${res.status}: ${text}`);
            }
            const data = await res.json() as any;
            return {
                jobs: (data.data ?? []).map((j: any) => ({
                    job_id: j.id,
                    model: j.model,
                    status: j.status,
                    created_at: j.created_at,
                    fine_tuned_model: j.fine_tuned_model ?? null,
                })),
                total: data.total ?? data.data?.length ?? 0,
            };
        }

        case 'get_fine_tuning_job': {
            validateRequired(args, ['job_id']);
            const data = await mistralGet(`/fine_tuning/jobs/${args.job_id}`, apiKey) as any;
            return {
                job_id: data.id,
                model: data.model,
                status: data.status,
                created_at: data.created_at,
                trained_tokens: data.trained_tokens ?? null,
                fine_tuned_model: data.fine_tuned_model ?? null,
                integrations: data.integrations ?? [],
                events: (data.events ?? []).map((e: any) => ({
                    name: e.name,
                    created_at: e.created_at,
                    message: e.message ?? null,
                })),
            };
        }

        case 'cancel_fine_tuning_job': {
            validateRequired(args, ['job_id']);
            const data = await mistralPost(`/fine_tuning/jobs/${args.job_id}/cancel`, apiKey, {}) as any;
            return {
                job_id: data.id,
                status: data.status,
                model: data.model,
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
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-mistral', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-mistral', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = getApiKey(request);
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: MISTRAL_API_KEY (header: X-Mcp-Secret-MISTRAL-API-KEY)');
            }

            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name ?? '';
            const toolArgs = p?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, apiKey);
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
