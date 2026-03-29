/**
 * Vapi MCP Worker
 * Implements MCP protocol over HTTP for Vapi Voice AI API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   VAPI_API_KEY → X-Mcp-Secret-VAPI-API-KEY
 *
 * Auth format: Authorization: Bearer {api_key}
 * Covers: assistants (5), calls (3), phone numbers (1) = 9 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const VAPI_API_BASE = 'https://api.vapi.ai';

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
    return request.headers.get('X-Mcp-Secret-VAPI-API-KEY');
}

async function vapiFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const res = await fetch(`${VAPI_API_BASE}${path}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (res.status === 204) return { success: true };
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        const msg = (err as { message?: string }).message ?? res.statusText;
        throw { code: -32603, message: `Vapi API error ${res.status}: ${msg}` };
    }
    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_assistants',
        description: 'List all voice assistants in your Vapi account with their configurations, voices, and models.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of assistants to return (default: 10)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_assistant',
        description: 'Get full configuration details for a specific Vapi voice assistant including voice, model, and first message settings.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Assistant ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_assistant',
        description: 'Create a new Vapi voice assistant with a model, voice, and first message configuration.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Assistant name',
                },
                model_provider: {
                    type: 'string',
                    description: 'LLM provider (e.g. "openai", "anthropic")',
                },
                model_name: {
                    type: 'string',
                    description: 'LLM model name (e.g. "gpt-4o", "claude-3-5-sonnet-20241022")',
                },
                system_message: {
                    type: 'string',
                    description: 'System prompt for the assistant',
                },
                voice_provider: {
                    type: 'string',
                    description: 'Voice provider (e.g. "11labs", "azure", "openai")',
                },
                voice_id: {
                    type: 'string',
                    description: 'Voice ID from the provider',
                },
                first_message: {
                    type: 'string',
                    description: 'First message the assistant says when a call starts',
                },
            },
            required: ['name', 'model_provider', 'model_name', 'voice_provider', 'voice_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_assistant',
        description: 'Update configuration of an existing Vapi voice assistant. Only provided fields are updated.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Assistant ID to update',
                },
                name: {
                    type: 'string',
                    description: 'New assistant name',
                },
                first_message: {
                    type: 'string',
                    description: 'New first message',
                },
                system_message: {
                    type: 'string',
                    description: 'Updated system prompt',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_assistant',
        description: 'Delete a Vapi voice assistant. This action cannot be undone.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Assistant ID to delete',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_calls',
        description: 'List recent calls made through Vapi with status, duration, and transcript availability.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of calls to return (default: 10)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_call',
        description: 'Get details about a specific call including full transcript, recording URL, duration, and cost.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Call ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_call',
        description: 'Initiate an outbound phone call using a Vapi assistant to a customer phone number.',
        inputSchema: {
            type: 'object',
            properties: {
                assistant_id: {
                    type: 'string',
                    description: 'ID of the assistant to use for the call',
                },
                customer_number: {
                    type: 'string',
                    description: 'Customer phone number to call (E.164 format, e.g. "+15551234567")',
                },
                phone_number_id: {
                    type: 'string',
                    description: 'ID of the Vapi phone number to call from (optional)',
                },
            },
            required: ['assistant_id', 'customer_number'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_phone_numbers',
        description: 'List all provisioned phone numbers in your Vapi account with their providers and capabilities.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of phone numbers to return (default: 10)',
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
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case 'list_assistants': {
            const limit = (args.limit as number) ?? 10;
            return vapiFetch(`/assistant?limit=${limit}`, apiKey);
        }

        case 'get_assistant': {
            if (!args.id) throw new Error('Missing required parameter: id');
            return vapiFetch(`/assistant/${args.id as string}`, apiKey);
        }

        case 'create_assistant': {
            const body: Record<string, unknown> = {
                name: args.name,
                model: {
                    provider: args.model_provider,
                    model: args.model_name,
                    messages: args.system_message ? [{ role: 'system', content: args.system_message }] : [],
                },
                voice: {
                    provider: args.voice_provider,
                    voiceId: args.voice_id,
                },
            };
            if (args.first_message) body.firstMessage = args.first_message;
            return vapiFetch('/assistant', apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'update_assistant': {
            if (!args.id) throw new Error('Missing required parameter: id');
            const patch: Record<string, unknown> = {};
            if (args.name !== undefined) patch.name = args.name;
            if (args.first_message !== undefined) patch.firstMessage = args.first_message;
            if (args.system_message !== undefined) {
                patch.model = { messages: [{ role: 'system', content: args.system_message }] };
            }
            return vapiFetch(`/assistant/${args.id as string}`, apiKey, {
                method: 'PATCH',
                body: JSON.stringify(patch),
            });
        }

        case 'delete_assistant': {
            if (!args.id) throw new Error('Missing required parameter: id');
            return vapiFetch(`/assistant/${args.id as string}`, apiKey, { method: 'DELETE' });
        }

        case 'list_calls': {
            const limit = (args.limit as number) ?? 10;
            return vapiFetch(`/call?limit=${limit}`, apiKey);
        }

        case 'get_call': {
            if (!args.id) throw new Error('Missing required parameter: id');
            return vapiFetch(`/call/${args.id as string}`, apiKey);
        }

        case 'create_call': {
            const body: Record<string, unknown> = {
                assistantId: args.assistant_id,
                customer: { number: args.customer_number },
            };
            if (args.phone_number_id) body.phoneNumberId = args.phone_number_id;
            return vapiFetch('/call', apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_phone_numbers': {
            const limit = (args.limit as number) ?? 10;
            return vapiFetch(`/phone-number?limit=${limit}`, apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-vapi', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-vapi', version: '1.0.0' },
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
            return rpcErr(id, -32001, 'Missing required secret — add VAPI_API_KEY to workspace secrets');
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
