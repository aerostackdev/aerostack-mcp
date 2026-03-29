/**
 * Gemini MCP Worker
 * Implements MCP protocol over HTTP for Google Gemini API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   GEMINI_API_KEY → X-Mcp-Secret-GEMINI-API-KEY
 *
 * Auth format: Authorization: Bearer {api_key} header
 * Covers: generate_content, list_models, get_model, count_tokens, embed_content, generate_with_system
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.0-flash';

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
    return request.headers.get('X-Mcp-Secret-GEMINI-API-KEY');
}

async function geminiFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${GEMINI_API_BASE}${path}`;
    const res = await fetch(url, {
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
        throw { code: -32603, message: `Gemini API error ${res.status}: ${msg}` };
    }
    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'generate_content',
        description: 'Generate content using a Gemini model. Supports text generation with optional temperature and token controls. Default model is gemini-2.0-flash.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'The text prompt to send to Gemini',
                },
                model: {
                    type: 'string',
                    description: `Gemini model ID (default: ${DEFAULT_MODEL}). Options: gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash`,
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature 0-2 (default: 1). Controls creativity.',
                },
                maxOutputTokens: {
                    type: 'number',
                    description: 'Maximum output tokens (default: 2048)',
                },
            },
            required: ['prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_models',
        description: 'List all available Gemini models with their capabilities, token limits, and supported generation methods.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_model',
        description: 'Get detailed information about a specific Gemini model including token limits and supported methods.',
        inputSchema: {
            type: 'object',
            properties: {
                model: {
                    type: 'string',
                    description: 'Model name (e.g. "gemini-2.0-flash", "gemini-1.5-pro")',
                },
            },
            required: ['model'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'count_tokens',
        description: 'Count the number of tokens in a prompt without generating a response. Useful for estimating costs.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'The text to count tokens for',
                },
                model: {
                    type: 'string',
                    description: `Model to use for token counting (default: ${DEFAULT_MODEL})`,
                },
            },
            required: ['prompt'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'embed_content',
        description: 'Generate text embeddings using text-embedding-004 model. Returns a 768-dimensional embedding vector for semantic search, clustering, or similarity tasks.',
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to generate embeddings for',
                },
            },
            required: ['text'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'generate_with_system',
        description: 'Generate content with a system instruction that sets the model persona and context. More powerful than a regular system prompt in many use cases.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'The user prompt',
                },
                systemPrompt: {
                    type: 'string',
                    description: 'System instruction to set model behavior and persona',
                },
                model: {
                    type: 'string',
                    description: `Gemini model ID (default: ${DEFAULT_MODEL})`,
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature 0-2',
                },
                maxOutputTokens: {
                    type: 'number',
                    description: 'Maximum output tokens',
                },
            },
            required: ['prompt', 'systemPrompt'],
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
        case 'generate_content': {
            const model = (args.model as string) || DEFAULT_MODEL;
            const body: Record<string, unknown> = {
                contents: [{ role: 'user', parts: [{ text: args.prompt as string }] }],
            };
            if (args.temperature !== undefined || args.maxOutputTokens !== undefined) {
                body.generationConfig = {
                    ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
                    ...(args.maxOutputTokens !== undefined ? { maxOutputTokens: args.maxOutputTokens } : {}),
                };
            }
            return geminiFetch(`/models/${encodeURIComponent(model)}:generateContent`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_models': {
            return geminiFetch('/models', apiKey);
        }

        case 'get_model': {
            if (!args.model) throw new Error('Missing required parameter: model');
            return geminiFetch(`/models/${encodeURIComponent(String(args.model))}`, apiKey);
        }

        case 'count_tokens': {
            const model = (args.model as string) || DEFAULT_MODEL;
            return geminiFetch(`/models/${encodeURIComponent(model)}:countTokens`, apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: args.prompt as string }] }],
                }),
            });
        }

        case 'embed_content': {
            return geminiFetch('/models/text-embedding-004:embedContent', apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    content: { parts: [{ text: args.text as string }] },
                }),
            });
        }

        case 'generate_with_system': {
            const model = (args.model as string) || DEFAULT_MODEL;
            const body: Record<string, unknown> = {
                system_instruction: { parts: [{ text: args.systemPrompt as string }] },
                contents: [{ role: 'user', parts: [{ text: args.prompt as string }] }],
            };
            if (args.temperature !== undefined || args.maxOutputTokens !== undefined) {
                body.generationConfig = {
                    ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
                    ...(args.maxOutputTokens !== undefined ? { maxOutputTokens: args.maxOutputTokens } : {}),
                };
            }
            return geminiFetch(`/models/${encodeURIComponent(model)}:generateContent`, apiKey, {
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
                JSON.stringify({ status: 'ok', server: 'mcp-gemini', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-gemini', version: '1.0.0' },
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
            return rpcErr(id, -32001, 'Missing required secret — add GEMINI_API_KEY to workspace secrets');
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
