/**
 * Todoist MCP Worker
 * Implements MCP protocol over HTTP for Todoist task management operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   TODOIST_API_TOKEN  → X-Mcp-Secret-TODOIST-API-TOKEN  (personal API token)
 *
 * Auth format: Authorization: Bearer {api_token}
 *
 * Covers: Tasks (6), Projects (5), Sections (4), Comments & Labels (4),
 *         User & Tasks (3) = 22 tools total
 *
 * Rate limit: 1,000 requests per 15-minute window
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const TODOIST_API_BASE = 'https://api.todoist.com/rest/v2';

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

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

function getSecrets(request: Request): { token: string | null } {
    return {
        token: request.headers.get('X-Mcp-Secret-TODOIST-API-TOKEN'),
    };
}

async function todoistFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${TODOIST_API_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return { success: true };
    if (res.status === 200 && options.method === 'POST' && path.includes('/close')) return { success: true };

    const text = await res.text();
    if (!text) return { success: true };

    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Todoist HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'error' in data) {
            msg = (data as { error: string }).error || msg;
        }
        throw { code: -32603, message: `Todoist API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Tasks (6 tools) ─────────────────────────────────────────────

    {
        name: 'list_tasks',
        description: 'List active tasks. Filter by project, section, label, or use Todoist filter strings like "today", "overdue", "p1", or "#MyProject".',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'string',
                    description: 'Filter tasks by project ID',
                },
                section_id: {
                    type: 'string',
                    description: 'Filter tasks by section ID',
                },
                label: {
                    type: 'string',
                    description: 'Filter tasks by label name',
                },
                filter: {
                    type: 'string',
                    description: 'Todoist filter string (e.g. "today", "overdue", "p1", "#Work & due before: +14 days")',
                },
                lang: {
                    type: 'string',
                    description: 'Language for filter parsing (IETF language tag, e.g. "en", "de")',
                },
                ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of specific task IDs to retrieve',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_task',
        description: 'Get a specific task by ID. Returns content, description, project_id, section_id, parent_id, labels, priority, due date, and URL.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'Todoist task ID',
                },
            },
            required: ['task_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_task',
        description: 'Create a new task. Content is required. Supports natural language due dates like "tomorrow at 5pm" or ISO dates like "2026-12-31".',
        inputSchema: {
            type: 'object',
            properties: {
                content: {
                    type: 'string',
                    description: 'Task content/title (required, supports Markdown links)',
                },
                description: {
                    type: 'string',
                    description: 'Task description (supports Markdown)',
                },
                project_id: {
                    type: 'string',
                    description: 'Project ID to add task to (defaults to Inbox)',
                },
                section_id: {
                    type: 'string',
                    description: 'Section ID to add task to',
                },
                parent_id: {
                    type: 'string',
                    description: 'Parent task ID for creating sub-tasks',
                },
                labels: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of label names to apply to the task',
                },
                priority: {
                    type: 'number',
                    description: 'Task priority: 1 (normal), 2 (medium), 3 (high), 4 (urgent)',
                },
                due_string: {
                    type: 'string',
                    description: 'Natural language due date (e.g. "tomorrow at 5pm", "every Monday", "next week")',
                },
                due_date: {
                    type: 'string',
                    description: 'Due date in YYYY-MM-DD format',
                },
                assignee_id: {
                    type: 'string',
                    description: 'User ID to assign the task to (shared projects only)',
                },
            },
            required: ['content'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_task',
        description: 'Update an existing task. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'Todoist task ID to update',
                },
                content: {
                    type: 'string',
                    description: 'New task content/title',
                },
                description: {
                    type: 'string',
                    description: 'New task description',
                },
                labels: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'New array of label names (replaces existing labels)',
                },
                priority: {
                    type: 'number',
                    description: 'New priority: 1 (normal), 2 (medium), 3 (high), 4 (urgent)',
                },
                due_string: {
                    type: 'string',
                    description: 'New natural language due date',
                },
                due_date: {
                    type: 'string',
                    description: 'New due date in YYYY-MM-DD format',
                },
                assignee_id: {
                    type: 'string',
                    description: 'New assignee user ID',
                },
            },
            required: ['task_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'close_task',
        description: 'Mark a task as completed. For recurring tasks, this moves the due date to the next occurrence.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'Todoist task ID to close/complete',
                },
            },
            required: ['task_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_task',
        description: 'Permanently delete a task. This action cannot be undone.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'Todoist task ID to permanently delete',
                },
            },
            required: ['task_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 2 — Projects (5 tools) ──────────────────────────────────────────

    {
        name: 'list_projects',
        description: 'List all user projects. Returns id, name, color, is_favorite, parent_id, and order for each project.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_project',
        description: 'Get a specific project by ID. Returns name, color, comment_count, order, is_favorite, is_inbox_project, and is_team_inbox.',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'string',
                    description: 'Todoist project ID',
                },
            },
            required: ['project_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_project',
        description: 'Create a new project. Name is required.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Project name (required)',
                },
                parent_id: {
                    type: 'string',
                    description: 'Parent project ID to create as a sub-project',
                },
                color: {
                    type: 'string',
                    description: 'Project color name: berry_red, red, orange, yellow, olive_green, lime_green, green, mint_green, teal, sky_blue, light_blue, blue, grape, violet, lavender, magenta, salmon, charcoal, grey, taupe',
                },
                is_favorite: {
                    type: 'boolean',
                    description: 'Whether to add to favorites (default false)',
                },
                view_style: {
                    type: 'string',
                    description: 'Project view style: list or board',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_project',
        description: 'Update project name, color, favorite status, or view style.',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'string',
                    description: 'Todoist project ID to update',
                },
                name: {
                    type: 'string',
                    description: 'New project name',
                },
                color: {
                    type: 'string',
                    description: 'New color name (e.g. blue, red, green)',
                },
                is_favorite: {
                    type: 'boolean',
                    description: 'Update favorite status',
                },
                view_style: {
                    type: 'string',
                    description: 'New view style: list or board',
                },
            },
            required: ['project_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_project',
        description: 'Delete a project and all tasks within it. This action cannot be undone.',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'string',
                    description: 'Todoist project ID to delete',
                },
            },
            required: ['project_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 3 — Sections (4 tools) ──────────────────────────────────────────

    {
        name: 'list_sections',
        description: 'List all sections in a project.',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'string',
                    description: 'Project ID to list sections for (required)',
                },
            },
            required: ['project_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_section',
        description: 'Get a specific section by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                section_id: {
                    type: 'string',
                    description: 'Todoist section ID',
                },
            },
            required: ['section_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_section',
        description: 'Create a new section in a project.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Section name (required)',
                },
                project_id: {
                    type: 'string',
                    description: 'Project ID to create the section in (required)',
                },
                order: {
                    type: 'number',
                    description: 'Section order position',
                },
            },
            required: ['name', 'project_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_section',
        description: 'Delete a section. Tasks within the section are moved to the project root.',
        inputSchema: {
            type: 'object',
            properties: {
                section_id: {
                    type: 'string',
                    description: 'Todoist section ID to delete',
                },
            },
            required: ['section_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 4 — Comments & Labels (4 tools) ─────────────────────────────────

    {
        name: 'list_comments',
        description: 'List all comments on a task or project. Provide either task_id or project_id.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'Task ID to list comments for',
                },
                project_id: {
                    type: 'string',
                    description: 'Project ID to list comments for',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_comment',
        description: 'Create a comment on a task or project. Content is required, plus either task_id or project_id.',
        inputSchema: {
            type: 'object',
            properties: {
                content: {
                    type: 'string',
                    description: 'Comment text (required, supports Markdown)',
                },
                task_id: {
                    type: 'string',
                    description: 'Task ID to comment on',
                },
                project_id: {
                    type: 'string',
                    description: 'Project ID to comment on',
                },
            },
            required: ['content'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_labels',
        description: 'List all personal labels. Returns name, color, order, and is_favorite for each label.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_label',
        description: 'Create a new personal label.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Label name (required, must be unique)',
                },
                color: {
                    type: 'string',
                    description: 'Label color name (e.g. berry_red, blue, green)',
                },
                order: {
                    type: 'number',
                    description: 'Label sort order',
                },
                is_favorite: {
                    type: 'boolean',
                    description: 'Add to favorites (default false)',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 5 — User & Tasks (3 tools) ──────────────────────────────────────

    {
        name: 'get_user',
        description: 'Get the current user profile. Returns email, full_name, premium status, timezone, and week start day.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'reopen_task',
        description: 'Reopen a previously completed task, making it active again.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'Todoist task ID to reopen',
                },
            },
            required: ['task_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'move_task',
        description: 'Move a task to a different project or section.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'Todoist task ID to move',
                },
                project_id: {
                    type: 'string',
                    description: 'Target project ID',
                },
                section_id: {
                    type: 'string',
                    description: 'Target section ID',
                },
            },
            required: ['task_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        // ── Tasks ───────────────────────────────────────────────────────────────

        case 'list_tasks': {
            const params = new URLSearchParams();
            if (args.project_id) params.set('project_id', args.project_id as string);
            if (args.section_id) params.set('section_id', args.section_id as string);
            if (args.label) params.set('label', args.label as string);
            if (args.filter) params.set('filter', args.filter as string);
            if (args.lang) params.set('lang', args.lang as string);
            if (Array.isArray(args.ids) && args.ids.length > 0) {
                params.set('ids', (args.ids as string[]).join(','));
            }
            const qs = params.toString();
            return todoistFetch(`/tasks${qs ? `?${qs}` : ''}`, token);
        }

        case 'get_task': {
            validateRequired(args, ['task_id']);
            return todoistFetch(`/tasks/${args.task_id}`, token);
        }

        case 'create_task': {
            validateRequired(args, ['content']);
            const body: Record<string, unknown> = {};
            for (const key of ['content', 'description', 'project_id', 'section_id', 'parent_id',
                'labels', 'priority', 'due_string', 'due_date', 'assignee_id']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return todoistFetch('/tasks', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_task': {
            validateRequired(args, ['task_id']);
            const { task_id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['content', 'description', 'labels', 'priority', 'due_string', 'due_date', 'assignee_id']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return todoistFetch(`/tasks/${task_id}`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'close_task': {
            validateRequired(args, ['task_id']);
            return todoistFetch(`/tasks/${args.task_id}/close`, token, { method: 'POST', body: '' });
        }

        case 'delete_task': {
            validateRequired(args, ['task_id']);
            return todoistFetch(`/tasks/${args.task_id}`, token, { method: 'DELETE' });
        }

        // ── Projects ────────────────────────────────────────────────────────────

        case 'list_projects': {
            return todoistFetch('/projects', token);
        }

        case 'get_project': {
            validateRequired(args, ['project_id']);
            return todoistFetch(`/projects/${args.project_id}`, token);
        }

        case 'create_project': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = {};
            for (const key of ['name', 'parent_id', 'color', 'is_favorite', 'view_style']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return todoistFetch('/projects', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_project': {
            validateRequired(args, ['project_id']);
            const { project_id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['name', 'color', 'is_favorite', 'view_style']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return todoistFetch(`/projects/${project_id}`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'delete_project': {
            validateRequired(args, ['project_id']);
            return todoistFetch(`/projects/${args.project_id}`, token, { method: 'DELETE' });
        }

        // ── Sections ────────────────────────────────────────────────────────────

        case 'list_sections': {
            validateRequired(args, ['project_id']);
            return todoistFetch(`/sections?project_id=${args.project_id}`, token);
        }

        case 'get_section': {
            validateRequired(args, ['section_id']);
            return todoistFetch(`/sections/${args.section_id}`, token);
        }

        case 'create_section': {
            validateRequired(args, ['name', 'project_id']);
            const body: Record<string, unknown> = {
                name: args.name,
                project_id: args.project_id,
            };
            if (args.order !== undefined) body.order = args.order;
            return todoistFetch('/sections', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'delete_section': {
            validateRequired(args, ['section_id']);
            return todoistFetch(`/sections/${args.section_id}`, token, { method: 'DELETE' });
        }

        // ── Comments ────────────────────────────────────────────────────────────

        case 'list_comments': {
            if (!args.task_id && !args.project_id) {
                throw new Error('Either task_id or project_id is required');
            }
            const params = new URLSearchParams();
            if (args.task_id) params.set('task_id', args.task_id as string);
            else if (args.project_id) params.set('project_id', args.project_id as string);
            return todoistFetch(`/comments?${params.toString()}`, token);
        }

        case 'create_comment': {
            validateRequired(args, ['content']);
            if (!args.task_id && !args.project_id) {
                throw new Error('Either task_id or project_id is required');
            }
            const body: Record<string, unknown> = { content: args.content };
            if (args.task_id) body.task_id = args.task_id;
            else if (args.project_id) body.project_id = args.project_id;
            return todoistFetch('/comments', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        // ── Labels ──────────────────────────────────────────────────────────────

        case 'list_labels': {
            return todoistFetch('/labels', token);
        }

        case 'create_label': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = {};
            for (const key of ['name', 'color', 'order', 'is_favorite']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return todoistFetch('/labels', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        // ── User & Tasks ────────────────────────────────────────────────────────

        case 'get_user': {
            return todoistFetch('/user', token);
        }

        case 'reopen_task': {
            validateRequired(args, ['task_id']);
            return todoistFetch(`/tasks/${args.task_id}/reopen`, token, { method: 'POST', body: '' });
        }

        case 'move_task': {
            validateRequired(args, ['task_id']);
            if (!args.project_id && !args.section_id) {
                throw new Error('Either project_id or section_id is required');
            }
            const { task_id, ...rest } = args;
            const body: Record<string, unknown> = {};
            if (rest.project_id !== undefined) body.project_id = rest.project_id;
            if (rest.section_id !== undefined) body.section_id = rest.section_id;
            return todoistFetch(`/tasks/${task_id}`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-todoist', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
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

        // ── MCP protocol methods ──────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-todoist', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            // Validate secrets
            const { token } = getSecrets(request);
            if (!token) {
                return rpcErr(id, -32001, 'Missing required secret: TODOIST_API_TOKEN (header: X-Mcp-Secret-TODOIST-API-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, token);
                return rpcOk(id, toolOk(result));
            } catch (err: unknown) {
                if (err && typeof err === 'object' && 'code' in err) {
                    const e = err as { code: number; message: string };
                    return rpcErr(id, e.code, e.message);
                }
                if (err instanceof Error) {
                    return rpcErr(id, -32603, err.message);
                }
                return rpcErr(id, -32603, 'Internal error');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
