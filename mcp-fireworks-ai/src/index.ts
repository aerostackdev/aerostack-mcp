/**
 * Fireworks AI MCP Worker
 * Implements MCP protocol over HTTP for Fireworks AI fast inference operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   FIREWORKS_API_KEY → X-Mcp-Secret-FIREWORKS-API-KEY
 *
 * Auth format: Authorization: Bearer {api_key}
 * Base: https://api.fireworks.ai/inference/v1
 * Covers: chat_completion, text_completion, create_embedding, list_models, image_generation = 5 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const FIREWORKS_API_BASE = 'https://api.fireworks.ai/inference/v1';
const DEFAULT_CHAT_MODEL = 'accounts/fireworks/models/llama-v3p1-8b-instruct';
const DEFAULT_EMBED_MODEL = 'nomic-ai/nomic-embed-text-v1.5';
const DEFAULT_IMAGE_MODEL = 'accounts/fireworks/models/stable-diffusion-xl-1024-v1-0';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function getApiKey(request: Request): string | null {
    return request.headers.get('X-Mcp-Secret-FIREWORKS-API-KEY');
}

async function fireworksFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const res = await fetch(`${FIREWORKS_API_BASE}${path}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        const msg = (err as { error?: { message?: string } }).error?.message ?? res.statusText;
        throw { code: -32603, message: `Fireworks AI error ${res.status}: ${msg}` };
    }
    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Fireworks AI credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'chat_completion',
        description: 'Fast chat completion using Fireworks AI. Supports Llama, Mixtral, and other open-source models with OpenAI-compatible API. Default model: llama-v3p1-8b-instruct.',
        inputSchema: {
            type: 'object',
            properties: {
                messages: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            role: { type: 'string', enum: ['user', 'assistant', 'system'], description: 'Message role' },
                            content: { type: 'string', description: 'Message content' },
                        },
                        required: ['role', 'content'],
                    },
                    description: 'Conversation messages',
                },
                model: {
                    type: 'string',
                    description: `Model ID (default: ${DEFAULT_CHAT_MODEL}). Format: accounts/fireworks/models/{model-name}`,
                },
                max_tokens: {
                    type: 'number',
                    description: 'Maximum tokens to generate (default: 1024)',
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature 0-2',
                },
            },
            required: ['messages'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'text_completion',
        description: 'Raw text completion using Fireworks AI. Continues the provided prompt without chat formatting.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'Text prompt to complete',
                },
                model: {
                    type: 'string',
                    description: `Model ID (default: ${DEFAULT_CHAT_MODEL})`,
                },
                max_tokens: {
                    type: 'number',
                    description: 'Maximum tokens to generate (default: 512)',
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature 0-2',
                },
            },
            required: ['prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_embedding',
        description: 'Generate text embeddings using Fireworks AI nomic-embed-text-v1.5. Returns dense vectors for semantic search, clustering, and similarity.',
        inputSchema: {
            type: 'object',
            properties: {
                input: {
                    description: 'Text or array of texts to embed',
                    oneOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                },
                model: {
                    type: 'string',
                    description: `Embedding model (default: ${DEFAULT_EMBED_MODEL})`,
                },
            },
            required: ['input'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_models',
        description: 'List all available models on Fireworks AI including chat, completion, embedding, and image generation models.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'image_generation',
        description: 'Generate images using Stable Diffusion XL on Fireworks AI. Returns image URLs.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'Image generation prompt',
                },
                n: {
                    type: 'number',
                    description: 'Number of images to generate (default: 1)',
                },
                width: {
                    type: 'number',
                    description: 'Image width in pixels (default: 1024)',
                },
                height: {
                    type: 'number',
                    description: 'Image height in pixels (default: 1024)',
                },
            },
            required: ['prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            return fireworksFetch('/models', apiKey);
        }
        case 'chat_completion': {
            const body: Record<string, unknown> = {
                model: (args.model as string) || DEFAULT_CHAT_MODEL,
                messages: args.messages,
                max_tokens: (args.max_tokens as number) ?? 1024,
            };
            if (args.temperature !== undefined) body.temperature = args.temperature;
            return fireworksFetch('/chat/completions', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'text_completion': {
            if (!args.prompt) throw new Error('Missing required parameter: prompt');
            const body: Record<string, unknown> = {
                model: (args.model as string) || DEFAULT_CHAT_MODEL,
                prompt: args.prompt,
                max_tokens: (args.max_tokens as number) ?? 512,
            };
            if (args.temperature !== undefined) body.temperature = args.temperature;
            return fireworksFetch('/completions', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'create_embedding': {
            if (args.input === undefined || args.input === null) throw new Error('Missing required parameter: input');
            return fireworksFetch('/embeddings', apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    model: (args.model as string) || DEFAULT_EMBED_MODEL,
                    input: args.input,
                }),
            });
        }

        case 'list_models': {
            return fireworksFetch('/models', apiKey);
        }

        case 'image_generation': {
            if (!args.prompt) throw new Error('Missing required parameter: prompt');
            const body: Record<string, unknown> = { prompt: args.prompt };
            if (args.n !== undefined) body.n = args.n;
            if (args.width !== undefined) body.width = args.width;
            if (args.height !== undefined) body.height = args.height;
            return fireworksFetch(`/image_generation/${DEFAULT_IMAGE_MODEL}`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-fireworks-ai', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error — invalid JSON');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-fireworks-ai', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'notifications/initialized') {
            return rpcOk(id, {});
        }

        if (method !== 'tools/call') {
            return rpcErr(id, -32601, `Method not found: ${method}`);
        }

        const apiKey = getApiKey(request);
        if (!apiKey) {
            return rpcErr(id, -32001, 'Missing required secret — add FIREWORKS_API_KEY to workspace secrets');
        }

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        try {
            const result = await callTool(toolName, args, apiKey);
            return rpcOk(id, toolOk(result));
        } catch (err) {
            const e = err as { code?: number; message?: string } | Error;
            const msg = e instanceof Error ? e.message : ((e as { message?: string }).message ?? String(e));
            const code = (e as { code?: number }).code ?? -32603;
            return rpcErr(id, code, msg);
        }
    },
};
