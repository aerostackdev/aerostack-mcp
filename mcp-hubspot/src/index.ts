/**
 * HubSpot MCP Worker
 * Implements MCP protocol over HTTP for HubSpot CRM API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: HUBSPOT_ACCESS_TOKEN → header: X-Mcp-Secret-HUBSPOT-ACCESS-TOKEN
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-hubspot
 */

const HUBSPOT_API = 'https://api.hubapi.com';

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
        name: 'search_contacts',
        description: 'Search HubSpot contacts by email, name, or other properties',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search text (searches email, firstname, lastname, company)' },
                limit: { type: 'number', description: 'Max results (default 10)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_contact',
        description: 'Get details of a HubSpot contact by ID',
        inputSchema: {
            type: 'object',
            properties: {
                contact_id: { type: 'string', description: 'HubSpot contact ID' },
            },
            required: ['contact_id'],
        },
    },
    {
        name: 'create_contact',
        description: 'Create a new contact in HubSpot',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Contact email address' },
                firstname: { type: 'string', description: 'First name (optional)' },
                lastname: { type: 'string', description: 'Last name (optional)' },
                company: { type: 'string', description: 'Company name (optional)' },
                phone: { type: 'string', description: 'Phone number (optional)' },
            },
            required: ['email'],
        },
    },
    {
        name: 'list_deals',
        description: 'List deals in HubSpot CRM pipeline',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default 10)' },
            },
        },
    },
    {
        name: 'create_deal',
        description: 'Create a new deal in HubSpot',
        inputSchema: {
            type: 'object',
            properties: {
                dealname: { type: 'string', description: 'Deal name' },
                amount: { type: 'number', description: 'Deal value/amount (optional)' },
                dealstage: { type: 'string', description: 'Deal stage ID (optional — use list_deal_stages to find IDs)' },
                closedate: { type: 'string', description: 'Expected close date in ISO format e.g. 2024-12-31 (optional)' },
                pipeline: { type: 'string', description: 'Pipeline ID (optional, defaults to default pipeline)' },
            },
            required: ['dealname'],
        },
    },
    {
        name: 'list_companies',
        description: 'List companies in HubSpot CRM',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default 10)' },
            },
        },
    },
    {
        name: 'search_companies',
        description: 'Search HubSpot companies by name or domain',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Company name or domain to search' },
                limit: { type: 'number', description: 'Max results (default 10)' },
            },
            required: ['query'],
        },
    },
];

async function hs(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${HUBSPOT_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`HubSpot API ${res.status}: ${err.message ?? JSON.stringify(err)}`);
    }
    return res.json();
}

function flattenHsProps(props: Record<string, string>): Record<string, string> {
    return props;
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'search_contacts': {
            const limit = Math.min(Number(args.limit ?? 10), 100);
            const data = await hs('/crm/v3/objects/contacts/search', token, {
                method: 'POST',
                body: JSON.stringify({
                    query: args.query,
                    limit,
                    properties: ['firstname', 'lastname', 'email', 'phone', 'company', 'createdate', 'lastmodifieddate'],
                }),
            }) as any;
            return data.results?.map((c: any) => ({
                id: c.id,
                email: c.properties.email,
                name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' '),
                company: c.properties.company,
                phone: c.properties.phone,
                created: c.properties.createdate,
            })) ?? [];
        }

        case 'get_contact': {
            const data = await hs(
                `/crm/v3/objects/contacts/${args.contact_id}?properties=firstname,lastname,email,phone,company,lifecyclestage,createdate,lastmodifieddate`,
                token,
            ) as any;
            return {
                id: data.id,
                email: data.properties.email,
                name: [data.properties.firstname, data.properties.lastname].filter(Boolean).join(' '),
                company: data.properties.company,
                phone: data.properties.phone,
                lifecycle_stage: data.properties.lifecyclestage,
                created: data.properties.createdate,
                last_modified: data.properties.lastmodifieddate,
            };
        }

        case 'create_contact': {
            const properties: Record<string, string> = { email: String(args.email) };
            if (args.firstname) properties.firstname = String(args.firstname);
            if (args.lastname) properties.lastname = String(args.lastname);
            if (args.company) properties.company = String(args.company);
            if (args.phone) properties.phone = String(args.phone);

            const data = await hs('/crm/v3/objects/contacts', token, {
                method: 'POST',
                body: JSON.stringify({ properties }),
            }) as any;
            return {
                id: data.id,
                email: data.properties.email,
                name: [data.properties.firstname, data.properties.lastname].filter(Boolean).join(' '),
            };
        }

        case 'list_deals': {
            const limit = Math.min(Number(args.limit ?? 10), 100);
            const data = await hs(
                `/crm/v3/objects/deals?limit=${limit}&properties=dealname,amount,dealstage,closedate,pipeline`,
                token,
            ) as any;
            return data.results?.map((d: any) => ({
                id: d.id,
                name: d.properties.dealname,
                amount: d.properties.amount,
                stage: d.properties.dealstage,
                close_date: d.properties.closedate,
                pipeline: d.properties.pipeline,
            })) ?? [];
        }

        case 'create_deal': {
            const properties: Record<string, string> = { dealname: String(args.dealname) };
            if (args.amount !== undefined) properties.amount = String(args.amount);
            if (args.dealstage) properties.dealstage = String(args.dealstage);
            if (args.closedate) properties.closedate = String(args.closedate);
            if (args.pipeline) properties.pipeline = String(args.pipeline);

            const data = await hs('/crm/v3/objects/deals', token, {
                method: 'POST',
                body: JSON.stringify({ properties }),
            }) as any;
            return {
                id: data.id,
                name: data.properties.dealname,
                stage: data.properties.dealstage,
                amount: data.properties.amount,
            };
        }

        case 'list_companies': {
            const limit = Math.min(Number(args.limit ?? 10), 100);
            const data = await hs(
                `/crm/v3/objects/companies?limit=${limit}&properties=name,domain,industry,city,phone,numberofemployees`,
                token,
            ) as any;
            return data.results?.map((c: any) => ({
                id: c.id,
                name: c.properties.name,
                domain: c.properties.domain,
                industry: c.properties.industry,
                city: c.properties.city,
                employees: c.properties.numberofemployees,
            })) ?? [];
        }

        case 'search_companies': {
            const limit = Math.min(Number(args.limit ?? 10), 100);
            const data = await hs('/crm/v3/objects/companies/search', token, {
                method: 'POST',
                body: JSON.stringify({
                    query: args.query,
                    limit,
                    properties: ['name', 'domain', 'industry', 'city', 'phone'],
                }),
            }) as any;
            return data.results?.map((c: any) => ({
                id: c.id,
                name: c.properties.name,
                domain: c.properties.domain,
                industry: c.properties.industry,
                city: c.properties.city,
            })) ?? [];
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'hubspot-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'hubspot-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-HUBSPOT-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing HUBSPOT_ACCESS_TOKEN secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
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
