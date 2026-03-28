/**
 * ClickUp MCP Worker
 * Implements MCP protocol over HTTP for ClickUp project management operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   CLICKUP_API_TOKEN  → X-Mcp-Secret-CLICKUP-API-TOKEN  (Personal API token from ClickUp settings)
 *
 * Auth format: Authorization: {CLICKUP_API_TOKEN} (no Bearer prefix)
 *
 * Covers: _ping (1), Workspaces & Spaces (4), Folders & Lists (5), Tasks (8),
 *         Time Tracking & Members (5) = 23 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const CLICKUP_BASE = 'https://api.clickup.com/api/v2';

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

function getSecrets(request: Request): { apiToken: string | null } {
    return {
        apiToken: request.headers.get('X-Mcp-Secret-CLICKUP-API-TOKEN'),
    };
}

async function clickupFetch(
    path: string,
    apiToken: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${CLICKUP_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': apiToken,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `ClickUp HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object') {
            const d = data as { err?: string; ECODE?: string };
            if (d.err) msg = d.err;
        }
        throw { code: -32603, message: `ClickUp API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Workspaces & Spaces (4 tools) ───────────────────────────────

    {
        name: '_ping',
        description: 'Verify ClickUp credentials by fetching the authenticated user profile. Returns user id, username, email, and color.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_workspaces',
        description: 'Get all workspaces (teams) for the authenticated user. Returns id, name, color, and member count.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_spaces',
        description: 'Get all spaces in a workspace. Returns id, name, private status, and enabled features.',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: {
                    type: 'string',
                    description: 'ClickUp workspace (team) ID (required)',
                },
                archived: {
                    type: 'boolean',
                    description: 'Whether to include archived spaces (default: false)',
                },
            },
            required: ['workspace_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_space',
        description: 'Create a new space in a workspace. Name is required.',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: {
                    type: 'string',
                    description: 'ClickUp workspace (team) ID (required)',
                },
                name: {
                    type: 'string',
                    description: 'Space name (required)',
                },
                multiple_assignees: {
                    type: 'boolean',
                    description: 'Allow multiple assignees per task (default: true)',
                },
            },
            required: ['workspace_id', 'name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_space',
        description: 'Get a specific space by ID including its features and settings.',
        inputSchema: {
            type: 'object',
            properties: {
                space_id: {
                    type: 'string',
                    description: 'ClickUp space ID (required)',
                },
            },
            required: ['space_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Folders & Lists (5 tools) ──────────────────────────────────

    {
        name: 'get_folders',
        description: 'Get all folders in a space. Returns id, name, and task counts.',
        inputSchema: {
            type: 'object',
            properties: {
                space_id: {
                    type: 'string',
                    description: 'ClickUp space ID (required)',
                },
                archived: {
                    type: 'boolean',
                    description: 'Whether to include archived folders (default: false)',
                },
            },
            required: ['space_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_folder',
        description: 'Create a new folder in a space.',
        inputSchema: {
            type: 'object',
            properties: {
                space_id: {
                    type: 'string',
                    description: 'ClickUp space ID to create the folder in (required)',
                },
                name: {
                    type: 'string',
                    description: 'Folder name (required)',
                },
            },
            required: ['space_id', 'name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_lists',
        description: 'Get all lists in a folder. To get folderless lists in a space, use space_id instead of folder_id.',
        inputSchema: {
            type: 'object',
            properties: {
                folder_id: {
                    type: 'string',
                    description: 'ClickUp folder ID to get lists from (use this OR space_id)',
                },
                space_id: {
                    type: 'string',
                    description: 'ClickUp space ID to get folderless lists from (use this OR folder_id)',
                },
                archived: {
                    type: 'boolean',
                    description: 'Whether to include archived lists (default: false)',
                },
            },
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_list',
        description: 'Create a list in a folder or space. Name is required along with either folder_id or space_id.',
        inputSchema: {
            type: 'object',
            properties: {
                folder_id: {
                    type: 'string',
                    description: 'ClickUp folder ID to create the list in (use this OR space_id)',
                },
                space_id: {
                    type: 'string',
                    description: 'ClickUp space ID to create a folderless list in (use this OR folder_id)',
                },
                name: {
                    type: 'string',
                    description: 'List name (required)',
                },
                content: {
                    type: 'string',
                    description: 'List description',
                },
                due_date: {
                    type: 'number',
                    description: 'List due date as Unix timestamp in milliseconds',
                },
                priority: {
                    type: 'number',
                    description: 'Priority level: 1 (urgent), 2 (high), 3 (normal), 4 (low)',
                    enum: [1, 2, 3, 4],
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_list',
        description: 'Get a specific list by ID including its task count and status options.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'ClickUp list ID (required)',
                },
            },
            required: ['list_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Tasks (8 tools) ─────────────────────────────────────────────

    {
        name: 'get_task',
        description: 'Get full task details by ID — name, description, status, priority, due date, assignees, tags, custom fields, and subtasks.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'ClickUp task ID (required)',
                },
                include_subtasks: {
                    type: 'boolean',
                    description: 'Whether to include subtasks in the response (default: false)',
                },
            },
            required: ['task_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_tasks',
        description: 'List tasks in a list with optional filters for status, assignee, due date, priority, and closed tasks.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'ClickUp list ID (required)',
                },
                archived: {
                    type: 'boolean',
                    description: 'Whether to include archived tasks (default: false)',
                },
                include_closed: {
                    type: 'boolean',
                    description: 'Whether to include closed tasks (default: false)',
                },
                assignees: {
                    type: 'string',
                    description: 'Comma-separated list of assignee user IDs to filter by',
                },
                statuses: {
                    type: 'string',
                    description: 'Comma-separated list of status names to filter by (e.g. "to do,in progress")',
                },
                due_date_gt: {
                    type: 'number',
                    description: 'Filter tasks with due date after this Unix timestamp in milliseconds',
                },
                due_date_lt: {
                    type: 'number',
                    description: 'Filter tasks with due date before this Unix timestamp in milliseconds',
                },
                priority: {
                    type: 'number',
                    description: 'Filter by priority: 1 (urgent), 2 (high), 3 (normal), 4 (low)',
                    enum: [1, 2, 3, 4],
                },
                page: {
                    type: 'number',
                    description: 'Page number for pagination (default: 0)',
                },
            },
            required: ['list_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_task',
        description: 'Create a new task in a list. Name is required. Optionally set description, priority, due date, assignees, tags, and status.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'ClickUp list ID to create the task in (required)',
                },
                name: {
                    type: 'string',
                    description: 'Task name (required)',
                },
                description: {
                    type: 'string',
                    description: 'Task description (plain text)',
                },
                priority: {
                    type: 'number',
                    description: 'Priority: 1 (urgent), 2 (high), 3 (normal), 4 (low)',
                    enum: [1, 2, 3, 4],
                },
                due_date: {
                    type: 'number',
                    description: 'Due date as Unix timestamp in milliseconds',
                },
                assignees: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'Array of user IDs to assign the task to',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of tag names to add to the task',
                },
                status: {
                    type: 'string',
                    description: 'Task status (must match a status in the list, e.g. "to do", "in progress")',
                },
            },
            required: ['list_id', 'name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_task',
        description: 'Update task fields: name, description, status, priority, or due date. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'ClickUp task ID (required)',
                },
                name: {
                    type: 'string',
                    description: 'New task name',
                },
                description: {
                    type: 'string',
                    description: 'New task description',
                },
                status: {
                    type: 'string',
                    description: 'New task status (must match a list status)',
                },
                priority: {
                    type: 'number',
                    description: 'New priority: 1 (urgent), 2 (high), 3 (normal), 4 (low)',
                    enum: [1, 2, 3, 4],
                },
                due_date: {
                    type: 'number',
                    description: 'New due date as Unix timestamp in milliseconds',
                },
            },
            required: ['task_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_task',
        description: 'Delete a task permanently. This action cannot be undone.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'ClickUp task ID to delete (required)',
                },
            },
            required: ['task_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'add_task_comment',
        description: 'Add a comment to a task. Optionally notify all assignees.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'ClickUp task ID (required)',
                },
                comment_text: {
                    type: 'string',
                    description: 'Comment text content (required)',
                },
                notify_all: {
                    type: 'boolean',
                    description: 'Whether to notify all task assignees (default: false)',
                },
            },
            required: ['task_id', 'comment_text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_task_comments',
        description: 'Get all comments on a task, ordered by creation date.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'ClickUp task ID (required)',
                },
            },
            required: ['task_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'set_task_custom_field',
        description: 'Set a custom field value on a task. Requires the custom field ID and the value to set.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: {
                    type: 'string',
                    description: 'ClickUp task ID (required)',
                },
                field_id: {
                    type: 'string',
                    description: 'Custom field ID (UUID, required)',
                },
                value: {
                    description: 'Value to set. Type depends on the custom field type — string for text fields, number for number fields, boolean for checkbox fields',
                },
            },
            required: ['task_id', 'field_id', 'value'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Time Tracking & Members (5 tools) ───────────────────────────

    {
        name: 'start_time_entry',
        description: 'Start a time tracker on a task. Only one timer can run at a time per workspace member.',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: {
                    type: 'string',
                    description: 'ClickUp workspace (team) ID (required)',
                },
                task_id: {
                    type: 'string',
                    description: 'ClickUp task ID to track time on (required)',
                },
                description: {
                    type: 'string',
                    description: 'Description for this time entry',
                },
                billable: {
                    type: 'boolean',
                    description: 'Whether this time entry is billable (default: false)',
                },
            },
            required: ['workspace_id', 'task_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'stop_time_entry',
        description: 'Stop the currently running time tracker for the authenticated user in a workspace.',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: {
                    type: 'string',
                    description: 'ClickUp workspace (team) ID (required)',
                },
            },
            required: ['workspace_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_time_entries',
        description: 'Get time entries for a workspace, optionally filtered by task or assignee.',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: {
                    type: 'string',
                    description: 'ClickUp workspace (team) ID (required)',
                },
                task_id: {
                    type: 'string',
                    description: 'Filter time entries by task ID',
                },
                assignee: {
                    type: 'number',
                    description: 'Filter time entries by assignee user ID',
                },
                start_date: {
                    type: 'number',
                    description: 'Start date filter as Unix timestamp in milliseconds',
                },
                end_date: {
                    type: 'number',
                    description: 'End date filter as Unix timestamp in milliseconds',
                },
            },
            required: ['workspace_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_workspace_members',
        description: 'Get all members in a workspace. Returns user id, username, email, color, and role.',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: {
                    type: 'string',
                    description: 'ClickUp workspace (team) ID (required)',
                },
            },
            required: ['workspace_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_tasks',
        description: 'Search tasks across a workspace by query string. Returns matching tasks across all spaces and lists.',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: {
                    type: 'string',
                    description: 'ClickUp workspace (team) ID (required)',
                },
                query: {
                    type: 'string',
                    description: 'Search query string to match against task names (required)',
                },
                include_closed: {
                    type: 'boolean',
                    description: 'Whether to include closed tasks in results (default: false)',
                },
            },
            required: ['workspace_id', 'query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiToken: string,
): Promise<unknown> {
    switch (name) {
        // ── _ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            return clickupFetch('/user', apiToken);
        }

        // ── Workspaces & Spaces ──────────────────────────────────────────────────

        case 'get_workspaces': {
            return clickupFetch('/team', apiToken);
        }

        case 'get_spaces': {
            validateRequired(args, ['workspace_id']);
            const archived = args.archived ? 'true' : 'false';
            return clickupFetch(`/team/${args.workspace_id}/space?archived=${archived}`, apiToken);
        }

        case 'create_space': {
            validateRequired(args, ['workspace_id', 'name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.multiple_assignees !== undefined) body.multiple_assignees = args.multiple_assignees;
            return clickupFetch(`/team/${args.workspace_id}/space`, apiToken, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_space': {
            validateRequired(args, ['space_id']);
            return clickupFetch(`/space/${args.space_id}`, apiToken);
        }

        // ── Folders & Lists ──────────────────────────────────────────────────────

        case 'get_folders': {
            validateRequired(args, ['space_id']);
            const archived = args.archived ? 'true' : 'false';
            return clickupFetch(`/space/${args.space_id}/folder?archived=${archived}`, apiToken);
        }

        case 'create_folder': {
            validateRequired(args, ['space_id', 'name']);
            return clickupFetch(`/space/${args.space_id}/folder`, apiToken, {
                method: 'POST',
                body: JSON.stringify({ name: args.name }),
            });
        }

        case 'get_lists': {
            const archived = args.archived ? 'true' : 'false';
            if (args.folder_id) {
                return clickupFetch(`/folder/${args.folder_id}/list?archived=${archived}`, apiToken);
            } else if (args.space_id) {
                return clickupFetch(`/space/${args.space_id}/list?archived=${archived}`, apiToken);
            } else {
                throw new Error('Missing required parameter: either folder_id or space_id must be provided');
            }
        }

        case 'create_list': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.content !== undefined) body.content = args.content;
            if (args.due_date !== undefined) body.due_date = args.due_date;
            if (args.priority !== undefined) body.priority = args.priority;
            if (args.folder_id) {
                return clickupFetch(`/folder/${args.folder_id}/list`, apiToken, {
                    method: 'POST',
                    body: JSON.stringify(body),
                });
            } else if (args.space_id) {
                return clickupFetch(`/space/${args.space_id}/list`, apiToken, {
                    method: 'POST',
                    body: JSON.stringify(body),
                });
            } else {
                throw new Error('Missing required parameter: either folder_id or space_id must be provided');
            }
        }

        case 'get_list': {
            validateRequired(args, ['list_id']);
            return clickupFetch(`/list/${args.list_id}`, apiToken);
        }

        // ── Tasks ────────────────────────────────────────────────────────────────

        case 'get_task': {
            validateRequired(args, ['task_id']);
            const subtasks = args.include_subtasks ? '?include_subtasks=true' : '';
            return clickupFetch(`/task/${args.task_id}${subtasks}`, apiToken);
        }

        case 'list_tasks': {
            validateRequired(args, ['list_id']);
            const params = new URLSearchParams();
            if (args.archived) params.set('archived', 'true');
            if (args.include_closed) params.set('include_closed', 'true');
            if (args.assignees) {
                for (const a of (args.assignees as string).split(',')) {
                    params.append('assignees[]', a.trim());
                }
            }
            if (args.statuses) {
                for (const s of (args.statuses as string).split(',')) {
                    params.append('statuses[]', s.trim());
                }
            }
            if (args.due_date_gt !== undefined) params.set('due_date_gt', String(args.due_date_gt));
            if (args.due_date_lt !== undefined) params.set('due_date_lt', String(args.due_date_lt));
            if (args.priority !== undefined) params.set('priority', String(args.priority));
            if (args.page !== undefined) params.set('page', String(args.page));
            const qs = params.toString() ? `?${params.toString()}` : '';
            return clickupFetch(`/list/${args.list_id}/task${qs}`, apiToken);
        }

        case 'create_task': {
            validateRequired(args, ['list_id', 'name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.description !== undefined) body.description = args.description;
            if (args.priority !== undefined) body.priority = args.priority;
            if (args.due_date !== undefined) body.due_date = args.due_date;
            if (args.assignees !== undefined) body.assignees = args.assignees;
            if (args.tags !== undefined) body.tags = args.tags;
            if (args.status !== undefined) body.status = args.status;
            return clickupFetch(`/list/${args.list_id}/task`, apiToken, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_task': {
            validateRequired(args, ['task_id']);
            const { task_id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['name', 'description', 'status', 'priority', 'due_date']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return clickupFetch(`/task/${task_id}`, apiToken, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'delete_task': {
            validateRequired(args, ['task_id']);
            return clickupFetch(`/task/${args.task_id}`, apiToken, { method: 'DELETE' });
        }

        case 'add_task_comment': {
            validateRequired(args, ['task_id', 'comment_text']);
            const body: Record<string, unknown> = {
                comment_text: args.comment_text,
                notify_all: args.notify_all ?? false,
            };
            return clickupFetch(`/task/${args.task_id}/comment`, apiToken, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_task_comments': {
            validateRequired(args, ['task_id']);
            return clickupFetch(`/task/${args.task_id}/comment`, apiToken);
        }

        case 'set_task_custom_field': {
            validateRequired(args, ['task_id', 'field_id', 'value']);
            return clickupFetch(`/task/${args.task_id}/field/${args.field_id}`, apiToken, {
                method: 'POST',
                body: JSON.stringify({ value: args.value }),
            });
        }

        // ── Time Tracking & Members ──────────────────────────────────────────────

        case 'start_time_entry': {
            validateRequired(args, ['workspace_id', 'task_id']);
            const body: Record<string, unknown> = { tid: args.task_id };
            if (args.description !== undefined) body.description = args.description;
            if (args.billable !== undefined) body.billable = args.billable;
            return clickupFetch(`/team/${args.workspace_id}/time_entries/start`, apiToken, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'stop_time_entry': {
            validateRequired(args, ['workspace_id']);
            return clickupFetch(`/team/${args.workspace_id}/time_entries/stop`, apiToken, { method: 'POST' });
        }

        case 'get_time_entries': {
            validateRequired(args, ['workspace_id']);
            const params = new URLSearchParams();
            if (args.task_id) params.set('task_id', args.task_id as string);
            if (args.assignee !== undefined) params.set('assignee', String(args.assignee));
            if (args.start_date !== undefined) params.set('start_date', String(args.start_date));
            if (args.end_date !== undefined) params.set('end_date', String(args.end_date));
            const qs = params.toString() ? `?${params.toString()}` : '';
            return clickupFetch(`/team/${args.workspace_id}/time_entries${qs}`, apiToken);
        }

        case 'get_workspace_members': {
            validateRequired(args, ['workspace_id']);
            return clickupFetch(`/team/${args.workspace_id}/member`, apiToken);
        }

        case 'search_tasks': {
            validateRequired(args, ['workspace_id', 'query']);
            const params = new URLSearchParams({ query: args.query as string });
            if (args.include_closed) params.set('include_closed', 'true');
            return clickupFetch(`/team/${args.workspace_id}/task?${params.toString()}`, apiToken);
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
                JSON.stringify({ status: 'ok', server: 'mcp-clickup', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-clickup', version: '1.0.0' },
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
            const { apiToken } = getSecrets(request);
            if (!apiToken) {
                return rpcErr(id, -32001, 'Missing required secrets: CLICKUP_API_TOKEN (header: X-Mcp-Secret-CLICKUP-API-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, apiToken);
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
