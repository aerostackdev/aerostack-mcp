/**
 * PagerDuty MCP Worker
 * Implements MCP protocol over HTTP for PagerDuty incident management.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret:
 *   PAGERDUTY_API_KEY → X-Mcp-Secret-PAGERDUTY-API-KEY (REST API v2 token)
 */

const PD_API = 'https://api.pagerduty.com';

function rpcOk(id: unknown, result: unknown) {
    return Response.json({ jsonrpc: '2.0', id, result });
}

function rpcErr(id: unknown, code: number, message: string) {
    return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify PagerDuty API token by listing abilities. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_incidents',
        description: 'List incidents with optional status and urgency filters',
        inputSchema: {
            type: 'object',
            properties: {
                statuses: {
                    type: 'array',
                    items: { type: 'string', enum: ['triggered', 'acknowledged', 'resolved'] },
                    description: 'Filter by status (default: triggered, acknowledged)',
                },
                urgencies: {
                    type: 'array',
                    items: { type: 'string', enum: ['high', 'low'] },
                    description: 'Filter by urgency (optional)',
                },
                since: { type: 'string', description: 'ISO 8601 start date filter (optional)' },
                until: { type: 'string', description: 'ISO 8601 end date filter (optional)' },
                limit: { type: 'number', description: 'Max results to return (default 25, max 100)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_incident',
        description: 'Get full details for a specific incident by ID',
        inputSchema: {
            type: 'object',
            properties: {
                incident_id: { type: 'string', description: 'PagerDuty incident ID (e.g. P1234ABC)' },
            },
            required: ['incident_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'acknowledge_incident',
        description: 'Acknowledge one or more triggered incidents',
        inputSchema: {
            type: 'object',
            properties: {
                incident_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of incident IDs to acknowledge',
                },
                from_email: { type: 'string', description: 'Email of the user performing the action (required by PagerDuty)' },
            },
            required: ['incident_ids', 'from_email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'resolve_incident',
        description: 'Resolve one or more incidents',
        inputSchema: {
            type: 'object',
            properties: {
                incident_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of incident IDs to resolve',
                },
                from_email: { type: 'string', description: 'Email of the user performing the action (required by PagerDuty)' },
            },
            required: ['incident_ids', 'from_email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_services',
        description: 'List all services configured in PagerDuty',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Filter services by name (optional)' },
                limit: { type: 'number', description: 'Max results to return (default 25, max 100)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_oncalls',
        description: 'List current on-call entries across escalation policies',
        inputSchema: {
            type: 'object',
            properties: {
                escalation_policy_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Filter by escalation policy IDs (optional)',
                },
                since: { type: 'string', description: 'ISO 8601 start of on-call window (optional)' },
                until: { type: 'string', description: 'ISO 8601 end of on-call window (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_incident',
        description: 'Create a new incident on a specified service',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Incident title' },
                service_id: { type: 'string', description: 'ID of the service to create the incident on' },
                urgency: { type: 'string', enum: ['high', 'low'], description: 'Incident urgency (default: high)' },
                body: { type: 'string', description: 'Detailed incident description (optional)' },
                escalation_policy_id: { type: 'string', description: 'Override escalation policy ID (optional)' },
                from_email: { type: 'string', description: 'Email of the user creating the incident (required by PagerDuty)' },
            },
            required: ['title', 'service_id', 'from_email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_escalation_policies',
        description: 'List escalation policies configured in PagerDuty',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Filter policies by name (optional)' },
                limit: { type: 'number', description: 'Max results to return (default 25, max 100)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function pdApi(
    path: string,
    apiKey: string,
    opts: RequestInit = {},
): Promise<unknown> {
    const url = `${PD_API}${path}`;
    const res = await fetch(url, {
        ...opts,
        headers: {
            Authorization: `Token token=${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.pagerduty+json;version=2',
            ...(opts.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        throw new Error(`PagerDuty API error ${res.status}: ${await res.text()}`);
    }
    return res.json();
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await pdApi('/abilities', apiKey) as any;
            return text(`Connected to PagerDuty. Available abilities: ${(data.abilities ?? []).join(', ')}`);
        }

        case 'list_incidents': {
            const params = new URLSearchParams();
            const statuses = (args.statuses as string[]) ?? ['triggered', 'acknowledged'];
            for (const s of statuses) params.append('statuses[]', s);
            if (args.urgencies) {
                for (const u of args.urgencies as string[]) params.append('urgencies[]', u);
            }
            if (args.since) params.set('since', String(args.since));
            if (args.until) params.set('until', String(args.until));
            params.set('limit', String(Math.min(Number(args.limit ?? 25), 100)));
            const data = await pdApi(`/incidents?${params}`, apiKey) as any;
            return json((data.incidents ?? []).map((i: any) => ({
                id: i.id,
                incident_number: i.incident_number,
                title: i.title,
                status: i.status,
                urgency: i.urgency,
                created_at: i.created_at,
                service: { id: i.service?.id, summary: i.service?.summary },
                assigned_to: (i.assignments ?? []).map((a: any) => a.assignee?.summary),
                html_url: i.html_url,
            })));
        }

        case 'get_incident': {
            if (!args.incident_id) throw new Error('incident_id is required');
            const data = await pdApi(`/incidents/${args.incident_id}`, apiKey) as any;
            const i = data.incident;
            return json({
                id: i.id,
                incident_number: i.incident_number,
                title: i.title,
                description: i.description,
                status: i.status,
                urgency: i.urgency,
                created_at: i.created_at,
                resolved_at: i.resolved_at,
                service: { id: i.service?.id, summary: i.service?.summary },
                escalation_policy: { id: i.escalation_policy?.id, summary: i.escalation_policy?.summary },
                assigned_to: (i.assignments ?? []).map((a: any) => ({
                    assignee: a.assignee?.summary,
                    at: a.at,
                })),
                acknowledgements: (i.acknowledgements ?? []).map((a: any) => ({
                    acknowledger: a.acknowledger?.summary,
                    at: a.at,
                })),
                last_status_change_at: i.last_status_change_at,
                html_url: i.html_url,
            });
        }

        case 'acknowledge_incident': {
            if (!args.incident_ids || !(args.incident_ids as string[]).length) throw new Error('incident_ids is required');
            if (!args.from_email) throw new Error('from_email is required');
            const incidents = (args.incident_ids as string[]).map(id => ({
                id,
                type: 'incident_reference' as const,
                status: 'acknowledged' as const,
            }));
            const data = await pdApi('/incidents', apiKey, {
                method: 'PUT',
                headers: { From: String(args.from_email) } as any,
                body: JSON.stringify({ incidents }),
            }) as any;
            return json((data.incidents ?? []).map((i: any) => ({
                id: i.id,
                title: i.title,
                status: i.status,
            })));
        }

        case 'resolve_incident': {
            if (!args.incident_ids || !(args.incident_ids as string[]).length) throw new Error('incident_ids is required');
            if (!args.from_email) throw new Error('from_email is required');
            const incidents = (args.incident_ids as string[]).map(id => ({
                id,
                type: 'incident_reference' as const,
                status: 'resolved' as const,
            }));
            const data = await pdApi('/incidents', apiKey, {
                method: 'PUT',
                headers: { From: String(args.from_email) } as any,
                body: JSON.stringify({ incidents }),
            }) as any;
            return json((data.incidents ?? []).map((i: any) => ({
                id: i.id,
                title: i.title,
                status: i.status,
            })));
        }

        case 'list_services': {
            const params = new URLSearchParams();
            if (args.query) params.set('query', String(args.query));
            params.set('limit', String(Math.min(Number(args.limit ?? 25), 100)));
            const data = await pdApi(`/services?${params}`, apiKey) as any;
            return json((data.services ?? []).map((s: any) => ({
                id: s.id,
                name: s.name,
                description: s.description,
                status: s.status,
                escalation_policy: { id: s.escalation_policy?.id, summary: s.escalation_policy?.summary },
                created_at: s.created_at,
                html_url: s.html_url,
            })));
        }

        case 'list_oncalls': {
            const params = new URLSearchParams();
            if (args.escalation_policy_ids) {
                for (const id of args.escalation_policy_ids as string[]) params.append('escalation_policy_ids[]', id);
            }
            if (args.since) params.set('since', String(args.since));
            if (args.until) params.set('until', String(args.until));
            const data = await pdApi(`/oncalls?${params}`, apiKey) as any;
            return json((data.oncalls ?? []).map((o: any) => ({
                escalation_level: o.escalation_level,
                user: { id: o.user?.id, summary: o.user?.summary, html_url: o.user?.html_url },
                schedule: o.schedule ? { id: o.schedule.id, summary: o.schedule.summary } : null,
                escalation_policy: { id: o.escalation_policy?.id, summary: o.escalation_policy?.summary },
                start: o.start,
                end: o.end,
            })));
        }

        case 'create_incident': {
            if (!args.title) throw new Error('title is required');
            if (!args.service_id) throw new Error('service_id is required');
            if (!args.from_email) throw new Error('from_email is required');
            const incident: Record<string, unknown> = {
                type: 'incident',
                title: args.title,
                service: { id: args.service_id, type: 'service_reference' },
                urgency: args.urgency ?? 'high',
            };
            if (args.body) {
                incident.body = { type: 'incident_body', details: args.body };
            }
            if (args.escalation_policy_id) {
                incident.escalation_policy = { id: args.escalation_policy_id, type: 'escalation_policy_reference' };
            }
            const data = await pdApi('/incidents', apiKey, {
                method: 'POST',
                headers: { From: String(args.from_email) } as any,
                body: JSON.stringify({ incident }),
            }) as any;
            const i = data.incident;
            return json({
                id: i.id,
                incident_number: i.incident_number,
                title: i.title,
                status: i.status,
                urgency: i.urgency,
                html_url: i.html_url,
            });
        }

        case 'list_escalation_policies': {
            const params = new URLSearchParams();
            if (args.query) params.set('query', String(args.query));
            params.set('limit', String(Math.min(Number(args.limit ?? 25), 100)));
            const data = await pdApi(`/escalation_policies?${params}`, apiKey) as any;
            return json((data.escalation_policies ?? []).map((p: any) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                num_loops: p.num_loops,
                escalation_rules: (p.escalation_rules ?? []).map((r: any) => ({
                    escalation_delay_in_minutes: r.escalation_delay_in_minutes,
                    targets: (r.targets ?? []).map((t: any) => ({ type: t.type, summary: t.summary })),
                })),
                html_url: p.html_url,
            })));
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return Response.json({ status: 'ok', server: 'pagerduty-mcp', version: '1.0.0' });
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
                serverInfo: { name: 'pagerduty-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-PAGERDUTY-API-KEY');

            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: PAGERDUTY_API_KEY');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, apiKey);
                // _ping returns its own content array, others return via json()/text() helpers
                if (toolName === '_ping') {
                    return rpcOk(id, result);
                }
                return rpcOk(id, result);
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
