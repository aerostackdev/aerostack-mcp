/**
 * Twilio MCP Worker
 * Implements MCP protocol over HTTP for Twilio SMS/messaging operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   TWILIO_ACCOUNT_SID → header: X-Mcp-Secret-TWILIO-ACCOUNT-SID
 *   TWILIO_AUTH_TOKEN  → header: X-Mcp-Secret-TWILIO-AUTH-TOKEN
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-twilio
 */

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
        name: 'send_sms',
        description: 'Send an SMS message via Twilio',
        inputSchema: {
            type: 'object',
            properties: {
                to: { type: 'string', description: 'Recipient phone number in E.164 format (e.g. +14155551234)' },
                from: { type: 'string', description: 'Twilio phone number in E.164 format (must be in your account)' },
                body: { type: 'string', description: 'SMS message text content (max 1600 characters)' },
            },
            required: ['to', 'from', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_messages',
        description: 'List SMS/MMS messages sent or received on the Twilio account',
        inputSchema: {
            type: 'object',
            properties: {
                to: { type: 'string', description: 'Filter by recipient phone number (optional)' },
                from: { type: 'string', description: 'Filter by sender phone number (optional)' },
                limit: { type: 'number', description: 'Max results (default 10, max 100)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_message',
        description: 'Get status and details of a specific Twilio message',
        inputSchema: {
            type: 'object',
            properties: {
                message_sid: { type: 'string', description: 'Twilio message SID (starts with SM or MM)' },
            },
            required: ['message_sid'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_phone_numbers',
        description: 'List phone numbers purchased/configured in the Twilio account',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default 10)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_account_info',
        description: 'Get basic information about the Twilio account',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

function twilioBaseUrl(accountSid: string): string {
    return `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
}

async function twilio(path: string, accountSid: string, authToken: string, opts: RequestInit = {}) {
    const auth = `Basic ${btoa(`${accountSid}:${authToken}`)}`;
    const url = path.startsWith('http') ? path : `${twilioBaseUrl(accountSid)}${path}`;
    const res = await fetch(url, {
        ...opts,
        headers: {
            Authorization: auth,
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`Twilio API ${res.status}: ${err.message ?? err.code ?? 'unknown'}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, accountSid: string, authToken: string): Promise<unknown> {
    switch (name) {
        case 'send_sms': {
            const body = new URLSearchParams({
                To: String(args.to),
                From: String(args.from),
                Body: String(args.body),
            });
            const data = await twilio('/Messages.json', accountSid, authToken, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            }) as any;
            return {
                sid: data.sid,
                status: data.status,
                to: data.to,
                from: data.from,
                body: data.body,
                date_created: data.date_created,
            };
        }

        case 'list_messages': {
            const params = new URLSearchParams({
                PageSize: String(Math.min(Number(args.limit ?? 10), 100)),
            });
            if (args.to) params.set('To', String(args.to));
            if (args.from) params.set('From', String(args.from));
            const data = await twilio(`/Messages.json?${params}`, accountSid, authToken) as any;
            return data.messages?.map((m: any) => ({
                sid: m.sid,
                to: m.to,
                from: m.from,
                body: m.body,
                status: m.status,
                direction: m.direction,
                date_created: m.date_created,
                price: m.price ? `${m.price} ${m.price_unit}` : null,
            })) ?? [];
        }

        case 'get_message': {
            const data = await twilio(`/Messages/${args.message_sid}.json`, accountSid, authToken) as any;
            return {
                sid: data.sid,
                to: data.to,
                from: data.from,
                body: data.body,
                status: data.status,
                direction: data.direction,
                error_code: data.error_code,
                error_message: data.error_message,
                date_created: data.date_created,
                date_sent: data.date_sent,
                price: data.price ? `${data.price} ${data.price_unit}` : null,
            };
        }

        case 'list_phone_numbers': {
            const params = new URLSearchParams({ PageSize: String(Math.min(Number(args.limit ?? 10), 100)) });
            const data = await twilio(`/IncomingPhoneNumbers.json?${params}`, accountSid, authToken) as any;
            return data.incoming_phone_numbers?.map((n: any) => ({
                sid: n.sid,
                phone_number: n.phone_number,
                friendly_name: n.friendly_name,
                capabilities: n.capabilities,
                date_created: n.date_created,
            })) ?? [];
        }

        case 'get_account_info': {
            const data = await twilio('.json', accountSid, authToken) as any;
            return {
                sid: data.sid,
                friendly_name: data.friendly_name,
                status: data.status,
                type: data.type,
                date_created: data.date_created,
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'twilio-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'twilio-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const accountSid = request.headers.get('X-Mcp-Secret-TWILIO-ACCOUNT-SID');
            const authToken = request.headers.get('X-Mcp-Secret-TWILIO-AUTH-TOKEN');
            if (!accountSid || !authToken) {
                return rpcErr(id, -32001, 'Missing secrets — add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, accountSid, authToken);
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
