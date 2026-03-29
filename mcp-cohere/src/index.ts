/**
 * Cohere MCP Worker
 * Implements MCP protocol over HTTP for Cohere AI operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   COHERE_API_KEY → X-Mcp-Secret-COHERE-API-KEY
 *
 * Auth: Authorization: Bearer {API_KEY}
 * Docs: https://docs.cohere.com/reference/about
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const COHERE_API_BASE = 'https://api.cohere.com/v2';

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
    return request.headers.get('X-Mcp-Secret-COHERE-API-KEY');
}

async function coherePost(path: string, apiKey: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${COHERE_API_BASE}${path}`, {
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
        throw new Error(`Cohere API ${res.status}: ${text}`);
    }
    return res.json();
}

async function cohereGet(path: string, apiKey: string): Promise<unknown> {
    const res = await fetch(`${COHERE_API_BASE}${path}`, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Cohere API ${res.status}: ${text}`);
    }
    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'chat',
        description: 'Send a message to a Cohere model and get a response. Supports multi-turn conversation history and optional grounding with documents',
        inputSchema: {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    description: 'The user message to send to the model',
                },
                model: {
                    type: 'string',
                    description: 'Cohere model to use (default: command-r-plus-08-2024)',
                    enum: [
                        'command-r-plus-08-2024',
                        'command-r-plus',
                        'command-r-08-2024',
                        'command-r',
                        'command',
                        'command-light',
                    ],
                },
                preamble: {
                    type: 'string',
                    description: 'System prompt / preamble to guide model behaviour',
                },
                chat_history: {
                    type: 'array',
                    description: 'Prior conversation turns as [{role: "USER"|"CHATBOT", message: "..."}]',
                    items: {
                        type: 'object',
                        properties: {
                            role: { type: 'string', enum: ['USER', 'CHATBOT'] },
                            message: { type: 'string' },
                        },
                    },
                },
                documents: {
                    type: 'array',
                    description: 'Documents to ground the response in. Each object can have any fields (id, title, text, etc.)',
                    items: { type: 'object' },
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature (0.0–1.0). Lower = more deterministic',
                },
                max_tokens: {
                    type: 'number',
                    description: 'Maximum number of tokens to generate',
                },
            },
            required: ['message'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'embed',
        description: 'Generate embeddings for a list of texts using Cohere Embed. Useful for semantic search and similarity comparison',
        inputSchema: {
            type: 'object',
            properties: {
                texts: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of strings to embed (max 96 per call)',
                },
                model: {
                    type: 'string',
                    description: 'Embedding model to use (default: embed-english-v3.0)',
                    enum: [
                        'embed-english-v3.0',
                        'embed-multilingual-v3.0',
                        'embed-english-light-v3.0',
                        'embed-multilingual-light-v3.0',
                    ],
                },
                input_type: {
                    type: 'string',
                    description: 'Input type for the embedding — use search_document for indexing, search_query for queries',
                    enum: ['search_document', 'search_query', 'classification', 'clustering'],
                },
                embedding_types: {
                    type: 'array',
                    items: { type: 'string', enum: ['float', 'int8', 'uint8', 'binary', 'ubinary'] },
                    description: 'Types of embeddings to return (default: ["float"])',
                },
                truncate: {
                    type: 'string',
                    description: 'How to handle texts that exceed the model context (default: END)',
                    enum: ['NONE', 'START', 'END'],
                },
            },
            required: ['texts', 'input_type'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'rerank',
        description: 'Rerank a list of documents by relevance to a query. Returns documents sorted by relevance score',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query to rank documents against',
                },
                documents: {
                    type: 'array',
                    description: 'Documents to rerank — either strings or objects with a "text" field',
                    items: {},
                },
                model: {
                    type: 'string',
                    description: 'Reranking model to use (default: rerank-english-v3.0)',
                    enum: [
                        'rerank-english-v3.0',
                        'rerank-multilingual-v3.0',
                        'rerank-english-light-v3.0',
                        'rerank-multilingual-light-v3.0',
                    ],
                },
                top_n: {
                    type: 'number',
                    description: 'Return only the top N results. Defaults to returning all documents',
                },
                return_documents: {
                    type: 'boolean',
                    description: 'Include the original document text in the response (default: true)',
                },
            },
            required: ['query', 'documents'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'classify',
        description: 'Classify texts into categories using few-shot examples. Provide example texts and their labels',
        inputSchema: {
            type: 'object',
            properties: {
                inputs: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of texts to classify',
                },
                examples: {
                    type: 'array',
                    description: 'Labeled examples: [{text: "...", label: "..."}]',
                    items: {
                        type: 'object',
                        properties: {
                            text: { type: 'string' },
                            label: { type: 'string' },
                        },
                    },
                },
                model: {
                    type: 'string',
                    description: 'Classification model to use (default: embed-english-v3.0)',
                },
                preset: {
                    type: 'string',
                    description: 'Use a saved preset instead of providing examples inline',
                },
            },
            required: ['inputs', 'examples'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'generate',
        description: 'Generate text completions using Cohere Generate (single-turn, lower latency than chat)',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'The input prompt for text generation',
                },
                model: {
                    type: 'string',
                    description: 'Model to use (default: command)',
                    enum: ['command', 'command-light', 'command-nightly', 'command-light-nightly'],
                },
                max_tokens: {
                    type: 'number',
                    description: 'Maximum number of tokens to generate (default: 1024)',
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature (0.0–5.0)',
                },
                k: {
                    type: 'number',
                    description: 'Top-k sampling parameter (0–500)',
                },
                p: {
                    type: 'number',
                    description: 'Top-p (nucleus) sampling parameter (0.01–0.99)',
                },
                stop_sequences: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Sequences that stop generation when encountered',
                },
                num_generations: {
                    type: 'number',
                    description: 'Number of alternative generations to return (1–5)',
                },
            },
            required: ['prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'tokenize',
        description: 'Tokenize text and return the token IDs and token strings for a given Cohere model',
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'Text to tokenize',
                },
                model: {
                    type: 'string',
                    description: 'Model whose tokenizer to use (default: command)',
                    enum: ['command', 'command-light', 'command-r', 'command-r-plus'],
                },
            },
            required: ['text', 'model'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'detokenize',
        description: 'Convert token IDs back to text using a Cohere model tokenizer',
        inputSchema: {
            type: 'object',
            properties: {
                tokens: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'Array of token IDs to convert back to text',
                },
                model: {
                    type: 'string',
                    description: 'Model whose tokenizer to use',
                    enum: ['command', 'command-light', 'command-r', 'command-r-plus'],
                },
            },
            required: ['tokens', 'model'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'detect_language',
        description: 'Detect the language of one or more text inputs',
        inputSchema: {
            type: 'object',
            properties: {
                texts: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of texts to detect the language of',
                },
            },
            required: ['texts'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'summarize',
        description: 'Summarize a document or long text using Cohere Summarize with configurable length and format',
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to summarize (min 250 characters)',
                },
                model: {
                    type: 'string',
                    description: 'Model to use for summarization (default: command)',
                    enum: ['command', 'command-light'],
                },
                length: {
                    type: 'string',
                    description: 'Length of the generated summary (default: medium)',
                    enum: ['short', 'medium', 'long'],
                },
                format: {
                    type: 'string',
                    description: 'Output format (default: paragraph)',
                    enum: ['paragraph', 'bullets'],
                },
                extractiveness: {
                    type: 'string',
                    description: 'How much to extract verbatim vs paraphrase (default: auto)',
                    enum: ['low', 'medium', 'high', 'auto'],
                },
                additional_command: {
                    type: 'string',
                    description: 'Free-form instruction to guide the summary (e.g. "Focus on technical details")',
                },
            },
            required: ['text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_models',
        description: 'List all available Cohere models with their capabilities, context lengths, and pricing',
        inputSchema: {
            type: 'object',
            properties: {
                page_size: { type: 'number', description: 'Number of models per page (default: 20)' },
                page_token: { type: 'string', description: 'Pagination token from a previous response' },
                endpoint: {
                    type: 'string',
                    description: 'Filter models by endpoint type',
                    enum: ['generate', 'embed', 'classify', 'summarize', 'rerank', 'chat', 'code'],
                },
                default_only: {
                    type: 'boolean',
                    description: 'Return only default models (one per endpoint)',
                },
            },
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
        case 'chat': {
            validateRequired(args, ['message']);

            const messages: { role: string; content: string }[] = [];

            // Map chat_history to the v2 messages format
            if (Array.isArray(args.chat_history)) {
                for (const turn of args.chat_history as any[]) {
                    messages.push({
                        role: turn.role === 'CHATBOT' ? 'assistant' : 'user',
                        content: turn.message,
                    });
                }
            }
            messages.push({ role: 'user', content: String(args.message) });

            const requestBody: Record<string, unknown> = {
                model: args.model ?? 'command-r-plus-08-2024',
                messages,
            };
            if (args.preamble) requestBody.system = args.preamble;
            if (args.temperature !== undefined) requestBody.temperature = args.temperature;
            if (args.max_tokens !== undefined) requestBody.max_tokens = args.max_tokens;
            if (args.documents) requestBody.documents = args.documents;

            const data = await coherePost('/chat', apiKey, requestBody) as any;
            return {
                text: data.message?.content?.[0]?.text ?? data.text ?? '',
                model: data.model ?? null,
                finish_reason: data.finish_reason ?? null,
                usage: data.usage ?? null,
                citations: data.message?.citations ?? [],
                documents: data.message?.documents ?? [],
            };
        }

        case 'embed': {
            validateRequired(args, ['texts', 'input_type']);
            if (!Array.isArray(args.texts) || args.texts.length === 0) {
                throw new Error('texts must be a non-empty array');
            }

            const requestBody: Record<string, unknown> = {
                texts: args.texts,
                model: args.model ?? 'embed-english-v3.0',
                input_type: args.input_type,
                embedding_types: args.embedding_types ?? ['float'],
            };
            if (args.truncate) requestBody.truncate = args.truncate;

            const data = await coherePost('/embed', apiKey, requestBody) as any;
            return {
                embeddings: data.embeddings ?? {},
                texts: data.texts ?? args.texts,
                model: data.model ?? null,
                response_type: data.response_type ?? 'embeddings_by_type',
            };
        }

        case 'rerank': {
            validateRequired(args, ['query', 'documents']);
            if (!Array.isArray(args.documents) || args.documents.length === 0) {
                throw new Error('documents must be a non-empty array');
            }

            const requestBody: Record<string, unknown> = {
                query: args.query,
                documents: args.documents,
                model: args.model ?? 'rerank-english-v3.0',
                return_documents: args.return_documents ?? true,
            };
            if (args.top_n !== undefined) requestBody.top_n = args.top_n;

            const data = await coherePost('/rerank', apiKey, requestBody) as any;
            return {
                results: (data.results ?? []).map((r: any) => ({
                    index: r.index,
                    relevance_score: r.relevance_score,
                    document: r.document ?? null,
                })),
                model: data.model ?? null,
                usage: data.meta?.billed_units ?? null,
            };
        }

        case 'classify': {
            validateRequired(args, ['inputs', 'examples']);
            if (!Array.isArray(args.inputs) || args.inputs.length === 0) {
                throw new Error('inputs must be a non-empty array');
            }
            if (!Array.isArray(args.examples) || args.examples.length === 0) {
                throw new Error('examples must be a non-empty array');
            }

            const requestBody: Record<string, unknown> = {
                inputs: args.inputs,
                examples: args.examples,
            };
            if (args.model) requestBody.model = args.model;
            if (args.preset) requestBody.preset = args.preset;

            const data = await coherePost('/classify', apiKey, requestBody) as any;
            return {
                classifications: (data.classifications ?? []).map((c: any) => ({
                    input: c.input,
                    prediction: c.prediction,
                    confidence: c.confidence,
                    labels: c.labels ?? {},
                })),
            };
        }

        case 'generate': {
            validateRequired(args, ['prompt']);

            const requestBody: Record<string, unknown> = {
                prompt: args.prompt,
                model: args.model ?? 'command',
                max_tokens: args.max_tokens ?? 1024,
            };
            if (args.temperature !== undefined) requestBody.temperature = args.temperature;
            if (args.k !== undefined) requestBody.k = args.k;
            if (args.p !== undefined) requestBody.p = args.p;
            if (args.stop_sequences) requestBody.stop_sequences = args.stop_sequences;
            if (args.num_generations !== undefined) requestBody.num_generations = args.num_generations;

            const data = await coherePost('/generate', apiKey, requestBody) as any;
            const generations = data.generations ?? [];
            return {
                text: generations[0]?.text ?? '',
                generations: generations.map((g: any) => ({
                    text: g.text,
                    finish_reason: g.finish_reason,
                    id: g.id,
                })),
                id: data.id ?? null,
                prompt: data.prompt ?? args.prompt,
            };
        }

        case 'tokenize': {
            validateRequired(args, ['text', 'model']);
            const data = await coherePost('/tokenize', apiKey, {
                text: args.text,
                model: args.model,
            }) as any;
            return {
                tokens: data.tokens ?? [],
                token_strings: data.token_strings ?? [],
                meta: data.meta ?? null,
            };
        }

        case 'detokenize': {
            validateRequired(args, ['tokens', 'model']);
            if (!Array.isArray(args.tokens) || args.tokens.length === 0) {
                throw new Error('tokens must be a non-empty array');
            }
            const data = await coherePost('/detokenize', apiKey, {
                tokens: args.tokens,
                model: args.model,
            }) as any;
            return {
                text: data.text ?? '',
                meta: data.meta ?? null,
            };
        }

        case 'detect_language': {
            validateRequired(args, ['texts']);
            if (!Array.isArray(args.texts) || args.texts.length === 0) {
                throw new Error('texts must be a non-empty array');
            }
            const data = await coherePost('/detect-language', apiKey, {
                texts: args.texts,
            }) as any;
            return {
                results: (data.results ?? []).map((r: any) => ({
                    language_code: r.language_code,
                    language_name: r.language_name,
                })),
            };
        }

        case 'summarize': {
            validateRequired(args, ['text']);
            const requestBody: Record<string, unknown> = {
                text: args.text,
                model: args.model ?? 'command',
                length: args.length ?? 'medium',
                format: args.format ?? 'paragraph',
                extractiveness: args.extractiveness ?? 'auto',
            };
            if (args.additional_command) requestBody.additional_command = args.additional_command;

            const data = await coherePost('/summarize', apiKey, requestBody) as any;
            return {
                summary: data.summary ?? '',
                id: data.id ?? null,
                meta: data.meta ?? null,
            };
        }

        case 'list_models': {
            const url = new URL(`${COHERE_API_BASE}/models`);
            if (args.page_size) url.searchParams.set('page_size', String(args.page_size));
            if (args.page_token) url.searchParams.set('page_token', String(args.page_token));
            if (args.endpoint) url.searchParams.set('endpoint', String(args.endpoint));
            if (args.default_only !== undefined) url.searchParams.set('default_only', String(args.default_only));

            const res = await fetch(url.toString(), {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json',
                },
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Cohere API ${res.status}: ${text}`);
            }
            const data = await res.json() as any;
            return {
                models: (data.models ?? []).map((m: any) => ({
                    name: m.name,
                    endpoints: m.endpoints ?? [],
                    finetuned: m.finetuned ?? false,
                    context_length: m.context_length ?? null,
                    tokenizer_url: m.tokenizer_url ?? null,
                })),
                next_page_token: data.next_page_token ?? null,
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
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-cohere', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-cohere', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = getApiKey(request);
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: COHERE_API_KEY (header: X-Mcp-Secret-COHERE-API-KEY)');
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
