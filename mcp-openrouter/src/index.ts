/**
 * OpenRouter MCP Worker
 * Implements MCP protocol over HTTP for OpenRouter API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   OPENROUTER_API_KEY → X-Mcp-Secret-OPENROUTER-API-KEY
 *
 * Auth format: Authorization: Bearer {api_key} + HTTP-Referer header
 * Covers: chat_completion, list_models, get_model, get_credits, get_generation
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_REFERER = 'https://aerostack.dev';

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
    return request.headers.get('X-Mcp-Secret-OPENROUTER-API-KEY');
}

async function openrouterFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const res = await fetch(`${OPENROUTER_API_BASE}${path}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': OPENROUTER_REFERER,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        const msg = (err as { error?: { message?: string } }).error?.message ?? res.statusText;
        throw { code: -32603, message: `OpenRouter API error ${res.status}: ${msg}` };
    }
    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify OpenRouter credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'chat_completion',
        description: 'Send a chat completion request through OpenRouter. Routes to the specified model across 100+ LLM providers. OpenAI-compatible format.',
        inputSchema: {
            type: 'object',
            properties: {
                model: {
                    type: 'string',
                    description: 'Model ID (e.g. "openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash")',
                },
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
                max_tokens: {
                    type: 'number',
                    description: 'Maximum tokens to generate',
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature 0-2',
                },
            },
            required: ['model', 'messages'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_models',
        description: 'List all available models on OpenRouter with pricing per token, context length, and provider info.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_model',
        description: 'Get detailed information about a specific OpenRouter model including pricing, context length, and capabilities.',
        inputSchema: {
            type: 'object',
            properties: {
                model_id: {
                    type: 'string',
                    description: 'Model ID (e.g. "openai/gpt-4o", "anthropic/claude-3.5-sonnet")',
                },
            },
            required: ['model_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_credits',
        description: 'Get current API key credit balance, usage limits, and rate limit information for the OpenRouter account.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_generation',
        description: 'Get details about a specific generation/completion including tokens used, model, cost, and the full response.',
        inputSchema: {
            type: 'object',
            properties: {
                generation_id: {
                    type: 'string',
                    description: 'Generation ID returned from a chat completion request',
                },
            },
            required: ['generation_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
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
            await openrouterFetch('/models', apiKey);
            return { content: [{ type: 'text', text: 'Connected to OpenRouter' }] };
        }

        case 'chat_completion': {
            const body: Record<string, unknown> = {
                model: args.model,
                messages: args.messages,
            };
            if (args.max_tokens !== undefined) body.max_tokens = args.max_tokens;
            if (args.temperature !== undefined) body.temperature = args.temperature;
            return openrouterFetch('/chat/completions', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_models': {
            return openrouterFetch('/models', apiKey);
        }

        case 'get_model': {
            if (!args.model_id) throw new Error('Missing required parameter: model_id');
            return openrouterFetch(`/models/${args.model_id as string}`, apiKey);
        }

        case 'get_credits': {
            return openrouterFetch('/auth/key', apiKey);
        }

        case 'get_generation': {
            if (!args.generation_id) throw new Error('Missing required parameter: generation_id');
            return openrouterFetch(`/generation?id=${encodeURIComponent(args.generation_id as string)}`, apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-openrouter', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-openrouter', version: '1.0.0' },
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
            return rpcErr(id, -32001, 'Missing required secret — add OPENROUTER_API_KEY to workspace secrets');
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
