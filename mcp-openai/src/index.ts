/**
 * OpenAI MCP Worker
 * Implements MCP protocol over HTTP for OpenAI API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: OPENAI_API_KEY -> header: X-Mcp-Secret-OPENAI-API-KEY
 */

const OPENAI_API = 'https://api.openai.com/v1';

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
        name: 'chat_completion',
        description: 'Create a chat completion using OpenAI models',
        inputSchema: {
            type: 'object',
            properties: {
                model: { type: 'string', description: 'Model ID (default gpt-4o-mini)' },
                messages: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            role: { type: 'string', enum: ['system', 'user', 'assistant'], description: 'Message role' },
                            content: { type: 'string', description: 'Message content' },
                        },
                        required: ['role', 'content'],
                    },
                    description: 'Array of chat messages',
                },
                temperature: { type: 'number', description: 'Sampling temperature 0-2 (optional)' },
                max_tokens: { type: 'number', description: 'Maximum tokens to generate (optional)' },
            },
            required: ['messages'],
        },
    },
    {
        name: 'list_models',
        description: 'List all available OpenAI models',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'create_embedding',
        description: 'Create text embeddings using OpenAI embedding models',
        inputSchema: {
            type: 'object',
            properties: {
                input: { type: 'string', description: 'Text to embed' },
                model: { type: 'string', description: 'Embedding model (default text-embedding-3-small)' },
            },
            required: ['input'],
        },
    },
    {
        name: 'create_image',
        description: 'Generate an image using DALL-E',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Image generation prompt' },
                model: { type: 'string', enum: ['dall-e-2', 'dall-e-3'], description: 'DALL-E model (default dall-e-3)' },
                size: { type: 'string', enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'], description: 'Image size (default 1024x1024)' },
                quality: { type: 'string', enum: ['standard', 'hd'], description: 'Image quality (default standard)' },
                n: { type: 'number', description: 'Number of images to generate (default 1)' },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'create_moderation',
        description: 'Check text content for policy violations using OpenAI moderation',
        inputSchema: {
            type: 'object',
            properties: {
                input: { type: 'string', description: 'Text to check for policy violations' },
            },
            required: ['input'],
        },
    },
    {
        name: 'list_files',
        description: 'List files uploaded to OpenAI',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'list_fine_tuning_jobs',
        description: 'List fine-tuning jobs',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of jobs to retrieve (default 10, max 100)' },
            },
        },
    },
];

async function oai(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${OPENAI_API}${path}`, {
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
        throw new Error(`OpenAI API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'chat_completion': {
            const model = (args.model as string) ?? 'gpt-4o-mini';
            const messages = args.messages as Array<{ role: string; content: string }>;
            if (!messages || !Array.isArray(messages) || messages.length === 0) {
                throw new Error('messages is required and must be a non-empty array');
            }
            const body: Record<string, unknown> = { model, messages };
            if (args.temperature !== undefined) body.temperature = Number(args.temperature);
            if (args.max_tokens !== undefined) body.max_tokens = Number(args.max_tokens);

            const data = await oai('/chat/completions', token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;

            const choice = data.choices?.[0];
            return {
                id: data.id,
                model: data.model,
                message: choice?.message ?? null,
                finish_reason: choice?.finish_reason ?? null,
                usage: data.usage ?? null,
            };
        }

        case 'list_models': {
            const data = await oai('/models', token) as any;
            const models = (data.data ?? []) as any[];
            return models
                .sort((a: any, b: any) => (b.created ?? 0) - (a.created ?? 0))
                .slice(0, 50)
                .map((m: any) => ({
                    id: m.id,
                    owned_by: m.owned_by,
                    created: m.created,
                }));
        }

        case 'create_embedding': {
            const model = (args.model as string) ?? 'text-embedding-3-small';
            const input = args.input as string;
            if (!input) throw new Error('input is required');

            const data = await oai('/embeddings', token, {
                method: 'POST',
                body: JSON.stringify({ model, input }),
            }) as any;

            const embedding = data.data?.[0]?.embedding ?? [];
            return {
                embedding_preview: embedding.slice(0, 10),
                dimensions: embedding.length,
                model: data.model,
                usage: data.usage ?? null,
            };
        }

        case 'create_image': {
            const prompt = args.prompt as string;
            if (!prompt) throw new Error('prompt is required');

            const body: Record<string, unknown> = {
                prompt,
                model: (args.model as string) ?? 'dall-e-3',
                size: (args.size as string) ?? '1024x1024',
                quality: (args.quality as string) ?? 'standard',
                n: Math.min(Number(args.n ?? 1), 4),
            };

            const data = await oai('/images/generations', token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;

            return (data.data ?? []).map((img: any) => ({
                url: img.url,
                revised_prompt: img.revised_prompt ?? null,
            }));
        }

        case 'create_moderation': {
            const input = args.input as string;
            if (!input) throw new Error('input is required');

            const data = await oai('/moderations', token, {
                method: 'POST',
                body: JSON.stringify({ input }),
            }) as any;

            const result = data.results?.[0];
            return {
                flagged: result?.flagged ?? false,
                categories: result?.categories ?? {},
                category_scores: result?.category_scores ?? {},
            };
        }

        case 'list_files': {
            const data = await oai('/files', token) as any;
            return (data.data ?? []).map((f: any) => ({
                id: f.id,
                filename: f.filename,
                purpose: f.purpose,
                bytes: f.bytes,
                created_at: f.created_at,
            }));
        }

        case 'list_fine_tuning_jobs': {
            const limit = Math.min(Number(args.limit ?? 10), 100);
            const data = await oai(`/fine_tuning/jobs?limit=${limit}`, token) as any;
            return (data.data ?? []).map((j: any) => ({
                id: j.id,
                model: j.model,
                fine_tuned_model: j.fine_tuned_model ?? null,
                status: j.status,
                created_at: j.created_at,
            }));
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'openai-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'openai-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            // Read token from injected secret header (underscore key -> hyphen header)
            const token = request.headers.get('X-Mcp-Secret-OPENAI-API-KEY');
            if (!token) {
                return rpcErr(id, -32001, 'Missing OPENAI_API_KEY secret — add it to your workspace secrets');
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
