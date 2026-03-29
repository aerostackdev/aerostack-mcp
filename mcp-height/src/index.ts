/**
 * Height MCP Worker
 * Implements MCP protocol over HTTP for Height project management operations.
 * Secrets received via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   HEIGHT_API_KEY → X-Mcp-Secret-HEIGHT-API-KEY
 *
 * Auth: Authorization: api-key {apiKey}
 * Base URL: https://api.height.app
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpcOk(id: string | number | null, result: unknown): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: string | number | null, code: number, message: string): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    const missing = fields.filter(f => args[f] === undefined || args[f] === null || args[f] === '');
    if (missing.length > 0) throw new Error(`Missing required fields: ${missing.join(', ')}`);
}

const API_BASE = 'https://api.height.app';

async function heightFetch(apiKey: string, path: string, options: RequestInit = {}): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `api-key ${apiKey}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });
    if (res.status === 204) return {};
    const text = await res.text();
    if (!text) return {};
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw { code: -32603, message: `Height HTTP ${res.status}: ${text}` }; }
    if (!res.ok) {
        const d = data as Record<string, unknown>;
        const msg = (d?.error as string) || (d?.message as string) || res.statusText;
        throw { code: -32603, message: `Height API error ${res.status}: ${msg}` };
    }
    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_lists',
        description: 'List all task lists in the workspace.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_list',
        description: 'Get details of a specific list.',
        inputSchema: {
            type: 'object',
            properties: { listId: { type: 'string', description: 'List ID' } },
            required: ['listId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_list',
        description: 'Create a new task list.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'List name' },
                description: { type: 'string', description: 'List description' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_tasks',
        description: 'List tasks in a specific list.',
        inputSchema: {
            type: 'object',
            properties: {
                listId: { type: 'string', description: 'List ID to fetch tasks from' },
                limit: { type: 'number', description: 'Max tasks to return (default: 50)' },
            },
            required: ['listId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_task',
        description: 'Get full details of a specific task.',
        inputSchema: {
            type: 'object',
            properties: { taskId: { type: 'string', description: 'Task ID' } },
            required: ['taskId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_task',
        description: 'Create a new task in a list.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Task name/title' },
                listId: { type: 'string', description: 'List ID to add the task to' },
                description: { type: 'string', description: 'Task description' },
                assigneesIds: { type: 'array', items: { type: 'string' }, description: 'Assignee user IDs' },
                status: { type: 'string', description: 'Initial task status' },
            },
            required: ['name', 'listId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_task',
        description: 'Update task name, description, status, assignees, or due date.',
        inputSchema: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'Task ID to update' },
                name: { type: 'string', description: 'Updated name' },
                description: { type: 'string', description: 'Updated description' },
                status: { type: 'string', description: 'Updated status' },
                assigneesIds: { type: 'array', items: { type: 'string' }, description: 'Updated assignee IDs' },
                dueAt: { type: 'string', description: 'Due date in ISO 8601 format' },
            },
            required: ['taskId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'delete_task',
        description: 'Permanently delete a task.',
        inputSchema: {
            type: 'object',
            properties: { taskId: { type: 'string', description: 'Task ID to delete' } },
            required: ['taskId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_users',
        description: 'List all workspace members.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_groups',
        description: 'List all groups in the workspace.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'search_tasks',
        description: 'Search tasks by query string.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
                limit: { type: 'number', description: 'Max results (default: 25)' },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_activities',
        description: 'List activity log for a task.',
        inputSchema: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'Task ID' },
                limit: { type: 'number', description: 'Max activities (default: 50)' },
            },
            required: ['taskId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_field',
        description: 'Create a custom field for a list.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Field name' },
                type: { type: 'string', description: 'Field type: text, number, date, select, multiSelect, checkbox' },
                listId: { type: 'string', description: 'List ID to add the field to' },
            },
            required: ['name', 'type', 'listId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_fields',
        description: 'List custom fields for a list.',
        inputSchema: {
            type: 'object',
            properties: { listId: { type: 'string', description: 'List ID' } },
            required: ['listId'],
        },
        annotations: { readOnlyHint: true },
    },
];

// ── Request handler ───────────────────────────────────────────────────────────

async function handleRequest(request: Request): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', mcp: 'mcp-height' }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    let body: { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
    try {
        body = await request.json() as typeof body;
    } catch {
        return rpcErr(null, -32700, 'Parse error: invalid JSON');
    }

    const id = body.id ?? null;

    if (body.method === 'initialize') {
        return rpcOk(id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'mcp-height', version: '1.0.0' },
        });
    }

    if (body.method === 'tools/list') {
        return rpcOk(id, { tools: TOOLS });
    }

    if (body.method === 'tools/call') {
        const apiKey = request.headers.get('X-Mcp-Secret-HEIGHT-API-KEY');
        if (!apiKey) return rpcErr(id, -32001, 'Missing required secret: HEIGHT_API_KEY');

        const toolName = (body.params?.name ?? '') as string;
        const args = (body.params?.arguments ?? {}) as Record<string, unknown>;

        try {
            const result = await dispatchTool(apiKey, toolName, args);
            return rpcOk(id, result);
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err) {
                const e = err as { code: number; message: string };
                return rpcErr(id, e.code, e.message);
            }
            return rpcErr(id, -32603, err instanceof Error ? err.message : String(err));
        }
    }

    return rpcErr(id, -32601, `Method not found: ${body.method}`);
}

async function dispatchTool(apiKey: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case 'list_lists': {
            const data = await heightFetch(apiKey, '/lists');
            return toolOk(data);
        }
        case 'get_list': {
            validateRequired(args, ['listId']);
            const data = await heightFetch(apiKey, `/lists/${args.listId}`);
            return toolOk(data);
        }
        case 'create_list': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.description) body.description = args.description;
            const data = await heightFetch(apiKey, '/lists', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            return toolOk(data);
        }
        case 'list_tasks': {
            validateRequired(args, ['listId']);
            const limit = (args.limit as number) ?? 50;
            const data = await heightFetch(apiKey, `/tasks?listIds[]=${args.listId}&limit=${limit}`);
            return toolOk(data);
        }
        case 'get_task': {
            validateRequired(args, ['taskId']);
            const data = await heightFetch(apiKey, `/tasks/${args.taskId}`);
            return toolOk(data);
        }
        case 'create_task': {
            validateRequired(args, ['name', 'listId']);
            const body: Record<string, unknown> = {
                name: args.name,
                listIds: [args.listId],
            };
            if (args.description) body.description = args.description;
            if (args.assigneesIds) body.assigneesIds = args.assigneesIds;
            if (args.status) body.status = args.status;
            const data = await heightFetch(apiKey, '/tasks', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            return toolOk(data);
        }
        case 'update_task': {
            validateRequired(args, ['taskId']);
            const { taskId, ...rest } = args;
            const data = await heightFetch(apiKey, `/tasks/${taskId}`, {
                method: 'PATCH',
                body: JSON.stringify(rest),
            });
            return toolOk(data);
        }
        case 'delete_task': {
            validateRequired(args, ['taskId']);
            await heightFetch(apiKey, `/tasks/${args.taskId}`, { method: 'DELETE' });
            return toolOk({ deleted: true });
        }
        case 'list_users': {
            const data = await heightFetch(apiKey, '/users');
            return toolOk(data);
        }
        case 'list_groups': {
            const data = await heightFetch(apiKey, '/groups');
            return toolOk(data);
        }
        case 'search_tasks': {
            validateRequired(args, ['query']);
            const limit = (args.limit as number) ?? 25;
            const data = await heightFetch(apiKey, `/tasks?query=${encodeURIComponent(args.query as string)}&limit=${limit}`);
            return toolOk(data);
        }
        case 'list_activities': {
            validateRequired(args, ['taskId']);
            const limit = (args.limit as number) ?? 50;
            const data = await heightFetch(apiKey, `/activities?taskId=${args.taskId}&limit=${limit}`);
            return toolOk(data);
        }
        case 'create_field': {
            validateRequired(args, ['name', 'type', 'listId']);
            const data = await heightFetch(apiKey, '/fields', {
                method: 'POST',
                body: JSON.stringify({ name: args.name, type: args.type, listId: args.listId }),
            });
            return toolOk(data);
        }
        case 'list_fields': {
            validateRequired(args, ['listId']);
            const data = await heightFetch(apiKey, `/fields?listId=${args.listId}`);
            return toolOk(data);
        }
        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

export default { fetch: handleRequest };
