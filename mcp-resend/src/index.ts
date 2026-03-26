/**
 * Resend MCP Worker
 * Implements MCP protocol over HTTP for Resend email API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: RESEND_API_KEY → header: X-Mcp-Secret-RESEND-API-KEY
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-resend
 */

const RESEND_API = 'https://api.resend.com';

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
        name: 'send_email',
        description: 'Send a transactional email via Resend',
        inputSchema: {
            type: 'object',
            properties: {
                from: { type: 'string', description: "Sender address — must be a verified domain (e.g. 'noreply@yourdomain.com' or 'Your Name <hello@yourdomain.com>')" },
                to: { type: 'string', description: 'Recipient email address (or comma-separated list)' },
                subject: { type: 'string', description: 'Email subject line' },
                html: { type: 'string', description: 'Email body as HTML (use html or text)' },
                text: { type: 'string', description: 'Email body as plain text (use html or text)' },
                reply_to: { type: 'string', description: 'Reply-to address (optional)' },
                cc: { type: 'string', description: 'CC addresses comma-separated (optional)' },
                bcc: { type: 'string', description: 'BCC addresses comma-separated (optional)' },
            },
            required: ['from', 'to', 'subject'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_email',
        description: 'Get the status and details of a sent email by its ID',
        inputSchema: {
            type: 'object',
            properties: {
                email_id: { type: 'string', description: 'Resend email ID' },
            },
            required: ['email_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_emails',
        description: 'List recent emails sent via Resend',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max emails to return (default 10)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_domains',
        description: 'List sending domains configured in the Resend account',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'cancel_email',
        description: 'Cancel a scheduled email that has not yet been sent',
        inputSchema: {
            type: 'object',
            properties: {
                email_id: { type: 'string', description: 'Resend email ID to cancel' },
            },
            required: ['email_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

async function resend(path: string, key: string, opts: RequestInit = {}) {
    const res = await fetch(`${RESEND_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`Resend API ${res.status}: ${err.message ?? err.name ?? 'unknown error'}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, key: string): Promise<unknown> {
    switch (name) {
        case 'send_email': {
            if (!args.html && !args.text) {
                throw new Error('Either html or text is required for send_email');
            }
            const body: Record<string, unknown> = {
                from: args.from,
                to: typeof args.to === 'string' ? args.to.split(',').map(s => s.trim()) : args.to,
                subject: args.subject,
            };
            if (args.html) body.html = args.html;
            if (args.text) body.text = args.text;
            if (args.reply_to) body.reply_to = args.reply_to;
            if (args.cc) body.cc = (args.cc as string).split(',').map(s => s.trim());
            if (args.bcc) body.bcc = (args.bcc as string).split(',').map(s => s.trim());

            const data = await resend('/emails', key, { method: 'POST', body: JSON.stringify(body) }) as any;
            return { id: data.id, to: args.to, subject: args.subject, status: 'sent' };
        }

        case 'get_email': {
            const data = await resend(`/emails/${args.email_id}`, key) as any;
            return {
                id: data.id,
                from: data.from,
                to: data.to,
                subject: data.subject,
                status: data.last_event,
                created_at: data.created_at,
            };
        }

        case 'list_emails': {
            const limit = Math.min(Number(args.limit ?? 10), 100);
            const data = await resend(`/emails?limit=${limit}`, key) as any;
            return data.data?.map((e: any) => ({
                id: e.id,
                from: e.from,
                to: e.to,
                subject: e.subject,
                status: e.last_event,
                created_at: e.created_at,
            })) ?? [];
        }

        case 'list_domains': {
            const data = await resend('/domains', key) as any;
            return data.data?.map((d: any) => ({
                id: d.id,
                name: d.name,
                status: d.status,
                region: d.region,
                created_at: d.created_at,
            })) ?? [];
        }

        case 'cancel_email': {
            await resend(`/emails/${args.email_id}/cancel`, key, { method: 'POST', body: '{}' });
            return { success: true, email_id: args.email_id };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'resend-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'resend-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const key = request.headers.get('X-Mcp-Secret-RESEND-API-KEY');
            if (!key) {
                return rpcErr(id, -32001, 'Missing RESEND_API_KEY secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, key);
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
