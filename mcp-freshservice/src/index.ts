/**
 * Freshservice MCP Worker
 * Implements MCP protocol over HTTP for Freshservice IT service management operations.
 * Secrets received via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   FRESHSERVICE_API_KEY → X-Mcp-Secret-FRESHSERVICE-API-KEY
 *   FRESHSERVICE_DOMAIN  → X-Mcp-Secret-FRESHSERVICE-DOMAIN
 *
 * Auth: Authorization: Basic {btoa(apiKey + ':X')}
 * Base URL: https://{domain}.freshservice.com/api/v2
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

async function fsFetch(apiKey: string, domain: string, path: string, options: RequestInit = {}): Promise<unknown> {
    const base = `https://${domain}.freshservice.com/api/v2`;
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const credentials = btoa(`${apiKey}:X`);
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
    try { data = JSON.parse(text); } catch { throw { code: -32603, message: `Freshservice HTTP ${res.status}: ${text}` }; }
    if (!res.ok) {
        const d = data as Record<string, unknown>;
        const msg = (d?.description as string) || (d?.message as string) || res.statusText;
        throw { code: -32603, message: `Freshservice API error ${res.status}: ${msg}` };
    }
    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_tickets',
        description: 'List tickets with pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (default: 1)' },
                per_page: { type: 'number', description: 'Results per page (default: 30)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_ticket',
        description: 'Get full ticket details by ID.',
        inputSchema: {
            type: 'object',
            properties: { ticketId: { type: 'number', description: 'Freshservice ticket ID' } },
            required: ['ticketId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_ticket',
        description: 'Create a new service ticket.',
        inputSchema: {
            type: 'object',
            properties: {
                subject: { type: 'string', description: 'Ticket subject' },
                description: { type: 'string', description: 'Ticket description (HTML)' },
                email: { type: 'string', description: 'Requester email address' },
                priority: { type: 'number', description: 'Priority: 1=Low, 2=Medium, 3=High, 4=Urgent (default: 1)' },
                status: { type: 'number', description: 'Status: 2=Open, 3=Pending, 4=Resolved, 5=Closed (default: 2)' },
                type: { type: 'string', description: 'Ticket type (e.g. Incident, Service Request)' },
            },
            required: ['subject', 'email'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_ticket',
        description: 'Update ticket fields: status, priority, agent, or group.',
        inputSchema: {
            type: 'object',
            properties: {
                ticketId: { type: 'number', description: 'Ticket ID to update' },
                status: { type: 'number', description: 'New status code' },
                priority: { type: 'number', description: 'New priority code' },
                agent_id: { type: 'number', description: 'Assign to agent by ID' },
                group_id: { type: 'number', description: 'Assign to group by ID' },
            },
            required: ['ticketId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'delete_ticket',
        description: 'Permanently delete a ticket.',
        inputSchema: {
            type: 'object',
            properties: { ticketId: { type: 'number', description: 'Ticket ID to delete' } },
            required: ['ticketId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_ticket_conversations',
        description: 'List all conversations (notes and replies) on a ticket.',
        inputSchema: {
            type: 'object',
            properties: { ticketId: { type: 'number', description: 'Ticket ID' } },
            required: ['ticketId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'reply_to_ticket',
        description: 'Send a reply to a ticket.',
        inputSchema: {
            type: 'object',
            properties: {
                ticketId: { type: 'number', description: 'Ticket ID to reply to' },
                body: { type: 'string', description: 'Reply body (HTML)' },
                user_id: { type: 'number', description: 'Agent user ID sending the reply' },
                cc_emails: { type: 'array', items: { type: 'string' }, description: 'CC email addresses' },
            },
            required: ['ticketId', 'body'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_assets',
        description: 'List IT assets with pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (default: 1)' },
                per_page: { type: 'number', description: 'Results per page (default: 30)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_asset',
        description: 'Get asset details by ID.',
        inputSchema: {
            type: 'object',
            properties: { assetId: { type: 'number', description: 'Asset ID' } },
            required: ['assetId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_agents',
        description: 'List all agents in the account.',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (default: 1)' },
                per_page: { type: 'number', description: 'Results per page (default: 50)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_agent',
        description: 'Get agent details by ID.',
        inputSchema: {
            type: 'object',
            properties: { agentId: { type: 'number', description: 'Agent ID' } },
            required: ['agentId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_departments',
        description: 'List all departments in the organization.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_requesters',
        description: 'List requesters (end users) with pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (default: 1)' },
                per_page: { type: 'number', description: 'Results per page (default: 30)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_ticket_activities',
        description: 'Get all activity log entries for a ticket.',
        inputSchema: {
            type: 'object',
            properties: { ticketId: { type: 'number', description: 'Ticket ID' } },
            required: ['ticketId'],
        },
        annotations: { readOnlyHint: true },
    },
];

// ── Request handler ───────────────────────────────────────────────────────────

async function handleRequest(request: Request): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', mcp: 'mcp-freshservice' }), {
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
            serverInfo: { name: 'mcp-freshservice', version: '1.0.0' },
        });
    }

    if (body.method === 'tools/list') {
        return rpcOk(id, { tools: TOOLS });
    }

    if (body.method === 'tools/call') {
        const apiKey = request.headers.get('X-Mcp-Secret-FRESHSERVICE-API-KEY');
        const domain = request.headers.get('X-Mcp-Secret-FRESHSERVICE-DOMAIN');
        const missing = [];
        if (!apiKey) missing.push('FRESHSERVICE_API_KEY');
        if (!domain) missing.push('FRESHSERVICE_DOMAIN');
        if (missing.length > 0) return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);

        const toolName = (body.params?.name ?? '') as string;
        const args = (body.params?.arguments ?? {}) as Record<string, unknown>;

        try {
            const result = await dispatchTool(apiKey!, domain!, toolName, args);
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

async function dispatchTool(apiKey: string, domain: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case 'list_tickets': {
            const page = (args.page as number) ?? 1;
            const per_page = (args.per_page as number) ?? 30;
            const data = await fsFetch(apiKey, domain, `/tickets?page=${page}&per_page=${per_page}`);
            return toolOk(data);
        }
        case 'get_ticket': {
            validateRequired(args, ['ticketId']);
            const data = await fsFetch(apiKey, domain, `/tickets/${args.ticketId}`);
            return toolOk(data);
        }
        case 'create_ticket': {
            validateRequired(args, ['subject', 'email']);
            const ticketBody: Record<string, unknown> = {
                subject: args.subject,
                description: args.description ?? '',
                email: args.email,
                priority: args.priority ?? 1,
                status: args.status ?? 2,
            };
            if (args.type) ticketBody.type = args.type;
            const data = await fsFetch(apiKey, domain, '/tickets', {
                method: 'POST',
                body: JSON.stringify(ticketBody),
            });
            return toolOk(data);
        }
        case 'update_ticket': {
            validateRequired(args, ['ticketId']);
            const { ticketId, ...rest } = args;
            const data = await fsFetch(apiKey, domain, `/tickets/${ticketId}`, {
                method: 'PUT',
                body: JSON.stringify(rest),
            });
            return toolOk(data);
        }
        case 'delete_ticket': {
            validateRequired(args, ['ticketId']);
            await fsFetch(apiKey, domain, `/tickets/${args.ticketId}`, { method: 'DELETE' });
            return toolOk({ deleted: true });
        }
        case 'list_ticket_conversations': {
            validateRequired(args, ['ticketId']);
            const data = await fsFetch(apiKey, domain, `/tickets/${args.ticketId}/conversations`);
            return toolOk(data);
        }
        case 'reply_to_ticket': {
            validateRequired(args, ['ticketId', 'body']);
            const replyBody: Record<string, unknown> = { body: args.body };
            if (args.user_id) replyBody.user_id = args.user_id;
            if (args.cc_emails) replyBody.cc_emails = args.cc_emails;
            const data = await fsFetch(apiKey, domain, `/tickets/${args.ticketId}/reply`, {
                method: 'POST',
                body: JSON.stringify(replyBody),
            });
            return toolOk(data);
        }
        case 'list_assets': {
            const page = (args.page as number) ?? 1;
            const per_page = (args.per_page as number) ?? 30;
            const data = await fsFetch(apiKey, domain, `/assets?page=${page}&per_page=${per_page}`);
            return toolOk(data);
        }
        case 'get_asset': {
            validateRequired(args, ['assetId']);
            const data = await fsFetch(apiKey, domain, `/assets/${args.assetId}`);
            return toolOk(data);
        }
        case 'list_agents': {
            const page = (args.page as number) ?? 1;
            const per_page = (args.per_page as number) ?? 50;
            const data = await fsFetch(apiKey, domain, `/agents?page=${page}&per_page=${per_page}`);
            return toolOk(data);
        }
        case 'get_agent': {
            validateRequired(args, ['agentId']);
            const data = await fsFetch(apiKey, domain, `/agents/${args.agentId}`);
            return toolOk(data);
        }
        case 'list_departments': {
            const data = await fsFetch(apiKey, domain, '/departments');
            return toolOk(data);
        }
        case 'list_requesters': {
            const page = (args.page as number) ?? 1;
            const per_page = (args.per_page as number) ?? 30;
            const data = await fsFetch(apiKey, domain, `/requesters?page=${page}&per_page=${per_page}`);
            return toolOk(data);
        }
        case 'get_ticket_activities': {
            validateRequired(args, ['ticketId']);
            const data = await fsFetch(apiKey, domain, `/tickets/${args.ticketId}/activities`);
            return toolOk(data);
        }
        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

export default { fetch: handleRequest };
