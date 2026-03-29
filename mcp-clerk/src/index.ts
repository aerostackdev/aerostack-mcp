/**
 * Clerk MCP Worker
 * Implements MCP protocol over HTTP for Clerk user management operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   CLERK_SECRET_KEY → X-Mcp-Secret-CLERK-SECRET-KEY (starts with sk_...)
 *
 * Auth format: Authorization: Bearer {secret_key}
 * Base URL: https://api.clerk.com/v1
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

const BASE = 'https://api.clerk.com/v1';

async function apiFetch(
    path: string,
    secretKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${secretKey}`,
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
        throw { code: -32603, message: `Clerk HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'errors' in data) {
            const errors = (data as { errors: Array<{ message?: string; long_message?: string }> }).errors;
            if (Array.isArray(errors) && errors.length > 0) {
                msg = errors.map(e => e.long_message || e.message || '').filter(Boolean).join(', ') || msg;
            }
        }
        throw { code: -32603, message: `Clerk API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_users',
        description: 'List all users in your Clerk application.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of users to return (default 10, max 500)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user',
        description: 'Get full user details by ID including email, name, metadata, and OAuth connections.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'Clerk user ID (e.g. user_...)' },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_user',
        description: 'Create a new user in Clerk. At least one email address or username is required.',
        inputSchema: {
            type: 'object',
            properties: {
                email_address: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of email addresses for the user',
                },
                first_name: { type: 'string', description: 'First name' },
                last_name: { type: 'string', description: 'Last name' },
                password: { type: 'string', description: 'Initial password (min 8 characters)' },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_user',
        description: 'Update user fields. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'Clerk user ID to update' },
                first_name: { type: 'string', description: 'Updated first name' },
                last_name: { type: 'string', description: 'Updated last name' },
                public_metadata: { type: 'object', description: 'Public metadata object (replaces existing)' },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_user',
        description: 'Permanently delete a user. This action cannot be undone.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'Clerk user ID to delete' },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'ban_user',
        description: 'Ban a user from the application. Banned users cannot sign in.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'Clerk user ID to ban' },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'unban_user',
        description: 'Remove a ban from a user, restoring their ability to sign in.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'Clerk user ID to unban' },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_organizations',
        description: 'List all organizations in your Clerk application.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of organizations to return (default 10, max 500)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_organization',
        description: 'Get organization details by ID including name, slug, and membership count.',
        inputSchema: {
            type: 'object',
            properties: {
                org_id: { type: 'string', description: 'Organization ID (e.g. org_...)' },
            },
            required: ['org_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_invitation',
        description: 'Create an email invitation to join the application.',
        inputSchema: {
            type: 'object',
            properties: {
                email_address: { type: 'string', description: 'Email address to invite (required)' },
                public_metadata: { type: 'object', description: 'Public metadata to attach to the invitation' },
                redirect_url: { type: 'string', description: 'URL to redirect user after accepting invitation' },
            },
            required: ['email_address'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    secretKey: string,
): Promise<unknown> {
    switch (name) {
        case 'list_users': {
            const limit = args.limit ?? 10;
            return apiFetch(`/users?limit=${limit}`, secretKey);
        }

        case 'get_user': {
            validateRequired(args, ['user_id']);
            return apiFetch(`/users/${encodeURIComponent(String(args.user_id))}`, secretKey);
        }

        case 'create_user': {
            const body: Record<string, unknown> = {};
            if (args.email_address !== undefined) body.email_address = args.email_address;
            if (args.first_name !== undefined) body.first_name = args.first_name;
            if (args.last_name !== undefined) body.last_name = args.last_name;
            if (args.password !== undefined) body.password = args.password;
            return apiFetch('/users', secretKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_user': {
            validateRequired(args, ['user_id']);
            const { user_id, ...rest } = args;
            const body: Record<string, unknown> = {};
            if (rest.first_name !== undefined) body.first_name = rest.first_name;
            if (rest.last_name !== undefined) body.last_name = rest.last_name;
            if (rest.public_metadata !== undefined) body.public_metadata = rest.public_metadata;
            return apiFetch(`/users/${user_id}`, secretKey, {
                method: 'PATCH',
                body: JSON.stringify(body),
            });
        }

        case 'delete_user': {
            validateRequired(args, ['user_id']);
            return apiFetch(`/users/${encodeURIComponent(String(args.user_id))}`, secretKey, { method: 'DELETE' });
        }

        case 'ban_user': {
            validateRequired(args, ['user_id']);
            return apiFetch(`/users/${args.user_id}/ban`, secretKey, { method: 'POST' });
        }

        case 'unban_user': {
            validateRequired(args, ['user_id']);
            return apiFetch(`/users/${args.user_id}/unban`, secretKey, { method: 'POST' });
        }

        case 'list_organizations': {
            const limit = args.limit ?? 10;
            return apiFetch(`/organizations?limit=${limit}`, secretKey);
        }

        case 'get_organization': {
            validateRequired(args, ['org_id']);
            return apiFetch(`/organizations/${encodeURIComponent(String(args.org_id))}`, secretKey);
        }

        case 'create_invitation': {
            validateRequired(args, ['email_address']);
            const body: Record<string, unknown> = { email_address: args.email_address };
            if (args.public_metadata !== undefined) body.public_metadata = args.public_metadata;
            if (args.redirect_url !== undefined) body.redirect_url = args.redirect_url;
            return apiFetch('/invitations', secretKey, {
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
                JSON.stringify({ status: 'ok', server: 'mcp-clerk', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-clerk', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const secretKey = request.headers.get('X-Mcp-Secret-CLERK-SECRET-KEY');
            if (!secretKey) {
                return rpcErr(id, -32001, 'Missing required secret: CLERK_SECRET_KEY (header: X-Mcp-Secret-CLERK-SECRET-KEY)');
            }

            try {
                const result = await callTool(toolName, args, secretKey);
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
