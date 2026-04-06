/**
 * Harvest MCP Worker
 * Implements MCP protocol over HTTP for Harvest time tracking & invoicing.
 *
 * Secrets:
 *   HARVEST_ACCESS_TOKEN → X-Mcp-Secret-HARVEST-ACCESS-TOKEN
 *   HARVEST_ACCOUNT_ID   → X-Mcp-Secret-HARVEST-ACCOUNT-ID
 */

const BASE = 'https://api.harvestapp.com/v2';

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
        description: 'Verify Harvest credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_time_entries',
        description: 'List time entries with optional filters',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'Filter by user' },
                client_id: { type: 'string', description: 'Filter by client' },
                project_id: { type: 'string', description: 'Filter by project' },
                from: { type: 'string', description: 'Start date YYYY-MM-DD' },
                to: { type: 'string', description: 'End date YYYY-MM-DD' },
                per_page: { type: 'number', description: 'Results per page (default 100)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_time_entry',
        description: 'Create a new time entry',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: { type: 'number', description: 'Project ID' },
                task_id: { type: 'number', description: 'Task ID' },
                spent_date: { type: 'string', description: 'Date YYYY-MM-DD' },
                hours: { type: 'number', description: 'Number of hours' },
                notes: { type: 'string', description: 'Notes about the work' },
            },
            required: ['project_id', 'task_id', 'spent_date', 'hours'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_time_entry',
        description: 'Update an existing time entry',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Time entry ID' },
                hours: { type: 'number', description: 'Updated hours' },
                notes: { type: 'string', description: 'Updated notes' },
                spent_date: { type: 'string', description: 'Updated date YYYY-MM-DD' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_time_entry',
        description: 'Delete a time entry',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Time entry ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'restart_timer',
        description: 'Restart a stopped timer',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Time entry ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'stop_timer',
        description: 'Stop a running timer',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Time entry ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_projects',
        description: 'List projects',
        inputSchema: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Filter by client' },
                per_page: { type: 'number', description: 'Results per page (default 100)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_project',
        description: 'Get a project by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Project ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_project',
        description: 'Create a new project',
        inputSchema: {
            type: 'object',
            properties: {
                client_id: { type: 'number', description: 'Client ID' },
                name: { type: 'string', description: 'Project name' },
                is_billable: { type: 'boolean', description: 'Whether project is billable (default true)' },
                bill_by: { type: 'string', description: 'Billing method: Project, Tasks, People, none' },
                budget_by: { type: 'string', description: 'Budget method: project, project_cost, task, person, none' },
            },
            required: ['client_id', 'name', 'bill_by'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_clients',
        description: 'List clients',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Results per page' },
                is_active: { type: 'boolean', description: 'Filter by active status' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_client',
        description: 'Create a new client',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Client name' },
                currency: { type: 'string', description: 'Currency code (default USD)' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_tasks',
        description: 'List all tasks',
        inputSchema: {
            type: 'object',
            properties: { per_page: { type: 'number', description: 'Results per page' } },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_invoices',
        description: 'List invoices with optional filters',
        inputSchema: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Filter by client' },
                state: { type: 'string', description: 'Filter: draft, open, paid, closed' },
                from: { type: 'string', description: 'Filter from date' },
                to: { type: 'string', description: 'Filter to date' },
                per_page: { type: 'number', description: 'Results per page' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_invoice',
        description: 'Create a new invoice',
        inputSchema: {
            type: 'object',
            properties: {
                client_id: { type: 'number', description: 'Client ID' },
                subject: { type: 'string', description: 'Invoice subject' },
                issue_date: { type: 'string', description: 'Issue date YYYY-MM-DD' },
                due_date: { type: 'string', description: 'Due date YYYY-MM-DD' },
                line_items_import: { type: 'object', description: 'Auto-import time entries configuration' },
            },
            required: ['client_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_reports_time',
        description: 'Get time report by projects',
        inputSchema: {
            type: 'object',
            properties: {
                from: { type: 'string', description: 'Start date YYYY-MM-DD' },
                to: { type: 'string', description: 'End date YYYY-MM-DD' },
                project_id: { type: 'string', description: 'Filter by project' },
                user_id: { type: 'string', description: 'Filter by user' },
            },
            required: ['from', 'to'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_current_user',
        description: 'Get current authenticated user',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function harvestFetch(path: string, token: string, accountId: string, options: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Harvest-Account-Id': accountId,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'Aerostack-MCP/1.0',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Harvest API ${res.status}: ${text}`);
    }
    if (res.status === 204) return { success: true };
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string, accountId: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const data = await harvestFetch('/users/me', token, accountId) as { first_name?: string; last_name?: string; email?: string };
            return { content: [{ type: 'text', text: `Connected to Harvest as ${data.email ?? `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || 'unknown'}` }] };
        }

        case 'list_time_entries': {
            const params = new URLSearchParams();
            if (args.user_id) params.set('user_id', String(args.user_id));
            if (args.client_id) params.set('client_id', String(args.client_id));
            if (args.project_id) params.set('project_id', String(args.project_id));
            if (args.from) params.set('from', String(args.from));
            if (args.to) params.set('to', String(args.to));
            params.set('per_page', String(args.per_page ?? 100));
            return harvestFetch(`/time_entries?${params.toString()}`, token, accountId);
        }

        case 'create_time_entry': {
            if (!args.project_id) throw new Error('project_id is required');
            if (!args.task_id) throw new Error('task_id is required');
            if (!args.spent_date) throw new Error('spent_date is required');
            if (args.hours == null) throw new Error('hours is required');
            const body: Record<string, unknown> = {
                project_id: args.project_id,
                task_id: args.task_id,
                spent_date: args.spent_date,
                hours: args.hours,
            };
            if (args.notes) body.notes = args.notes;
            return harvestFetch('/time_entries', token, accountId, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'update_time_entry': {
            if (!args.id) throw new Error('id is required');
            const body: Record<string, unknown> = {};
            if (args.hours != null) body.hours = args.hours;
            if (args.notes) body.notes = args.notes;
            if (args.spent_date) body.spent_date = args.spent_date;
            return harvestFetch(`/time_entries/${args.id}`, token, accountId, { method: 'PATCH', body: JSON.stringify(body) });
        }

        case 'delete_time_entry': {
            if (!args.id) throw new Error('id is required');
            return harvestFetch(`/time_entries/${args.id}`, token, accountId, { method: 'DELETE' });
        }

        case 'restart_timer': {
            if (!args.id) throw new Error('id is required');
            return harvestFetch(`/time_entries/${args.id}/restart`, token, accountId, { method: 'PATCH' });
        }

        case 'stop_timer': {
            if (!args.id) throw new Error('id is required');
            return harvestFetch(`/time_entries/${args.id}/stop`, token, accountId, { method: 'PATCH' });
        }

        case 'list_projects': {
            const params = new URLSearchParams();
            if (args.client_id) params.set('client_id', String(args.client_id));
            params.set('per_page', String(args.per_page ?? 100));
            return harvestFetch(`/projects?${params.toString()}`, token, accountId);
        }

        case 'get_project': {
            if (!args.id) throw new Error('id is required');
            return harvestFetch(`/projects/${args.id}`, token, accountId);
        }

        case 'create_project': {
            if (!args.client_id) throw new Error('client_id is required');
            if (!args.name) throw new Error('name is required');
            if (!args.bill_by) throw new Error('bill_by is required');
            const body: Record<string, unknown> = {
                client_id: args.client_id,
                name: args.name,
                is_billable: args.is_billable ?? true,
                bill_by: args.bill_by,
            };
            if (args.budget_by) body.budget_by = args.budget_by;
            return harvestFetch('/projects', token, accountId, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_clients': {
            const params = new URLSearchParams();
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.is_active != null) params.set('is_active', String(args.is_active));
            const q = params.toString();
            return harvestFetch(`/clients${q ? '?' + q : ''}`, token, accountId);
        }

        case 'create_client': {
            if (!args.name) throw new Error('name is required');
            const body: Record<string, unknown> = { name: args.name, currency: args.currency ?? 'USD' };
            return harvestFetch('/clients', token, accountId, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_tasks': {
            const params = new URLSearchParams();
            if (args.per_page) params.set('per_page', String(args.per_page));
            const q = params.toString();
            return harvestFetch(`/tasks${q ? '?' + q : ''}`, token, accountId);
        }

        case 'list_invoices': {
            const params = new URLSearchParams();
            if (args.client_id) params.set('client_id', String(args.client_id));
            if (args.state) params.set('state', String(args.state));
            if (args.from) params.set('from', String(args.from));
            if (args.to) params.set('to', String(args.to));
            if (args.per_page) params.set('per_page', String(args.per_page));
            const q = params.toString();
            return harvestFetch(`/invoices${q ? '?' + q : ''}`, token, accountId);
        }

        case 'create_invoice': {
            if (!args.client_id) throw new Error('client_id is required');
            const body: Record<string, unknown> = { client_id: args.client_id };
            if (args.subject) body.subject = args.subject;
            if (args.issue_date) body.issue_date = args.issue_date;
            if (args.due_date) body.due_date = args.due_date;
            if (args.line_items_import) body.line_items_import = args.line_items_import;
            return harvestFetch('/invoices', token, accountId, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_reports_time': {
            if (!args.from) throw new Error('from is required');
            if (!args.to) throw new Error('to is required');
            const params = new URLSearchParams();
            params.set('from', String(args.from));
            params.set('to', String(args.to));
            if (args.project_id) params.set('project_id', String(args.project_id));
            if (args.user_id) params.set('user_id', String(args.user_id));
            return harvestFetch(`/reports/time/projects?${params.toString()}`, token, accountId);
        }

        case 'get_current_user':
            return harvestFetch('/users/me', token, accountId);

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'harvest-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'harvest-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-HARVEST-ACCESS-TOKEN');
            const accountId = request.headers.get('X-Mcp-Secret-HARVEST-ACCOUNT-ID');

            if (!token || !accountId) {
                return rpcErr(id, -32001, 'Missing required secrets: HARVEST_ACCESS_TOKEN, HARVEST_ACCOUNT_ID');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, token, accountId);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
