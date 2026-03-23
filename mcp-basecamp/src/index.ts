/**
 * Basecamp MCP Worker
 * Implements MCP protocol over HTTP for Basecamp 4 API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: BASECAMP_ACCESS_TOKEN → header: X-Mcp-Secret-BASECAMP-ACCESS-TOKEN
 * Secret: BASECAMP_ACCOUNT_ID   → header: X-Mcp-Secret-BASECAMP-ACCOUNT-ID
 *
 * Basecamp API: https://3.basecampapi.com/{accountId}/
 * Docs: https://github.com/basecamp/bc3-api
 */

const USER_AGENT = 'AerostackMCP (hello@aerostack.dev)';

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
        name: '_ping',
        description: 'Verify Basecamp credentials by fetching account authorization. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'list_projects',
        description: 'List all active projects in the Basecamp account',
        inputSchema: {
            type: 'object',
            properties: {
                status: { type: 'string', description: 'Filter by status: active (default), archived, or trashed', enum: ['active', 'archived', 'trashed'] },
            },
        },
    },
    {
        name: 'get_project',
        description: 'Get details for a specific Basecamp project including its dock (tools)',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: { type: 'number', description: 'The project ID' },
            },
            required: ['project_id'],
        },
    },
    {
        name: 'list_todolists',
        description: 'List all to-do lists in a project',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: { type: 'number', description: 'The project ID' },
                todoset_id: { type: 'number', description: 'The to-do set ID (found in the project dock)' },
                status: { type: 'string', description: 'Filter: active (default), archived, or trashed', enum: ['active', 'archived', 'trashed'] },
            },
            required: ['project_id', 'todoset_id'],
        },
    },
    {
        name: 'get_todolist',
        description: 'Get a specific to-do list with its to-do items',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: { type: 'number', description: 'The project ID' },
                todolist_id: { type: 'number', description: 'The to-do list ID' },
            },
            required: ['project_id', 'todolist_id'],
        },
    },
    {
        name: 'create_todo',
        description: 'Create a new to-do item in a to-do list',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: { type: 'number', description: 'The project ID' },
                todolist_id: { type: 'number', description: 'The to-do list ID' },
                content: { type: 'string', description: 'The to-do title/content' },
                description: { type: 'string', description: 'Detailed description (optional, supports rich text HTML)' },
                assignee_ids: { type: 'array', items: { type: 'number' }, description: 'Array of people IDs to assign (optional)' },
                due_on: { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' },
            },
            required: ['project_id', 'todolist_id', 'content'],
        },
    },
    {
        name: 'complete_todo',
        description: 'Mark a to-do item as completed',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: { type: 'number', description: 'The project ID' },
                todo_id: { type: 'number', description: 'The to-do item ID' },
            },
            required: ['project_id', 'todo_id'],
        },
    },
    {
        name: 'list_messages',
        description: 'List messages on a project message board',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: { type: 'number', description: 'The project ID' },
                message_board_id: { type: 'number', description: 'The message board ID (found in the project dock)' },
            },
            required: ['project_id', 'message_board_id'],
        },
    },
    {
        name: 'create_message',
        description: 'Post a new message to a project message board',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: { type: 'number', description: 'The project ID' },
                message_board_id: { type: 'number', description: 'The message board ID (found in the project dock)' },
                subject: { type: 'string', description: 'Message subject/title' },
                content: { type: 'string', description: 'Message body (supports rich text HTML)' },
                category_id: { type: 'number', description: 'Message category/type ID (optional)' },
            },
            required: ['project_id', 'message_board_id', 'subject', 'content'],
        },
    },
    {
        name: 'list_schedule_entries',
        description: 'List schedule entries (events) for a project',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: { type: 'number', description: 'The project ID' },
                schedule_id: { type: 'number', description: 'The schedule ID (found in the project dock)' },
                status: { type: 'string', description: 'Filter: active (default), archived, or trashed', enum: ['active', 'archived', 'trashed'] },
            },
            required: ['project_id', 'schedule_id'],
        },
    },
];

function apiBase(accountId: string) {
    return `https://3.basecampapi.com/${accountId}`;
}

