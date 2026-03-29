/**
 * Copper CRM MCP Worker
 * Implements MCP protocol over HTTP for Copper CRM (Google Workspace CRM) operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   COPPER_API_KEY    → X-Mcp-Secret-COPPER-API-KEY
 *   COPPER_USER_EMAIL → X-Mcp-Secret-COPPER-USER-EMAIL
 */

const COPPER_BASE = 'https://api.copper.com/developer_api/v1';

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
        name: 'list_people',
        description: 'List people (contacts) in Copper CRM',
        inputSchema: {
            type: 'object',
            properties: {
                page_size: { type: 'number', description: 'Page size (default: 25)' },
                page_number: { type: 'number', description: 'Page number (default: 1)' },
                sort_by: { type: 'string', description: 'Sort field (e.g. name)' },
                sort_direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_person',
        description: 'Create a new person in Copper CRM',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Full name (required)' },
                emails: { type: 'array', description: 'Array of email objects {email, category}' },
                phone_numbers: { type: 'array', description: 'Array of phone objects {number, category}' },
                address: { type: 'object', description: 'Address object' },
                company_id: { type: 'number', description: 'Associated company ID' },
                title: { type: 'string', description: 'Job title' },
                details: { type: 'string', description: 'Additional details' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_person',
        description: 'Get a specific person by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Person ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_person',
        description: 'Update a person in Copper CRM',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Person ID (required)' },
                name: { type: 'string' },
                emails: { type: 'array' },
                phone_numbers: { type: 'array' },
                title: { type: 'string' },
                details: { type: 'string' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_person',
        description: 'Delete a person from Copper CRM',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Person ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_companies',
        description: 'List companies in Copper CRM',
        inputSchema: {
            type: 'object',
            properties: {
                page_size: { type: 'number', description: 'Page size (default: 25)' },
                page_number: { type: 'number', description: 'Page number (default: 1)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_company',
        description: 'Create a new company in Copper CRM',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Company name (required)' },
                phone_numbers: { type: 'array', description: 'Array of phone objects' },
                address: { type: 'object', description: 'Address object' },
                details: { type: 'string' },
                industry: { type: 'string' },
                website: { type: 'string' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_company',
        description: 'Get a specific company by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Company ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_company',
        description: 'Update a company in Copper CRM',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Company ID (required)' },
                name: { type: 'string' },
                industry: { type: 'string' },
                website: { type: 'string' },
                details: { type: 'string' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_opportunities',
        description: 'List opportunities (deals) in Copper CRM',
        inputSchema: {
            type: 'object',
            properties: {
                page_size: { type: 'number', description: 'Page size (default: 25)' },
                page_number: { type: 'number', description: 'Page number (default: 1)' },
                sort_by: { type: 'string', enum: ['name', 'priority', 'close_date'], description: 'Sort field' },
                status: { type: 'string', enum: ['Open', 'Won', 'Lost', 'Abandoned'], description: 'Filter by status' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_opportunity',
        description: 'Create a new opportunity in Copper CRM',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Opportunity name (required)' },
                primary_contact_id: { type: 'number', description: 'Primary contact ID' },
                company_id: { type: 'number', description: 'Company ID' },
                status: { type: 'string', description: 'Status (default: Open)' },
                monetary_value: { type: 'number', description: 'Deal value' },
                close_date: { type: 'number', description: 'Close date as Unix timestamp' },
                pipeline_id: { type: 'number' },
                pipeline_stage_id: { type: 'number' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_opportunity',
        description: 'Get a specific opportunity by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Opportunity ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_opportunity',
        description: 'Update an opportunity in Copper CRM',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Opportunity ID (required)' },
                name: { type: 'string' },
                status: { type: 'string' },
                monetary_value: { type: 'number' },
                close_date: { type: 'number' },
                pipeline_stage_id: { type: 'number' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_activities',
        description: 'List activities in Copper CRM',
        inputSchema: {
            type: 'object',
            properties: {
                page_size: { type: 'number', description: 'Page size (default: 25)' },
                parent_type: { type: 'string', description: 'Parent type for filtering (e.g. person, company)' },
                parent_id: { type: 'number', description: 'Parent ID for filtering' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_task',
        description: 'Create a new task in Copper CRM',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Task name (required)' },
                related_type: { type: 'string', description: 'Related resource type' },
                related_id: { type: 'number', description: 'Related resource ID' },
                due_date: { type: 'number', description: 'Due date as Unix timestamp' },
                status: { type: 'string', description: 'Status (default: Open)' },
                priority: { type: 'string', description: 'Priority (default: None)' },
                details: { type: 'string', description: 'Task details' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'search_records',
        description: 'Search records in Copper CRM by entity type',
        inputSchema: {
            type: 'object',
            properties: {
                entity: { type: 'string', description: 'Entity type (required)', enum: ['people', 'companies', 'opportunities'] },
                name: { type: 'string', description: 'Name to search for' },
                page_size: { type: 'number', description: 'Page size (default: 25)' },
            },
            required: ['entity'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

function getSecrets(request: Request): { apiKey: string; userEmail: string } | null {
    const apiKey = request.headers.get('X-Mcp-Secret-COPPER-API-KEY');
    const userEmail = request.headers.get('X-Mcp-Secret-COPPER-USER-EMAIL');
    if (!apiKey || !userEmail) return null;
    return { apiKey, userEmail };
}

async function copperFetch(
    path: string,
    apiKey: string,
    userEmail: string,
    options: RequestInit = {},
): Promise<unknown> {
    const res = await fetch(`${COPPER_BASE}${path}`, {
        ...options,
        headers: {
            'X-PW-AccessToken': apiKey,
            'X-PW-Application': 'developer_api',
            'X-PW-UserEmail': userEmail,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Copper API ${res.status}: ${text}`);
    }
    if (res.status === 204) return {};
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string, userEmail: string): Promise<unknown> {
    switch (name) {
        case 'list_people': {
            const body = {
                page_size: args.page_size ?? 25,
                page_number: args.page_number ?? 1,
                sort_by: args.sort_by ?? 'name',
                sort_direction: args.sort_direction ?? 'asc',
            };
            return copperFetch('/people/search', apiKey, userEmail, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'create_person': {
            if (!args.name) throw new Error('name is required');
            const body: Record<string, unknown> = { name: args.name };
            if (args.emails) body.emails = args.emails;
            if (args.phone_numbers) body.phone_numbers = args.phone_numbers;
            if (args.address) body.address = args.address;
            if (args.company_id) body.company_id = args.company_id;
            if (args.title) body.title = args.title;
            if (args.details) body.details = args.details;
            return copperFetch('/people', apiKey, userEmail, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_person': {
            if (!args.id) throw new Error('id is required');
            return copperFetch(`/people/${args.id}`, apiKey, userEmail);
        }

        case 'update_person': {
            if (!args.id) throw new Error('id is required');
            const { id, ...rest } = args;
            return copperFetch(`/people/${id}`, apiKey, userEmail, {
                method: 'PUT',
                body: JSON.stringify(rest),
            });
        }

        case 'delete_person': {
            if (!args.id) throw new Error('id is required');
            await copperFetch(`/people/${args.id}`, apiKey, userEmail, { method: 'DELETE' });
            return { success: true, id: args.id };
        }

        case 'list_companies': {
            const body = {
                page_size: args.page_size ?? 25,
                page_number: args.page_number ?? 1,
            };
            return copperFetch('/companies/search', apiKey, userEmail, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'create_company': {
            if (!args.name) throw new Error('name is required');
            const body: Record<string, unknown> = { name: args.name };
            if (args.phone_numbers) body.phone_numbers = args.phone_numbers;
            if (args.address) body.address = args.address;
            if (args.details) body.details = args.details;
            if (args.industry) body.industry = args.industry;
            if (args.website) body.website = args.website;
            return copperFetch('/companies', apiKey, userEmail, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_company': {
            if (!args.id) throw new Error('id is required');
            return copperFetch(`/companies/${args.id}`, apiKey, userEmail);
        }

        case 'update_company': {
            if (!args.id) throw new Error('id is required');
            const { id, ...rest } = args;
            return copperFetch(`/companies/${id}`, apiKey, userEmail, {
                method: 'PUT',
                body: JSON.stringify(rest),
            });
        }

        case 'list_opportunities': {
            const body: Record<string, unknown> = {
                page_size: args.page_size ?? 25,
                page_number: args.page_number ?? 1,
            };
            if (args.sort_by) body.sort_by = args.sort_by;
            if (args.status) body.status = args.status;
            return copperFetch('/opportunities/search', apiKey, userEmail, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'create_opportunity': {
            if (!args.name) throw new Error('name is required');
            const body: Record<string, unknown> = {
                name: args.name,
                status: args.status ?? 'Open',
            };
            if (args.primary_contact_id) body.primary_contact_id = args.primary_contact_id;
            if (args.company_id) body.company_id = args.company_id;
            if (args.monetary_value != null) body.monetary_value = args.monetary_value;
            if (args.close_date != null) body.close_date = args.close_date;
            if (args.pipeline_id) body.pipeline_id = args.pipeline_id;
            if (args.pipeline_stage_id) body.pipeline_stage_id = args.pipeline_stage_id;
            return copperFetch('/opportunities', apiKey, userEmail, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_opportunity': {
            if (!args.id) throw new Error('id is required');
            return copperFetch(`/opportunities/${args.id}`, apiKey, userEmail);
        }

        case 'update_opportunity': {
            if (!args.id) throw new Error('id is required');
            const { id, ...rest } = args;
            return copperFetch(`/opportunities/${id}`, apiKey, userEmail, {
                method: 'PUT',
                body: JSON.stringify(rest),
            });
        }

        case 'list_activities': {
            const body: Record<string, unknown> = {
                page_size: args.page_size ?? 25,
            };
            if (args.parent_type && args.parent_id) {
                body.parent = { type: args.parent_type, id: args.parent_id };
            }
            return copperFetch('/activities/search', apiKey, userEmail, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'create_task': {
            if (!args.name) throw new Error('name is required');
            const body: Record<string, unknown> = {
                name: args.name,
                status: args.status ?? 'Open',
                priority: args.priority ?? 'None',
            };
            if (args.related_type && args.related_id) {
                body.related_resource = { type: args.related_type, id: args.related_id };
            }
            if (args.due_date != null) body.due_date = args.due_date;
            if (args.details) body.details = args.details;
            return copperFetch('/tasks', apiKey, userEmail, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'search_records': {
            if (!args.entity) throw new Error('entity is required');
            const body: Record<string, unknown> = {
                page_size: args.page_size ?? 25,
            };
            if (args.name) body.name = args.name;
            return copperFetch(`/${args.entity}/search`, apiKey, userEmail, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-copper', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-copper', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const secrets = getSecrets(request);
            if (!secrets) {
                return rpcErr(id, -32001, 'Missing required secrets: COPPER_API_KEY, COPPER_USER_EMAIL');
            }
            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};
            try {
                const result = await callTool(toolName, toolArgs, secrets.apiKey, secrets.userEmail);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
