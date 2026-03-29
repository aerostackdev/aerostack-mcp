/**
 * Remote MCP Worker
 * Implements MCP protocol over HTTP for Remote.com global HR and employment operations.
 *
 * Secrets required:
 *   REMOTE_ACCESS_TOKEN → X-Mcp-Secret-REMOTE-ACCESS-TOKEN
 *
 * Auth: Authorization: Bearer {access_token}
 * Base URL: https://gateway.remote.com/v1
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

const BASE_URL = 'https://gateway.remote.com/v1';

async function remoteFetch(
    path: string,
    accessToken: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return { success: true };

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Remote HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'message' in data) {
            msg = String((data as { message: unknown }).message) || msg;
        }
        throw { code: -32603, message: `Remote API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_employments',
        description: 'List all employments in your Remote organization with pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (default 1)' },
                limit: { type: 'number', description: 'Number of results per page (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_employment',
        description: 'Get detailed information about a specific employment record.',
        inputSchema: {
            type: 'object',
            properties: {
                employment_id: { type: 'string', description: 'Remote employment ID' },
            },
            required: ['employment_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_countries',
        description: 'List all countries supported by Remote for employment.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_country',
        description: 'Get employment requirements, compliance rules, and details for a specific country.',
        inputSchema: {
            type: 'object',
            properties: {
                country_code: { type: 'string', description: 'ISO 3166-1 alpha-2 country code (e.g. US, GB, DE)' },
            },
            required: ['country_code'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_time_offs',
        description: 'List time off requests in your Remote organization.',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (default 1)' },
                limit: { type: 'number', description: 'Number of results per page (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_time_off',
        description: 'Create a time off request for an employee in Remote.',
        inputSchema: {
            type: 'object',
            properties: {
                employment_id: { type: 'string', description: 'Employment ID for the employee (required)' },
                type: { type: 'string', description: 'Type of time off (e.g. vacation, sick, personal) (required)' },
                start_date: { type: 'string', description: 'Start date in ISO 8601 format (YYYY-MM-DD) (required)' },
                end_date: { type: 'string', description: 'End date in ISO 8601 format (YYYY-MM-DD) (required)' },
                notes: { type: 'string', description: 'Optional notes about the time off request' },
            },
            required: ['employment_id', 'type', 'start_date', 'end_date'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    accessToken: string,
): Promise<unknown> {
    switch (name) {
        case 'list_employments': {
            const params = new URLSearchParams();
            params.set('page', String(args.page ?? 1));
            params.set('page_size', String(args.limit ?? 20));
            return remoteFetch(`/employments?${params.toString()}`, accessToken);
        }

        case 'get_employment': {
            validateRequired(args, ['employment_id']);
            return remoteFetch(`/employments/${args.employment_id}`, accessToken);
        }

        case 'list_countries': {
            return remoteFetch('/countries', accessToken);
        }

        case 'get_country': {
            validateRequired(args, ['country_code']);
            return remoteFetch(`/countries/${args.country_code}`, accessToken);
        }

        case 'list_time_offs': {
            const params = new URLSearchParams();
            params.set('page', String(args.page ?? 1));
            params.set('page_size', String(args.limit ?? 20));
            return remoteFetch(`/timeoffs?${params.toString()}`, accessToken);
        }

        case 'create_time_off': {
            validateRequired(args, ['employment_id', 'type', 'start_date', 'end_date']);
            const body: Record<string, unknown> = {
                employment_id: args.employment_id,
                type: args.type,
                start_date: args.start_date,
                end_date: args.end_date,
            };
            if (args.notes !== undefined) body.notes = args.notes;
            return remoteFetch('/timeoffs', accessToken, {
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
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-remote', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-remote', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const accessToken = request.headers.get('X-Mcp-Secret-REMOTE-ACCESS-TOKEN');
            if (!accessToken) {
                return rpcErr(id, -32001, 'Missing required secret: REMOTE_ACCESS_TOKEN (header: X-Mcp-Secret-REMOTE-ACCESS-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, accessToken);
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