async function bc(
    path: string,
    token: string,
    accountId: string,
    method: 'GET' | 'POST' | 'PUT' = 'GET',
    body?: Record<string, unknown>,
) {
    const url = `${apiBase(accountId)}${path}.json`;
    const opts: RequestInit = {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT,
        },
    };
    if (body && (method === 'POST' || method === 'PUT')) {
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Basecamp HTTP ${res.status}: ${text}`);
    }

    // Some endpoints (like complete_todo) return 204 No Content
    if (res.status === 204) return null;

    return await res.json() as any;
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    accountId: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await fetch('https://launchpad.37signals.com/authorization.json', {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'User-Agent': USER_AGENT,
                },
            });
            if (!data.ok) throw new Error(`Auth failed: HTTP ${data.status}`);
            const auth = await data.json() as any;
            return {
                content: [{
                    type: 'text',
                    text: `Connected to Basecamp as ${auth.identity?.first_name ?? ''} ${auth.identity?.last_name ?? ''} (${auth.identity?.email_address ?? 'unknown'})`,
                }],
            };
        }

        case 'list_projects': {
            const status = (args.status as string) || 'active';
            const qs = status !== 'active' ? `?status=${status}` : '';
            const data = await bc(`/projects${qs}`, token, accountId);
            return (data ?? []).map((p: any) => ({
                id: p.id,
                name: p.name,
                description: p.description ?? '',
                purpose: p.purpose ?? '',
                created_at: p.created_at,
                updated_at: p.updated_at,
                bookmark_url: p.bookmark_url,
                dock: p.dock?.map((d: any) => ({ name: d.name, title: d.title, id: d.id, enabled: d.enabled })) ?? [],
            }));
        }

        case 'get_project': {
            const data = await bc(`/projects/${args.project_id}`, token, accountId);
            return {
                id: data.id,
                name: data.name,
                description: data.description ?? '',
                purpose: data.purpose ?? '',
                created_at: data.created_at,
                updated_at: data.updated_at,
                dock: data.dock?.map((d: any) => ({
                    name: d.name,
                    title: d.title,
                    id: d.id,
                    enabled: d.enabled,
                    url: d.url,
                })) ?? [],
            };
        }

        case 'list_todolists': {
            const status = (args.status as string) || 'active';
            const qs = status !== 'active' ? `?status=${status}` : '';
            const data = await bc(
                `/buckets/${args.project_id}/todosets/${args.todoset_id}/todolists${qs}`,
                token, accountId,
            );
            return (data ?? []).map((tl: any) => ({
                id: tl.id,
                title: tl.title,
                description: tl.description ?? '',
                completed: tl.completed,
                completed_ratio: tl.completed_ratio,
                todos_url: tl.todos_url,
            }));
        }

        case 'get_todolist': {
            const data = await bc(
                `/buckets/${args.project_id}/todolists/${args.todolist_id}`,
                token, accountId,
            );
            return {
                id: data.id,
                title: data.title,
                description: data.description ?? '',
                completed: data.completed,
                completed_ratio: data.completed_ratio,
                name: data.name,
                todos_top: data.todos_top ?? [],
                todos_bottom: data.todos_bottom ?? [],
            };
        }

        case 'create_todo': {
            const body: Record<string, unknown> = { content: args.content };
            if (args.description) body.description = args.description;
            if (args.assignee_ids) body.assignee_ids = args.assignee_ids;
            if (args.due_on) body.due_on = args.due_on;

            const data = await bc(
                `/buckets/${args.project_id}/todolists/${args.todolist_id}/todos`,
                token, accountId, 'POST', body,
            );
            return {
                id: data.id,
                content: data.content,
                due_on: data.due_on,
                completed: data.completed,
                assignees: data.assignees?.map((a: any) => ({ id: a.id, name: a.name })) ?? [],
            };
        }

        case 'complete_todo': {
            await bc(
                `/buckets/${args.project_id}/todos/${args.todo_id}/completion`,
                token, accountId, 'POST',
            );
            return { success: true, todo_id: args.todo_id };
        }

        case 'list_messages': {
            const data = await bc(
                `/buckets/${args.project_id}/message_boards/${args.message_board_id}/messages`,
                token, accountId,
            );
            return (data ?? []).map((m: any) => ({
                id: m.id,
                subject: m.subject,
                content: m.content ?? '',
                created_at: m.created_at,
                creator: m.creator ? { id: m.creator.id, name: m.creator.name } : null,
                comments_count: m.comments_count ?? 0,
            }));
        }

        case 'create_message': {
            const body: Record<string, unknown> = {
                subject: args.subject,
                content: args.content,
            };
            if (args.category_id) body.category_id = args.category_id;

            const data = await bc(
                `/buckets/${args.project_id}/message_boards/${args.message_board_id}/messages`,
                token, accountId, 'POST', body,
            );
            return {
                id: data.id,
                subject: data.subject,
                content: data.content,
                created_at: data.created_at,
                url: data.app_url ?? data.url,
            };
        }

        case 'list_schedule_entries': {
            const status = (args.status as string) || 'active';
            const qs = status !== 'active' ? `?status=${status}` : '';
            const data = await bc(
                `/buckets/${args.project_id}/schedules/${args.schedule_id}/entries${qs}`,
                token, accountId,
            );
            return (data ?? []).map((e: any) => ({
                id: e.id,
                title: e.title,
                description: e.description ?? '',
                starts_at: e.starts_at,
                ends_at: e.ends_at,
                all_day: e.all_day,
                creator: e.creator ? { id: e.creator.id, name: e.creator.name } : null,
                participants: e.participants?.map((p: any) => ({ id: p.id, name: p.name })) ?? [],
            }));
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'basecamp-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'basecamp-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-BASECAMP-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing BASECAMP_ACCESS_TOKEN secret — add it to your workspace secrets');
            }

            const accountId = request.headers.get('X-Mcp-Secret-BASECAMP-ACCOUNT-ID');
            if (!accountId) {
                return rpcErr(id, -32001, 'Missing BASECAMP_ACCOUNT_ID secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token, accountId);
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
