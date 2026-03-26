/**
 * Typeform MCP Worker
 * Implements MCP protocol over HTTP for Typeform operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   TYPEFORM_API_TOKEN → X-Mcp-Secret-TYPEFORM-API-TOKEN
 *
 * Auth format: Bearer {token}
 *
 * Covers: Forms (5), Responses (5), Webhooks (3), Workspaces (2), Account (1) = 16 tools total
 */

// ── Constants ──────────────────────────────────────────────────────────────────

const SERVER_NAME = 'mcp-typeform';
const TYPEFORM_API_BASE = 'https://api.typeform.com';

// ── Tool definitions ───────────────────────────────────────────────────────────

const TOOLS = [
    // Forms
    {
        name: 'list_forms',
        description: 'List all forms in your Typeform account with pagination and search.',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (default: 1)' },
                page_size: { type: 'number', description: 'Results per page (default: 10)' },
                search: { type: 'string', description: 'Search query to filter forms by title' },
                workspace_id: { type: 'string', description: 'Filter by workspace ID' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_form',
        description: 'Get detailed information about a specific form including fields and settings.',
        inputSchema: {
            type: 'object',
            properties: {
                form_id: { type: 'string', description: 'The form ID to retrieve' },
            },
            required: ['form_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_form',
        description: 'Create a new Typeform form with fields, settings, and theme.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Form title' },
                fields: {
                    type: 'array',
                    description: 'Array of form field objects',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            title: { type: 'string' },
                            type: { type: 'string' },
                            ref: { type: 'string' },
                            validations: { type: 'object' },
                            properties: { type: 'object' },
                        },
                    },
                },
                settings: { type: 'object', description: 'Form settings (language, progress_bar, etc.)' },
                theme: { type: 'object', description: 'Theme reference with href' },
                workspace: { type: 'object', description: 'Workspace reference with href' },
            },
            required: ['title'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_form',
        description: 'Replace an entire form definition (full replacement via PUT).',
        inputSchema: {
            type: 'object',
            properties: {
                form_id: { type: 'string', description: 'The form ID to update' },
                title: { type: 'string', description: 'New form title' },
                fields: { type: 'array', description: 'New array of form fields' },
                settings: { type: 'object', description: 'Form settings' },
                theme: { type: 'object', description: 'Theme reference' },
                workspace: { type: 'object', description: 'Workspace reference' },
            },
            required: ['form_id', 'title'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_form',
        description: 'Permanently delete a form and all its responses.',
        inputSchema: {
            type: 'object',
            properties: {
                form_id: { type: 'string', description: 'The form ID to delete' },
            },
            required: ['form_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    // Responses
    {
        name: 'get_responses',
        description: 'Get responses for a form with filtering by date, completion status, and text search.',
        inputSchema: {
            type: 'object',
            properties: {
                form_id: { type: 'string', description: 'The form ID to get responses for' },
                page_size: { type: 'number', description: 'Number of responses (default: 25, max: 1000)' },
                since: { type: 'string', description: 'Filter responses submitted after this datetime (ISO 8601)' },
                until: { type: 'string', description: 'Filter responses submitted before this datetime (ISO 8601)' },
                after: { type: 'string', description: 'Return responses after this response token' },
                before: { type: 'string', description: 'Return responses before this response token' },
                completed: { type: 'boolean', description: 'Filter by completion status' },
                query: { type: 'string', description: 'Search query to filter responses' },
            },
            required: ['form_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_response',
        description: 'Get a specific response by response ID.',
        inputSchema: {
            type: 'object',
            properties: {
                form_id: { type: 'string', description: 'The form ID' },
                response_id: { type: 'string', description: 'The response ID to retrieve' },
            },
            required: ['form_id', 'response_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_responses',
        description: 'Delete one or more responses from a form.',
        inputSchema: {
            type: 'object',
            properties: {
                form_id: { type: 'string', description: 'The form ID' },
                response_ids: {
                    description: 'Array of response IDs or comma-separated string of IDs to delete',
                    oneOf: [
                        { type: 'array', items: { type: 'string' } },
                        { type: 'string' },
                    ],
                },
            },
            required: ['form_id', 'response_ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_response_count',
        description: 'Get the total number of responses for a form.',
        inputSchema: {
            type: 'object',
            properties: {
                form_id: { type: 'string', description: 'The form ID to count responses for' },
            },
            required: ['form_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_responses',
        description: 'Search responses by text query.',
        inputSchema: {
            type: 'object',
            properties: {
                form_id: { type: 'string', description: 'The form ID to search responses in' },
                query: { type: 'string', description: 'Text search query' },
                page_size: { type: 'number', description: 'Number of results (default: 25)' },
            },
            required: ['form_id', 'query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    // Webhooks
    {
        name: 'list_webhooks',
        description: 'List all webhooks for a form.',
        inputSchema: {
            type: 'object',
            properties: {
                form_id: { type: 'string', description: 'The form ID to list webhooks for' },
            },
            required: ['form_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_webhook',
        description: 'Create or update a webhook for a form using a tag identifier.',
        inputSchema: {
            type: 'object',
            properties: {
                form_id: { type: 'string', description: 'The form ID' },
                tag: { type: 'string', description: 'Unique webhook tag/name identifier' },
                url: { type: 'string', description: 'The HTTPS URL to send webhook events to' },
                secret: { type: 'string', description: 'Optional secret for webhook signature verification' },
                verify_ssl: { type: 'boolean', description: 'Whether to verify SSL certificate (default: true)' },
            },
            required: ['form_id', 'tag', 'url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_webhook',
        description: 'Delete a webhook from a form by its tag.',
        inputSchema: {
            type: 'object',
            properties: {
                form_id: { type: 'string', description: 'The form ID' },
                tag: { type: 'string', description: 'The webhook tag to delete' },
            },
            required: ['form_id', 'tag'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    // Workspaces
    {
        name: 'list_workspaces',
        description: 'List all workspaces in your Typeform account.',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (default: 1)' },
                page_size: { type: 'number', description: 'Results per page (default: 10)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_workspace',
        description: 'Get details about a specific workspace.',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: { type: 'string', description: 'The workspace ID to retrieve' },
            },
            required: ['workspace_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    // Account
    {
        name: 'get_me',
        description: 'Get information about the authenticated Typeform account.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Auth helper ────────────────────────────────────────────────────────────────

function getToken(request: Request): string | null {
    return request.headers.get('X-Mcp-Secret-TYPEFORM-API-TOKEN');
}

// ── Typeform API fetch helper ──────────────────────────────────────────────────

async function typeformFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${TYPEFORM_API_BASE}${path}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) || {}),
        },
    });
    if (res.status === 204) return {};
    if (!res.ok) {
        const err = await res.json().catch(() => ({ description: res.statusText })) as Record<string, unknown>;
        const msg = (err.description as string) || (err.message as string) || res.statusText;
        throw { code: -32603, message: `Typeform API error ${res.status}: ${msg}` };
    }
    return res.json();
}

// ── Tool implementation ────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        // ── Forms ──────────────────────────────────────────────────────────────
        case 'list_forms': {
            const params = new URLSearchParams({
                page: String(args.page || 1),
                page_size: String(args.page_size || 10),
            });
            if (args.search) params.set('search', args.search as string);
            if (args.workspace_id) params.set('workspace_id', args.workspace_id as string);
            return typeformFetch(`/forms?${params}`, token);
        }

        case 'get_form': {
            if (!args.form_id) throw { code: -32602, message: 'Missing required parameter: form_id' };
            return typeformFetch(`/forms/${args.form_id}`, token);
        }

        case 'create_form': {
            if (!args.title) throw { code: -32602, message: 'Missing required parameter: title' };
            const body: Record<string, unknown> = { title: args.title };
            if (args.fields) body.fields = args.fields;
            if (args.settings) body.settings = args.settings;
            if (args.theme) body.theme = args.theme;
            if (args.workspace) body.workspace = args.workspace;
            return typeformFetch('/forms', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_form': {
            if (!args.form_id) throw { code: -32602, message: 'Missing required parameter: form_id' };
            if (!args.title) throw { code: -32602, message: 'Missing required parameter: title' };
            const body: Record<string, unknown> = { title: args.title };
            if (args.fields) body.fields = args.fields;
            if (args.settings) body.settings = args.settings;
            if (args.theme) body.theme = args.theme;
            if (args.workspace) body.workspace = args.workspace;
            return typeformFetch(`/forms/${args.form_id}`, token, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'delete_form': {
            if (!args.form_id) throw { code: -32602, message: 'Missing required parameter: form_id' };
            return typeformFetch(`/forms/${args.form_id}`, token, { method: 'DELETE' });
        }

        // ── Responses ─────────────────────────────────────────────────────────
        case 'get_responses': {
            if (!args.form_id) throw { code: -32602, message: 'Missing required parameter: form_id' };
            const params = new URLSearchParams({
                page_size: String(args.page_size || 25),
                sort: 'submitted_at,desc',
            });
            if (args.since) params.set('since', args.since as string);
            if (args.until) params.set('until', args.until as string);
            if (args.after) params.set('after', args.after as string);
            if (args.before) params.set('before', args.before as string);
            if (args.completed !== undefined) params.set('completed', String(args.completed));
            if (args.query) params.set('query', args.query as string);
            return typeformFetch(`/forms/${args.form_id}/responses?${params}`, token);
        }

        case 'get_response': {
            if (!args.form_id) throw { code: -32602, message: 'Missing required parameter: form_id' };
            if (!args.response_id) throw { code: -32602, message: 'Missing required parameter: response_id' };
            const params = new URLSearchParams({ included_response_ids: args.response_id as string });
            return typeformFetch(
                `/forms/${args.form_id}/responses?${params}`,
                token,
            );
        }

        case 'delete_responses': {
            if (!args.form_id) throw { code: -32602, message: 'Missing required parameter: form_id' };
            if (!args.response_ids) throw { code: -32602, message: 'Missing required parameter: response_ids' };
            const ids = Array.isArray(args.response_ids)
                ? (args.response_ids as string[]).join(',')
                : (args.response_ids as string);
            const params = new URLSearchParams({ included_response_ids: ids });
            return typeformFetch(
                `/forms/${args.form_id}/responses?${params}`,
                token,
                { method: 'DELETE' },
            );
        }

        case 'get_response_count': {
            if (!args.form_id) throw { code: -32602, message: 'Missing required parameter: form_id' };
            const data = await typeformFetch(`/forms/${args.form_id}/responses?page_size=1`, token) as Record<string, unknown>;
            return { form_id: args.form_id, total_items: data.total_items };
        }

        case 'search_responses': {
            if (!args.form_id) throw { code: -32602, message: 'Missing required parameter: form_id' };
            if (!args.query) throw { code: -32602, message: 'Missing required parameter: query' };
            const params = new URLSearchParams({
                query: args.query as string,
                page_size: String(args.page_size || 25),
            });
            return typeformFetch(`/forms/${args.form_id}/responses?${params}`, token);
        }

        // ── Webhooks ──────────────────────────────────────────────────────────
        case 'list_webhooks': {
            if (!args.form_id) throw { code: -32602, message: 'Missing required parameter: form_id' };
            return typeformFetch(`/forms/${args.form_id}/webhooks`, token);
        }

        case 'create_webhook': {
            if (!args.form_id) throw { code: -32602, message: 'Missing required parameter: form_id' };
            if (!args.tag) throw { code: -32602, message: 'Missing required parameter: tag' };
            if (!args.url) throw { code: -32602, message: 'Missing required parameter: url' };
            return typeformFetch(`/forms/${args.form_id}/webhooks/${args.tag}`, token, {
                method: 'PUT',
                body: JSON.stringify({
                    url: args.url,
                    enabled: true,
                    secret: args.secret || '',
                    verify_ssl: args.verify_ssl !== false,
                }),
            });
        }

        case 'delete_webhook': {
            if (!args.form_id) throw { code: -32602, message: 'Missing required parameter: form_id' };
            if (!args.tag) throw { code: -32602, message: 'Missing required parameter: tag' };
            return typeformFetch(`/forms/${args.form_id}/webhooks/${args.tag}`, token, { method: 'DELETE' });
        }

        // ── Workspaces ────────────────────────────────────────────────────────
        case 'list_workspaces': {
            const params = new URLSearchParams({
                page: String(args.page || 1),
                page_size: String(args.page_size || 10),
            });
            return typeformFetch(`/workspaces?${params}`, token);
        }

        case 'get_workspace': {
            if (!args.workspace_id) throw { code: -32602, message: 'Missing required parameter: workspace_id' };
            return typeformFetch(`/workspaces/${args.workspace_id}`, token);
        }

        // ── Account ───────────────────────────────────────────────────────────
        case 'get_me': {
            return typeformFetch('/me', token);
        }

        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

// ── JSON-RPC response helpers ──────────────────────────────────────────────────

function jsonRpc(id: unknown, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function jsonRpcError(id: unknown, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

// ── Worker entry point ─────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: SERVER_NAME, tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        // Parse JSON-RPC body
        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json() as typeof body;
        } catch {
            return jsonRpcError(null, -32700, 'Parse error: invalid JSON');
        }

        const { id, method, params } = body;

        // Handle protocol methods
        if (method === 'initialize') {
            return jsonRpc(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: SERVER_NAME, version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return jsonRpc(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = (params?.name as string) || '';
            const toolArgs = (params?.arguments as Record<string, unknown>) || {};

            // Check auth
            const token = getToken(request);
            if (!token) {
                return jsonRpcError(
                    id,
                    -32001,
                    'Missing required secret: TYPEFORM_API_TOKEN. Provide via X-Mcp-Secret-TYPEFORM-API-TOKEN header.',
                );
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
                return jsonRpc(id, {
                    content: [{ type: 'text', text: JSON.stringify(result) }],
                });
            } catch (err) {
                const e = err as { code?: number; message?: string };
                const code = e.code ?? -32603;
                const message = e.message ?? 'Internal error';
                return jsonRpcError(id, code, message);
            }
        }

        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    },
};
