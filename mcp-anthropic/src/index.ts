/**
 * Anthropic MCP Worker
 * Implements MCP protocol over HTTP for Anthropic API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   ANTHROPIC_API_KEY → X-Mcp-Secret-ANTHROPIC-API-KEY
 *
 * Auth format: x-api-key: {apiKey}
 * Covers: Messages (4), Models (2), Message Batches (3), Admin (3) = 12 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

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

function getToken(request: Request): string | null {
    return request.headers.get('X-Mcp-Secret-ANTHROPIC-API-KEY');
}

async function anthropicFetch(
    path: string,
    token: string,
    options: RequestInit = {},
    extraHeaders: Record<string, string> = {},
): Promise<unknown> {
    const res = await fetch(`${ANTHROPIC_API_BASE}${path}`, {
        ...options,
        headers: {
            'x-api-key': token,
            'anthropic-version': ANTHROPIC_VERSION,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
            ...extraHeaders,
        },
    });
    if (res.status === 204) return {};
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        const msg = (err as { error?: { message?: string } }).error?.message ?? res.statusText;
        throw { code: -32603, message: `Anthropic API error ${res.status}: ${msg}` };
    }
    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Anthropic credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 1 — Messages (4 tools) ─────────────────────────────────────────

    {
        name: 'create_message',
        description: 'Send a message to a Claude model and get a response. Core tool for AI conversations — supports system prompts, temperature control, and stop sequences. Stream is always false (CF Workers stateless).',
        inputSchema: {
            type: 'object',
            properties: {
                messages: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            role: { type: 'string', enum: ['user', 'assistant'], description: 'Message role' },
                            content: { type: 'string', description: 'Message content text' },
                        },
                        required: ['role', 'content'],
                    },
                    description: 'Array of conversation messages. Must alternate user/assistant, starting with user.',
                },
                model: {
                    type: 'string',
                    description: `Claude model ID (default: ${DEFAULT_MODEL}). Options: claude-opus-4-5, claude-sonnet-4-6, claude-haiku-3-5`,
                },
                max_tokens: {
                    type: 'number',
                    description: 'Maximum tokens in the response (default: 1024)',
                },
                system: {
                    type: 'string',
                    description: 'System prompt to set the assistant persona and context',
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature 0-1 (default: 1). Lower = more deterministic, higher = more creative',
                },
                top_p: {
                    type: 'number',
                    description: 'Nucleus sampling probability 0-1. Alternative to temperature.',
                },
                stop_sequences: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Custom stop sequences — model stops generating when any sequence is encountered',
                },
            },
            required: ['messages'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_message_with_tools',
        description: 'Send a message to Claude with tool/function definitions. Claude can respond with tool use blocks. Supports tool_choice to control which tools are called.',
        inputSchema: {
            type: 'object',
            properties: {
                messages: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            role: { type: 'string', enum: ['user', 'assistant'] },
                            content: { description: 'Message content (string or content block array)' },
                        },
                        required: ['role', 'content'],
                    },
                    description: 'Conversation messages. Include tool_result blocks for tool call responses.',
                },
                tools: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Tool name (snake_case)' },
                            description: { type: 'string', description: 'What this tool does' },
                            input_schema: {
                                type: 'object',
                                description: 'JSON Schema for tool parameters',
                            },
                        },
                        required: ['name', 'description', 'input_schema'],
                    },
                    description: 'Tool definitions available to Claude',
                },
                model: {
                    type: 'string',
                    description: `Claude model ID (default: ${DEFAULT_MODEL})`,
                },
                max_tokens: {
                    type: 'number',
                    description: 'Maximum tokens in response (default: 1024)',
                },
                system: {
                    type: 'string',
                    description: 'System prompt',
                },
                tool_choice: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['auto', 'any', 'tool'],
                            description: 'auto=Claude decides, any=must use a tool, tool=must use specific tool',
                        },
                        name: {
                            type: 'string',
                            description: 'Tool name (required when type is "tool")',
                        },
                    },
                    required: ['type'],
                    description: 'Control which tools Claude uses',
                },
            },
            required: ['messages', 'tools'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'count_tokens',
        description: 'Count the number of input tokens for a given request without sending it. Use to estimate costs and check if request fits within context window before sending.',
        inputSchema: {
            type: 'object',
            properties: {
                model: {
                    type: 'string',
                    description: `Claude model ID (default: ${DEFAULT_MODEL})`,
                },
                messages: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            role: { type: 'string', enum: ['user', 'assistant'] },
                            content: { type: 'string' },
                        },
                        required: ['role', 'content'],
                    },
                    description: 'Messages to count tokens for',
                },
                system: {
                    type: 'string',
                    description: 'System prompt to include in token count',
                },
                tools: {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Tool definitions to include in token count',
                },
            },
            required: ['messages'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_message_batch',
        description: 'Create a batch of message requests to be processed asynchronously. More efficient for large volumes. Returns a batch ID — use get_batch to poll status and retrieve results.',
        inputSchema: {
            type: 'object',
            properties: {
                requests: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            custom_id: {
                                type: 'string',
                                description: 'Your unique identifier for this request (used to match results)',
                            },
                            params: {
                                type: 'object',
                                properties: {
                                    model: { type: 'string', description: `Model to use (default: ${DEFAULT_MODEL})` },
                                    max_tokens: { type: 'number', description: 'Max tokens (default: 1024)' },
                                    messages: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                role: { type: 'string', enum: ['user', 'assistant'] },
                                                content: { type: 'string' },
                                            },
                                            required: ['role', 'content'],
                                        },
                                    },
                                },
                                required: ['model', 'max_tokens', 'messages'],
                            },
                        },
                        required: ['custom_id', 'params'],
                    },
                    description: 'Array of message requests to batch process',
                },
            },
            required: ['requests'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 2 — Models (2 tools) ────────────────────────────────────────────

    {
        name: 'list_models',
        description: 'List all available Claude models. Returns model IDs, display names, and creation dates. Use to discover available models before calling create_message.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_model',
        description: 'Get details about a specific Claude model by ID — display name, type, creation date.',
        inputSchema: {
            type: 'object',
            properties: {
                model_id: {
                    type: 'string',
                    description: 'Model ID (e.g. "claude-sonnet-4-6", "claude-opus-4-5")',
                },
            },
            required: ['model_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Message Batches (3 tools) ───────────────────────────────────

    {
        name: 'list_batches',
        description: 'List message batch jobs. Returns batch IDs, status (in_progress, ended, canceling, canceled), request counts, and timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of batches to return (default: 20, max: 100)',
                },
                before_id: {
                    type: 'string',
                    description: 'Pagination cursor — return batches before this batch ID',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_batch',
        description: 'Get the status and details of a specific message batch. Returns processing status, request counts (processing/succeeded/errored/canceled/expired), and result URL when complete.',
        inputSchema: {
            type: 'object',
            properties: {
                message_batch_id: {
                    type: 'string',
                    description: 'Message batch ID (e.g. "msgbatch_01xyz...")',
                },
            },
            required: ['message_batch_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'cancel_batch',
        description: 'Cancel an in-progress message batch. Already-completed requests in the batch are not affected. Returns updated batch status.',
        inputSchema: {
            type: 'object',
            properties: {
                message_batch_id: {
                    type: 'string',
                    description: 'Message batch ID to cancel',
                },
            },
            required: ['message_batch_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Admin (3 tools) — requires Admin API key ───────────────────

    {
        name: 'list_workspaces',
        description: 'List all workspaces in the organization (Admin API). Requires an Admin API key with organization:read permission. Returns workspace IDs, names, and billing info.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of workspaces to return (default: 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_usage',
        description: 'Get API usage and billing data (Admin API). Requires an Admin API key with billing:read permission. Returns token usage and cost breakdowns.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_api_keys',
        description: 'List all API keys in the organization (Admin API). Requires an Admin API key with organization:read permission. Returns key IDs, names, status, and creation dates.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of API keys to return (default: 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {

        case '_ping': {
            await anthropicFetch('/models', token);
            return toolOk({ connected: true, service: 'Anthropic' });
        }

        // ── Messages ──────────────────────────────────────────────────────────

        case 'create_message': {
            const body: Record<string, unknown> = {
                model: (args.model as string) || DEFAULT_MODEL,
                max_tokens: (args.max_tokens as number) || 1024,
                messages: args.messages,
            };
            if (args.system) body.system = args.system;
            if (args.temperature !== undefined) body.temperature = args.temperature;
            if (args.top_p !== undefined) body.top_p = args.top_p;
            if (args.stop_sequences) body.stop_sequences = args.stop_sequences;
            body.stream = false; // always false — streaming not supported in stateless CF Workers
            return anthropicFetch('/messages', token, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'create_message_with_tools': {
            const body: Record<string, unknown> = {
                model: (args.model as string) || DEFAULT_MODEL,
                max_tokens: (args.max_tokens as number) || 1024,
                messages: args.messages,
                tools: args.tools,
                stream: false,
            };
            if (args.system) body.system = args.system;
            if (args.tool_choice) body.tool_choice = args.tool_choice;
            return anthropicFetch('/messages', token, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'count_tokens': {
            const body: Record<string, unknown> = {
                model: (args.model as string) || DEFAULT_MODEL,
                messages: args.messages,
            };
            if (args.system) body.system = args.system;
            if (args.tools) body.tools = args.tools;
            return anthropicFetch('/messages/count_tokens', token, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'create_message_batch': {
            return anthropicFetch('/messages/batches', token, {
                method: 'POST',
                body: JSON.stringify({ requests: args.requests }),
            });
        }

        // ── Models ────────────────────────────────────────────────────────────

        case 'list_models': {
            return anthropicFetch('/models', token);
        }

        case 'get_model': {
            if (!args.model_id) throw new Error('Missing required parameter: model_id');
            return anthropicFetch(`/models/${args.model_id as string}`, token);
        }

        // ── Message Batches ───────────────────────────────────────────────────

        case 'list_batches': {
            const limit = (args.limit as number) ?? 20;
            let path = `/messages/batches?limit=${limit}`;
            if (args.before_id) path += `&before_id=${encodeURIComponent(args.before_id as string)}`;
            return anthropicFetch(path, token);
        }

        case 'get_batch': {
            if (!args.message_batch_id) throw new Error('Missing required parameter: message_batch_id');
            return anthropicFetch(`/messages/batches/${args.message_batch_id as string}`, token);
        }

        case 'cancel_batch': {
            if (!args.message_batch_id) throw new Error('Missing required parameter: message_batch_id');
            return anthropicFetch(
                `/messages/batches/${args.message_batch_id as string}/cancel`,
                token,
                { method: 'POST', body: JSON.stringify({}) },
            );
        }

        // ── Admin ─────────────────────────────────────────────────────────────

        case 'list_workspaces': {
            const limit = (args.limit as number) ?? 20;
            return anthropicFetch(
                `/organizations/workspaces?limit=${limit}`,
                token,
                {},
                { 'anthropic-beta': 'admin-api-2024-05-01' },
            );
        }

        case 'get_usage': {
            return anthropicFetch(
                '/usage',
                token,
                {},
                { 'anthropic-beta': 'admin-api-2024-05-01' },
            );
        }

        case 'list_api_keys': {
            const limit = (args.limit as number) ?? 20;
            return anthropicFetch(
                `/api_keys?limit=${limit}`,
                token,
                {},
                { 'anthropic-beta': 'admin-api-2024-05-01' },
            );
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-anthropic', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        // Parse JSON-RPC body
        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error — invalid JSON');
        }

        const { id, method, params } = body;

        // ── Protocol methods ──────────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-anthropic', version: '1.0.0' },
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

        // ── tools/call ────────────────────────────────────────────────────────

        // Extract secret from header
        const token = getToken(request);

        if (!token) {
            return rpcErr(
                id,
                -32001,
                'Missing required secret — add ANTHROPIC_API_KEY to workspace secrets',
            );
        }

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        try {
            const result = await callTool(toolName, args, token);
            return rpcOk(id, toolOk(result));
        } catch (err) {
            const e = err as { code?: number; message?: string } | Error;
            const msg = e instanceof Error ? e.message : ((e as { message?: string }).message ?? String(e));
            const code = (e as { code?: number }).code ?? -32603;
            return rpcErr(id, code, msg);
        }
    },
};
