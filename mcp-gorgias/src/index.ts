/**
 * Gorgias MCP Worker
 * Implements MCP protocol over HTTP for Gorgias ecommerce helpdesk operations.
 * Secrets received via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   GORGIAS_EMAIL      → X-Mcp-Secret-GORGIAS-EMAIL
 *   GORGIAS_API_KEY    → X-Mcp-Secret-GORGIAS-API-KEY
 *   GORGIAS_DOMAIN     → X-Mcp-Secret-GORGIAS-DOMAIN
 *
 * Auth: Authorization: Basic {btoa(email + ':' + apiKey)}
 * Base URL: https://{domain}.gorgias.com/api
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

function btoa64(str: string): string {
    return btoa(str);
}

async function gorgiasFetch(email: string, apiKey: string, domain: string, path: string, options: RequestInit = {}): Promise<unknown> {
    const base = `https://${domain}.gorgias.com/api`;
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const credentials = btoa64(`${email}:${apiKey}`);
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });
    if (res.status === 204) return {};
    const text = await res.text();
    if (!text) return {};
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw { code: -32603, message: `Gorgias HTTP ${res.status}: ${text}` }; }
    if (!res.ok) {
        const d = data as Record<string, unknown>;
        const msg = (d?.error as string) || (d?.message as string) || res.statusText;
        throw { code: -32603, message: `Gorgias API error ${res.status}: ${msg}` };
    }
    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Gorgias credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_tickets',
        description: 'List support tickets with pagination and status filter.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results per page (default: 25)' },
                page: { type: 'number', description: 'Page number (default: 1)' },
                status: { type: 'string', description: 'Filter by status: open, closed (default: open)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_ticket',
        description: 'Get full ticket details by ID.',
        inputSchema: {
            type: 'object',
            properties: { ticketId: { type: 'number', description: 'Gorgias ticket ID' } },
            required: ['ticketId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_ticket',
        description: 'Create a new support ticket.',
        inputSchema: {
            type: 'object',
            properties: {
                subject: { type: 'string', description: 'Ticket subject' },
                customerEmail: { type: 'string', description: 'Customer email address' },
                bodyText: { type: 'string', description: 'Initial message body text' },
            },
            required: ['subject', 'customerEmail', 'bodyText'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_ticket',
        description: 'Update ticket status, assignee, or tags.',
        inputSchema: {
            type: 'object',
            properties: {
                ticketId: { type: 'number', description: 'Ticket ID to update' },
                status: { type: 'string', description: 'New status: open, closed' },
                assignee_user: { type: 'object', description: 'Assignee object with id field' },
                tags: { type: 'array', items: { type: 'object' }, description: 'Tags array' },
            },
            required: ['ticketId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'create_message',
        description: 'Add a message to an existing ticket.',
        inputSchema: {
            type: 'object',
            properties: {
                ticketId: { type: 'number', description: 'Ticket ID' },
                agentEmail: { type: 'string', description: 'Agent email sending the message' },
                bodyText: { type: 'string', description: 'Message body text' },
            },
            required: ['ticketId', 'agentEmail', 'bodyText'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_customers',
        description: 'List customers with pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default: 25)' },
                page: { type: 'number', description: 'Page number (default: 1)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_customer',
        description: 'Get customer details by ID.',
        inputSchema: {
            type: 'object',
            properties: { customerId: { type: 'number', description: 'Gorgias customer ID' } },
            required: ['customerId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_tags',
        description: 'List all tags in the account.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default: 100)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_satisfaction_surveys',
        description: 'List customer satisfaction surveys.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default: 25)' },
                page: { type: 'number', description: 'Page number (default: 1)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_macros',
        description: 'List macros (canned responses and workflows).',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default: 25)' },
                page: { type: 'number', description: 'Page number (default: 1)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_stats',
        description: 'Get overview statistics for the helpdesk.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_users',
        description: 'List all agent users in the account.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default: 50)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
];

// ── Request handler ───────────────────────────────────────────────────────────

async function handleRequest(request: Request): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', mcp: 'mcp-gorgias' }), {
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
            serverInfo: { name: 'mcp-gorgias', version: '1.0.0' },
        });
    }

    if (body.method === 'tools/list') {
        return rpcOk(id, { tools: TOOLS });
    }

    if (body.method === 'tools/call') {
        const email = request.headers.get('X-Mcp-Secret-GORGIAS-EMAIL');
        const apiKey = request.headers.get('X-Mcp-Secret-GORGIAS-API-KEY');
        const domain = request.headers.get('X-Mcp-Secret-GORGIAS-DOMAIN');
        const missing = [];
        if (!email) missing.push('GORGIAS_EMAIL');
        if (!apiKey) missing.push('GORGIAS_API_KEY');
        if (!domain) missing.push('GORGIAS_DOMAIN');
        if (missing.length > 0) return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);

        const toolName = (body.params?.name ?? '') as string;
        const args = (body.params?.arguments ?? {}) as Record<string, unknown>;

        try {
            const result = await dispatchTool(email!, apiKey!, domain!, toolName, args);
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

async function dispatchTool(email: string, apiKey: string, domain: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const data = await gorgiasFetch(email, apiKey, domain, '/account');
            return toolOk(data);
        }
        case 'list_tickets': {
            const limit = (args.limit as number) ?? 25;
            const page = (args.page as number) ?? 1;
            const status = (args.status as string) ?? 'open';
            const data = await gorgiasFetch(email, apiKey, domain, `/tickets?limit=${limit}&page=${page}&status=${status}`);
            return toolOk(data);
        }
        case 'get_ticket': {
            validateRequired(args, ['ticketId']);
            const data = await gorgiasFetch(email, apiKey, domain, `/tickets/${args.ticketId}`);
            return toolOk(data);
        }
        case 'create_ticket': {
            validateRequired(args, ['subject', 'customerEmail', 'bodyText']);
            const data = await gorgiasFetch(email, apiKey, domain, '/tickets', {
                method: 'POST',
                body: JSON.stringify({
                    channel: 'email',
                    via: 'help-center',
                    from_agent: false,
                    subject: args.subject,
                    customer: { email: args.customerEmail },
                    messages: [{
                        channel: 'email',
                        source: { type: 'email', from: { address: args.customerEmail } },
                        body_text: args.bodyText,
                    }],
                }),
            });
            return toolOk(data);
        }
        case 'update_ticket': {
            validateRequired(args, ['ticketId']);
            const { ticketId, ...rest } = args;
            const data = await gorgiasFetch(email, apiKey, domain, `/tickets/${ticketId}`, {
                method: 'PUT',
                body: JSON.stringify(rest),
            });
            return toolOk(data);
        }
        case 'create_message': {
            validateRequired(args, ['ticketId', 'agentEmail', 'bodyText']);
            const data = await gorgiasFetch(email, apiKey, domain, `/tickets/${args.ticketId}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    channel: 'email',
                    source: { type: 'email', from: { address: args.agentEmail } },
                    body_text: args.bodyText,
                    sender: { email: args.agentEmail },
                }),
            });
            return toolOk(data);
        }
        case 'list_customers': {
            const limit = (args.limit as number) ?? 25;
            const page = (args.page as number) ?? 1;
            const data = await gorgiasFetch(email, apiKey, domain, `/customers?limit=${limit}&page=${page}`);
            return toolOk(data);
        }
        case 'get_customer': {
            validateRequired(args, ['customerId']);
            const data = await gorgiasFetch(email, apiKey, domain, `/customers/${args.customerId}`);
            return toolOk(data);
        }
        case 'list_tags': {
            const limit = (args.limit as number) ?? 100;
            const data = await gorgiasFetch(email, apiKey, domain, `/tags?limit=${limit}`);
            return toolOk(data);
        }
        case 'list_satisfaction_surveys': {
            const limit = (args.limit as number) ?? 25;
            const page = (args.page as number) ?? 1;
            const data = await gorgiasFetch(email, apiKey, domain, `/satisfaction-surveys?limit=${limit}&page=${page}`);
            return toolOk(data);
        }
        case 'list_macros': {
            const limit = (args.limit as number) ?? 25;
            const page = (args.page as number) ?? 1;
            const data = await gorgiasFetch(email, apiKey, domain, `/macros?limit=${limit}&page=${page}`);
            return toolOk(data);
        }
        case 'get_stats': {
            const data = await gorgiasFetch(email, apiKey, domain, '/stats/overview');
            return toolOk(data);
        }
        case 'list_users': {
            const limit = (args.limit as number) ?? 50;
            const data = await gorgiasFetch(email, apiKey, domain, `/users?limit=${limit}`);
            return toolOk(data);
        }
        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

export default { fetch: handleRequest };
