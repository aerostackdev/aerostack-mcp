/**
 * Perplexity MCP Worker
 * Implements MCP protocol over HTTP for Perplexity AI search and chat.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   PERPLEXITY_API_KEY → X-Mcp-Secret-PERPLEXITY-API-KEY
 *
 * Auth: Authorization: Bearer {API_KEY}
 * Docs: https://docs.perplexity.ai/
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const PERPLEXITY_BASE = 'https://api.perplexity.ai';

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
    return request.headers.get('X-Mcp-Secret-PERPLEXITY-API-KEY');
}

interface ChatMessage {
    role: string;
    content: string;
}

interface ChatBody {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    return_images?: boolean;
    return_related_questions?: boolean;
    search_domain_filter?: string[];
    search_recency_filter?: string;
}

async function perplexityChat(apiKey: string, body: ChatBody): Promise<unknown> {
    const res = await fetch(`${PERPLEXITY_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Perplexity API ${res.status}: ${text}`);
    }
    return res.json();
}

function extractThinking(content: string): { thinking: string | null; answer: string } {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
        const thinking = thinkMatch[1].trim();
        const answer = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
        return { thinking, answer };
    }
    return { thinking: null, answer: content };
}

// ── Tools ─────────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'search',
        description: 'Search the web with Perplexity AI and get a synthesized answer with citations',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The search question or query' },
                model: {
                    type: 'string',
                    description: 'Model to use (default: sonar)',
                    enum: ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro', 'sonar-deep-research'],
                },
                system_prompt: { type: 'string', description: 'Optional system prompt to guide the response' },
                max_tokens: { type: 'number', description: 'Maximum tokens in the response' },
                temperature: { type: 'number', description: 'Sampling temperature (default: 0.2)' },
                search_domain_filter: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Filter results to/from specific domains. Prefix with - to exclude (e.g. ["-facebook.com"])',
                },
                return_images: { type: 'boolean', description: 'Include images in the response (default: false)' },
                return_related_questions: { type: 'boolean', description: 'Include related questions (default: false)' },
                search_recency_filter: {
                    type: 'string',
                    description: 'Filter results by recency',
                    enum: ['month', 'week', 'day', 'hour'],
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'chat',
        description: 'Chat with Perplexity AI with multi-turn conversation support and web search',
        inputSchema: {
            type: 'object',
            properties: {
                messages: {
                    type: 'array',
                    description: 'Array of message objects with role and content',
                    items: {
                        type: 'object',
                        properties: {
                            role: { type: 'string', enum: ['system', 'user', 'assistant'] },
                            content: { type: 'string' },
                        },
                    },
                },
                model: {
                    type: 'string',
                    description: 'Model to use (default: sonar)',
                    enum: ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro', 'sonar-deep-research'],
                },
                system_prompt: { type: 'string', description: 'Optional system prompt (prepended to messages)' },
                temperature: { type: 'number', description: 'Sampling temperature (default: 0.2)' },
                max_tokens: { type: 'number', description: 'Maximum tokens in the response' },
                search_domain_filter: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Filter results to/from domains',
                },
                search_recency_filter: {
                    type: 'string',
                    description: 'Filter results by recency',
                    enum: ['month', 'week', 'day', 'hour'],
                },
            },
            required: ['messages'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'deep_research',
        description: 'Perform deep multi-step research on a topic using Perplexity sonar-deep-research model',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The research topic or question' },
                system_prompt: { type: 'string', description: 'Optional system prompt to guide the research' },
                max_tokens: { type: 'number', description: 'Maximum tokens in the response' },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_with_reasoning',
        description: 'Search with step-by-step reasoning using Perplexity sonar-reasoning model',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The question to reason about and search for' },
                system_prompt: { type: 'string', description: 'Optional system prompt' },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_recent',
        description: 'Search for recent news and information filtered by time range',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The search query' },
                time_range: {
                    type: 'string',
                    description: 'How recent the results should be',
                    enum: ['hour', 'day', 'week', 'month'],
                },
                model: {
                    type: 'string',
                    description: 'Model to use (default: sonar)',
                    enum: ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro'],
                },
            },
            required: ['query', 'time_range'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_domains',
        description: 'Search with domain filtering — include or exclude specific websites',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The search query' },
                include_domains: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Domains to include in results (e.g. ["reddit.com", "github.com"])',
                },
                exclude_domains: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Domains to exclude from results (e.g. ["facebook.com"])',
                },
                model: {
                    type: 'string',
                    description: 'Model to use (default: sonar)',
                    enum: ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro'],
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_models',
        description: 'Get a list of available Perplexity AI models with descriptions and pricing',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'check_usage',
        description: 'Check token usage by making a minimal request and returning usage info',
        inputSchema: {
            type: 'object',
            properties: {},
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
        case 'search': {
            validateRequired(args, ['query']);
            const model = String(args.model ?? 'sonar');
            const messages: ChatMessage[] = [];
            if (args.system_prompt) {
                messages.push({ role: 'system', content: String(args.system_prompt) });
            }
            messages.push({ role: 'user', content: String(args.query) });

            const body: ChatBody = {
                model,
                messages,
                temperature: Number(args.temperature ?? 0.2),
                return_images: args.return_images === true,
                return_related_questions: args.return_related_questions === true,
            };
            if (args.max_tokens) body.max_tokens = Number(args.max_tokens);
            if (args.search_domain_filter) body.search_domain_filter = args.search_domain_filter as string[];
            if (args.search_recency_filter) body.search_recency_filter = String(args.search_recency_filter);

            const data = await perplexityChat(apiKey, body) as any;
            const choice = data?.choices?.[0];
            return {
                answer: choice?.message?.content ?? '',
                model: data?.model,
                citations: data?.citations ?? [],
                images: data?.images ?? null,
                related_questions: data?.related_questions ?? null,
                usage: data?.usage ?? null,
            };
        }

        case 'chat': {
            validateRequired(args, ['messages']);
            const model = String(args.model ?? 'sonar');
            const msgs = args.messages as ChatMessage[];
            const allMessages: ChatMessage[] = [];
            if (args.system_prompt) {
                allMessages.push({ role: 'system', content: String(args.system_prompt) });
            }
            allMessages.push(...msgs);

            const body: ChatBody = {
                model,
                messages: allMessages,
                temperature: Number(args.temperature ?? 0.2),
            };
            if (args.max_tokens) body.max_tokens = Number(args.max_tokens);
            if (args.search_domain_filter) body.search_domain_filter = args.search_domain_filter as string[];
            if (args.search_recency_filter) body.search_recency_filter = String(args.search_recency_filter);

            const data = await perplexityChat(apiKey, body) as any;
            const choice = data?.choices?.[0];
            return {
                content: choice?.message?.content ?? '',
                model: data?.model,
                citations: data?.citations ?? [],
                usage: data?.usage ?? null,
                finish_reason: choice?.finish_reason ?? null,
            };
        }

        case 'deep_research': {
            validateRequired(args, ['query']);
            const messages: ChatMessage[] = [];
            if (args.system_prompt) {
                messages.push({ role: 'system', content: String(args.system_prompt) });
            }
            messages.push({ role: 'user', content: String(args.query) });

            const body: ChatBody = {
                model: 'sonar-deep-research',
                messages,
                temperature: 0.2,
            };
            if (args.max_tokens) body.max_tokens = Number(args.max_tokens);

            const data = await perplexityChat(apiKey, body) as any;
            const choice = data?.choices?.[0];
            const content = choice?.message?.content ?? '';
            const { thinking, answer } = extractThinking(content);
            return {
                answer,
                citations: data?.citations ?? [],
                thinking,
                usage: data?.usage ?? null,
            };
        }

        case 'search_with_reasoning': {
            validateRequired(args, ['query']);
            const messages: ChatMessage[] = [];
            if (args.system_prompt) {
                messages.push({ role: 'system', content: String(args.system_prompt) });
            }
            messages.push({ role: 'user', content: String(args.query) });

            const data = await perplexityChat(apiKey, {
                model: 'sonar-reasoning',
                messages,
                temperature: 0.2,
            }) as any;
            const choice = data?.choices?.[0];
            const content = choice?.message?.content ?? '';
            const { thinking, answer } = extractThinking(content);
            return {
                answer,
                reasoning: thinking,
                citations: data?.citations ?? [],
                usage: data?.usage ?? null,
            };
        }

        case 'search_recent': {
            validateRequired(args, ['query', 'time_range']);
            const model = String(args.model ?? 'sonar');
            const data = await perplexityChat(apiKey, {
                model,
                messages: [{ role: 'user', content: String(args.query) }],
                temperature: 0.2,
                search_recency_filter: String(args.time_range),
            }) as any;
            const choice = data?.choices?.[0];
            return {
                answer: choice?.message?.content ?? '',
                citations: data?.citations ?? [],
                model: data?.model,
            };
        }

        case 'search_domains': {
            validateRequired(args, ['query']);
            const model = String(args.model ?? 'sonar');
            const include = (args.include_domains as string[] | undefined) ?? [];
            const exclude = ((args.exclude_domains as string[] | undefined) ?? []).map(d => `-${d}`);
            const domainFilter = [...include, ...exclude];

            const body: ChatBody = {
                model,
                messages: [{ role: 'user', content: String(args.query) }],
                temperature: 0.2,
            };
            if (domainFilter.length > 0) body.search_domain_filter = domainFilter;

            const data = await perplexityChat(apiKey, body) as any;
            const choice = data?.choices?.[0];
            return {
                answer: choice?.message?.content ?? '',
                citations: data?.citations ?? [],
                model: data?.model,
            };
        }

        case 'get_models': {
            return {
                models: [
                    {
                        id: 'sonar',
                        description: 'Lightweight, fast search model. Best for quick questions and simple searches.',
                        context_length: 127072,
                        pricing: { input_per_1m: 1.0, output_per_1m: 1.0, search_per_request: 0.005 },
                    },
                    {
                        id: 'sonar-pro',
                        description: 'Advanced search model with more comprehensive answers and higher accuracy.',
                        context_length: 200000,
                        pricing: { input_per_1m: 3.0, output_per_1m: 15.0, search_per_request: 0.005 },
                    },
                    {
                        id: 'sonar-reasoning',
                        description: 'Reasoning-augmented search model with step-by-step thinking. Includes <think> blocks.',
                        context_length: 127072,
                        pricing: { input_per_1m: 1.0, output_per_1m: 5.0, search_per_request: 0.005 },
                    },
                    {
                        id: 'sonar-reasoning-pro',
                        description: 'Advanced reasoning-augmented search model with deeper analytical capabilities.',
                        context_length: 200000,
                        pricing: { input_per_1m: 2.0, output_per_1m: 8.0, search_per_request: 0.005 },
                    },
                    {
                        id: 'sonar-deep-research',
                        description: 'Multi-step research model that performs autonomous web research to answer complex questions.',
                        context_length: 128000,
                        pricing: { input_per_1m: 2.0, output_per_1m: 8.0, search_per_request: 0.005 },
                    },
                ],
            };
        }

        case 'check_usage': {
            const data = await perplexityChat(apiKey, {
                model: 'sonar',
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1,
                temperature: 0,
            }) as any;
            return {
                usage: data?.usage ?? null,
                note: 'This reflects token usage for this probe request only. Visit https://www.perplexity.ai/account to view full usage and billing.',
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker ────────────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-perplexity', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: any;
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { jsonrpc, id, method, params } = body;
        if (jsonrpc !== '2.0') return rpcErr(id ?? null, -32600, 'Invalid Request');

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-perplexity', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = getApiKey(request);
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: PERPLEXITY_API_KEY');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, apiKey);
                return rpcOk(id, toolOk(result));
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
