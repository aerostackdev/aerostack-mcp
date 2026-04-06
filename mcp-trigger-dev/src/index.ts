/**
 * Trigger.dev MCP Worker
 * Implements MCP protocol over HTTP for Trigger.dev background job operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   TRIGGER_DEV_API_KEY → X-Mcp-Secret-TRIGGER-DEV-API-KEY
 *
 * Auth format: Authorization: Bearer {api_key}
 * Base URL: https://api.trigger.dev/api/v1
 */

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

const BASE = 'https://api.trigger.dev/api/v1';

async function apiFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
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
        throw { code: -32603, message: `Trigger.dev HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'error' in data) {
            msg = (data as { error: string }).error || msg;
        }
        throw { code: -32603, message: `Trigger.dev API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Trigger.dev credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_runs',
        description: 'List task runs in Trigger.dev with their status, task ID, and output.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of runs to return (default 25)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_run',
        description: 'Get run details by ID including status, output, and timing information.',
        inputSchema: {
            type: 'object',
            properties: {
                run_id: { type: 'string', description: 'Run ID' },
            },
            required: ['run_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'cancel_run',
        description: 'Cancel a run that is currently queued or running.',
        inputSchema: {
            type: 'object',
            properties: {
                run_id: { type: 'string', description: 'Run ID to cancel' },
            },
            required: ['run_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'replay_run',
        description: 'Replay a completed or failed run with the same payload.',
        inputSchema: {
            type: 'object',
            properties: {
                run_id: { type: 'string', description: 'Run ID to replay' },
            },
            required: ['run_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_schedules',
        description: 'List all scheduled tasks in Trigger.dev.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of schedules to return (default 25)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_schedule',
        description: 'Create a cron schedule for a task.',
        inputSchema: {
            type: 'object',
            properties: {
                task: { type: 'string', description: 'Task ID to schedule (required)' },
                cron: { type: 'string', description: 'Cron expression (e.g. "0 * * * *" for hourly)' },
                timezone: { type: 'string', description: 'IANA timezone (default: UTC)' },
                externalId: { type: 'string', description: 'Optional external ID for deduplication' },
            },
            required: ['task', 'cron'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_schedule',
        description: 'Delete a scheduled task by schedule ID.',
        inputSchema: {
            type: 'object',
            properties: {
                schedule_id: { type: 'string', description: 'Schedule ID to delete' },
            },
            required: ['schedule_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await apiFetch('/runs?limit=1', apiKey);
            return { content: [{ type: 'text', text: 'Connected to Trigger.dev' }] };
        }

        case 'list_runs': {
            const limit = args.limit ?? 25;
            return apiFetch(`/runs?limit=${limit}`, apiKey);
        }

        case 'get_run': {
            validateRequired(args, ['run_id']);
            return apiFetch(`/runs/${encodeURIComponent(String(args.run_id))}`, apiKey);
        }

        case 'cancel_run': {
            validateRequired(args, ['run_id']);
            return apiFetch(`/runs/${args.run_id}/cancel`, apiKey, { method: 'POST' });
        }

        case 'replay_run': {
            validateRequired(args, ['run_id']);
            return apiFetch(`/runs/${args.run_id}/replay`, apiKey, { method: 'POST' });
        }

        case 'list_schedules': {
            const limit = args.limit ?? 25;
            return apiFetch(`/schedules?limit=${limit}`, apiKey);
        }

        case 'create_schedule': {
            validateRequired(args, ['task', 'cron']);
            const body: Record<string, unknown> = {
                task: args.task,
                cron: args.cron,
            };
            if (args.timezone !== undefined) body.timezone = args.timezone;
            if (args.externalId !== undefined) body.externalId = args.externalId;
            return apiFetch('/schedules', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'delete_schedule': {
            validateRequired(args, ['schedule_id']);
            return apiFetch(`/schedules/${encodeURIComponent(String(args.schedule_id))}`, apiKey, { method: 'DELETE' });
        }

        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-trigger-dev', tools: TOOLS.length }),
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

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-trigger-dev', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const apiKey = request.headers.get('X-Mcp-Secret-TRIGGER-DEV-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: TRIGGER_DEV_API_KEY (header: X-Mcp-Secret-TRIGGER-DEV-API-KEY)');
            }

            try {
                const result = await callTool(toolName, args, apiKey);
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
