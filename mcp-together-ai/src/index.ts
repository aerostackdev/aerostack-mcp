/**
 * Together AI MCP Worker
 * Implements MCP protocol over HTTP for Together AI open-source model inference.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   TOGETHER_API_KEY → X-Mcp-Secret-TOGETHER-API-KEY
 *
 * Auth: Authorization: Bearer {TOGETHER_API_KEY}
 * Docs: https://docs.together.ai/reference/
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const TOGETHER_API_BASE = 'https://api.together.xyz/v1';

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
    return request.headers.get('X-Mcp-Secret-TOGETHER-API-KEY');
}

async function togetherPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${TOGETHER_API_BASE}${path}`, {
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
        throw new Error(`Together AI ${res.status}: ${text}`);
    }
    return res.json();
}

async function togetherGet(path: string, apiKey: string): Promise<unknown> {
    const res = await fetch(`${TOGETHER_API_BASE}${path}`, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Together AI ${res.status}: ${text}`);
    }
    return res.json();
}

async function togetherDelete(path: string, apiKey: string): Promise<unknown> {
    const res = await fetch(`${TOGETHER_API_BASE}${path}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Together AI ${res.status}: ${text}`);
    }
    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Together AI credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'chat',
        description: 'Send messages to any Together AI chat model (Llama, Mistral, Qwen, etc.) and receive a response. OpenAI-compatible interface',
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
                    description: 'Model to use e.g. "meta-llama/Llama-3.3-70B-Instruct-Turbo" (required)',
                },
                temperature: { type: 'number', description: 'Sampling temperature (0.0–2.0)' },
                max_tokens: { type: 'number', description: 'Maximum tokens to generate' },
                top_p: { type: 'number', description: 'Top-p nucleus sampling' },
                top_k: { type: 'number', description: 'Top-k sampling' },
                stop: { type: 'array', items: { type: 'string' }, description: 'Stop sequences' },
                repetition_penalty: { type: 'number', description: 'Penalty for repeating tokens (1.0 = no penalty)' },
                response_format: {
                    type: 'string',
                    description: 'Force JSON output by setting to "json_object"',
                    enum: ['text', 'json_object'],
                },
            },
            required: ['messages', 'model'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'complete',
        description: 'Text completion (non-chat) for any Together AI base model. Send a prompt and receive a completion',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Input prompt text' },
                model: { type: 'string', description: 'Model to use e.g. "mistralai/Mixtral-8x7B-v0.1"' },
                max_tokens: { type: 'number', description: 'Maximum tokens to generate (default: 512)' },
                temperature: { type: 'number', description: 'Sampling temperature (0.0–2.0)' },
                top_p: { type: 'number', description: 'Top-p nucleus sampling' },
                top_k: { type: 'number', description: 'Top-k sampling' },
                stop: { type: 'array', items: { type: 'string' }, description: 'Stop sequences' },
                repetition_penalty: { type: 'number', description: 'Repetition penalty' },
            },
            required: ['prompt', 'model'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'embed',
        description: 'Generate text embeddings for semantic search and similarity using Together AI embedding models',
        inputSchema: {
            type: 'object',
            properties: {
                input: {
                    type: 'string',
                    description: 'Text to embed (string or array of strings). Pass a single string or JSON-encoded array',
                },
                model: {
                    type: 'string',
                    description: 'Embedding model e.g. "togethercomputer/m2-bert-80M-8k-retrieval"',
                },
            },
            required: ['input', 'model'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'generate_image',
        description: 'Generate images from text prompts using Together AI image models like FLUX',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Text description of the image to generate' },
                model: { type: 'string', description: 'Image model e.g. "black-forest-labs/FLUX.1-schnell-Free"' },
                n: { type: 'number', description: 'Number of images to generate (default: 1)' },
                width: { type: 'number', description: 'Image width in pixels (default: 1024)' },
                height: { type: 'number', description: 'Image height in pixels (default: 1024)' },
                steps: { type: 'number', description: 'Number of inference steps' },
                seed: { type: 'number', description: 'Random seed for reproducibility' },
                negative_prompt: { type: 'string', description: 'What to avoid in the generated image' },
            },
            required: ['prompt', 'model'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_models',
        description: 'List all available Together AI models with type, pricing, and context length information',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_model',
        description: 'Get detailed information about a specific Together AI model by its ID',
        inputSchema: {
            type: 'object',
            properties: {
                model_id: { type: 'string', description: 'Full model ID e.g. "meta-llama/Llama-3.3-70B-Instruct-Turbo"' },
            },
            required: ['model_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'upload_file',
        description: 'Upload a file to Together AI for use in fine-tuning jobs. Pass content as base64',
        inputSchema: {
            type: 'object',
            properties: {
                filename: { type: 'string', description: 'Name for the file (e.g. "training_data.jsonl")' },
                content_base64: { type: 'string', description: 'Base64-encoded file content' },
                purpose: {
                    type: 'string',
                    description: 'Purpose of the file (default: fine-tune)',
                    enum: ['fine-tune'],
                },
            },
            required: ['filename', 'content_base64'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_files',
        description: 'List all uploaded files in your Together AI account',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_file',
        description: 'Delete an uploaded file from your Together AI account',
        inputSchema: {
            type: 'object',
            properties: {
                file_id: { type: 'string', description: 'The file ID to delete' },
            },
            required: ['file_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'create_fine_tuning_job',
        description: 'Start a fine-tuning job to train a custom model on Together AI with your data',
        inputSchema: {
            type: 'object',
            properties: {
                training_file: { type: 'string', description: 'File ID of the training data' },
                model: { type: 'string', description: 'Base model to fine-tune e.g. "meta-llama/Llama-3-8b-hf"' },
                n_epochs: { type: 'number', description: 'Number of training epochs (default: 1)' },
                learning_rate: { type: 'number', description: 'Learning rate for training' },
                batch_size: { type: 'number', description: 'Training batch size' },
                suffix: { type: 'string', description: 'Custom suffix to append to the fine-tuned model name' },
            },
            required: ['training_file', 'model'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_fine_tuning_jobs',
        description: 'List all fine-tuning jobs in your Together AI account',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_fine_tuning_job',
        description: 'Get the current status and details of a specific fine-tuning job',
        inputSchema: {
            type: 'object',
            properties: {
                job_id: { type: 'string', description: 'The fine-tuning job ID' },
            },
            required: ['job_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
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
            await togetherGet('/models', apiKey);
            return { content: [{ type: 'text', text: 'Connected to Together AI' }] };
        }

        case 'chat': {
            validateRequired(args, ['messages', 'model']);
            if (!Array.isArray(args.messages) || args.messages.length === 0) {
                throw new Error('messages must be a non-empty array');
            }

            const requestBody: Record<string, unknown> = {
                model: args.model,
                messages: args.messages,
            };
            if (args.temperature !== undefined) requestBody.temperature = args.temperature;
            if (args.max_tokens !== undefined) requestBody.max_tokens = args.max_tokens;
            if (args.top_p !== undefined) requestBody.top_p = args.top_p;
            if (args.top_k !== undefined) requestBody.top_k = args.top_k;
            if (args.stop !== undefined) requestBody.stop = args.stop;
            if (args.repetition_penalty !== undefined) requestBody.repetition_penalty = args.repetition_penalty;
            if (args.response_format) requestBody.response_format = { type: args.response_format };

            const data = await togetherPost('/chat/completions', apiKey, requestBody) as any;
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

        case 'complete': {
            validateRequired(args, ['prompt', 'model']);

            const requestBody: Record<string, unknown> = {
                model: args.model,
                prompt: args.prompt,
                max_tokens: args.max_tokens ?? 512,
            };
            if (args.temperature !== undefined) requestBody.temperature = args.temperature;
            if (args.top_p !== undefined) requestBody.top_p = args.top_p;
            if (args.top_k !== undefined) requestBody.top_k = args.top_k;
            if (args.stop !== undefined) requestBody.stop = args.stop;
            if (args.repetition_penalty !== undefined) requestBody.repetition_penalty = args.repetition_penalty;

            const data = await togetherPost('/completions', apiKey, requestBody) as any;
            const choice = data.choices?.[0];
            return {
                text: choice?.text ?? '',
                model: data.model,
                finish_reason: choice?.finish_reason ?? null,
                usage: {
                    prompt_tokens: data.usage?.prompt_tokens ?? 0,
                    completion_tokens: data.usage?.completion_tokens ?? 0,
                    total_tokens: data.usage?.total_tokens ?? 0,
                },
            };
        }

        case 'embed': {
            validateRequired(args, ['input', 'model']);

            // Allow passing JSON array as string or plain string
            let inputValue: unknown = args.input;
            if (typeof inputValue === 'string') {
                try {
                    const parsed = JSON.parse(inputValue);
                    if (Array.isArray(parsed)) inputValue = parsed;
                } catch {
                    // treat as single string
                }
            }

            const data = await togetherPost('/embeddings', apiKey, {
                model: args.model,
                input: inputValue,
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

        case 'generate_image': {
            validateRequired(args, ['prompt', 'model']);

            const requestBody: Record<string, unknown> = {
                model: args.model,
                prompt: args.prompt,
                n: args.n ?? 1,
                width: args.width ?? 1024,
                height: args.height ?? 1024,
            };
            if (args.steps !== undefined) requestBody.steps = args.steps;
            if (args.seed !== undefined) requestBody.seed = args.seed;
            if (args.negative_prompt) requestBody.negative_prompt = args.negative_prompt;

            const data = await togetherPost('/images/generations', apiKey, requestBody) as any;
            return {
                images: (data.data ?? []).map((img: any) => ({
                    url: img.url ?? null,
                    b64_json: img.b64_json ?? null,
                })),
                model: args.model,
            };
        }

        case 'list_models': {
            const data = await togetherGet('/models', apiKey) as any;
            const models = Array.isArray(data) ? data : (data.data ?? data.models ?? []);
            return {
                models: models.map((m: any) => ({
                    id: m.id,
                    display_name: m.display_name ?? m.name ?? m.id,
                    organization: m.organization ?? null,
                    link: m.link ?? null,
                    license: m.license ?? null,
                    context_length: m.context_length ?? null,
                    type: m.type ?? null,
                    pricing: m.pricing ?? null,
                })),
                total: models.length,
            };
        }

        case 'get_model': {
            validateRequired(args, ['model_id']);
            const data = await togetherGet(`/models/${encodeURIComponent(String(args.model_id))}`, apiKey) as any;
            return {
                id: data.id,
                display_name: data.display_name ?? data.name ?? data.id,
                organization: data.organization ?? null,
                context_length: data.context_length ?? null,
                type: data.type ?? null,
                pricing: data.pricing ?? null,
            };
        }

        case 'upload_file': {
            validateRequired(args, ['filename', 'content_base64']);

            const binary = atob(String(args.content_base64));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/octet-stream' });

            const form = new FormData();
            form.append('purpose', String(args.purpose ?? 'fine-tune'));
            form.append('file', blob, String(args.filename));

            const res = await fetch(`${TOGETHER_API_BASE}/files`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: form,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Together AI ${res.status}: ${text}`);
            }
            const data = await res.json() as any;
            return {
                file_id: data.id,
                filename: data.filename,
                size: data.size ?? data.bytes ?? 0,
                purpose: data.purpose,
                created_at: data.created_at,
            };
        }

        case 'list_files': {
            const data = await togetherGet('/files', apiKey) as any;
            const files = Array.isArray(data) ? data : (data.data ?? data.files ?? []);
            return {
                files: files.map((f: any) => ({
                    file_id: f.id,
                    filename: f.filename,
                    size: f.size ?? f.bytes ?? 0,
                    purpose: f.purpose,
                    created_at: f.created_at,
                })),
            };
        }

        case 'delete_file': {
            validateRequired(args, ['file_id']);
            const data = await togetherDelete(`/files/${args.file_id}`, apiKey) as any;
            return {
                success: data.deleted ?? true,
                file_id: data.id ?? args.file_id,
            };
        }

        case 'create_fine_tuning_job': {
            validateRequired(args, ['training_file', 'model']);

            const requestBody: Record<string, unknown> = {
                training_file: args.training_file,
                model: args.model,
                n_epochs: args.n_epochs ?? 1,
            };
            if (args.learning_rate !== undefined) requestBody.learning_rate = args.learning_rate;
            if (args.batch_size !== undefined) requestBody.batch_size = args.batch_size;
            if (args.suffix) requestBody.suffix = args.suffix;

            const data = await togetherPost('/fine-tunes', apiKey, requestBody) as any;
            return {
                job_id: data.id,
                status: data.status,
                model: data.model,
                created_at: data.created_at,
            };
        }

        case 'list_fine_tuning_jobs': {
            const data = await togetherGet('/fine-tunes', apiKey) as any;
            const jobs = Array.isArray(data) ? data : (data.data ?? data.jobs ?? []);
            return {
                jobs: jobs.map((j: any) => ({
                    job_id: j.id,
                    status: j.status,
                    model: j.model,
                    created_at: j.created_at,
                    fine_tuned_model: j.fine_tuned_model ?? null,
                })),
            };
        }

        case 'get_fine_tuning_job': {
            validateRequired(args, ['job_id']);
            const data = await togetherGet(`/fine-tunes/${args.job_id}`, apiKey) as any;
            return {
                job_id: data.id,
                status: data.status,
                model: data.model,
                events: data.events ?? [],
                fine_tuned_model: data.fine_tuned_model ?? null,
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
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-together-ai', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-together-ai', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = getApiKey(request);
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: TOGETHER_API_KEY (header: X-Mcp-Secret-TOGETHER-API-KEY)');
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
