/**
 * Notion MCP Worker
 * Implements MCP protocol over HTTP for Notion API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: NOTION_TOKEN → header: X-Mcp-Secret-NOTION-TOKEN
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-notion
 */

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

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
        name: 'search',
        description: 'Search Notion pages and databases by query text',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Text to search for' },
                filter_type: { type: 'string', enum: ['page', 'database'], description: 'Filter by object type (optional)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_page',
        description: "Get a Notion page's properties and metadata by its ID",
        inputSchema: {
            type: 'object',
            properties: {
                page_id: { type: 'string', description: 'Notion page ID (UUID, dashes optional)' },
            },
            required: ['page_id'],
        },
    },
    {
        name: 'get_page_content',
        description: 'Get the content blocks of a Notion page',
        inputSchema: {
            type: 'object',
            properties: {
                block_id: { type: 'string', description: 'Page or block ID to get children of' },
            },
            required: ['block_id'],
        },
    },
    {
        name: 'create_page',
        description: 'Create a new page in a Notion database',
        inputSchema: {
            type: 'object',
            properties: {
                database_id: { type: 'string', description: 'Database ID to create the page in' },
                title: { type: 'string', description: 'Page title' },
                properties: { type: 'object', description: 'Additional Notion property objects (optional)' },
            },
            required: ['database_id', 'title'],
        },
    },
    {
        name: 'update_page',
        description: "Update a Notion page's properties",
        inputSchema: {
            type: 'object',
            properties: {
                page_id: { type: 'string', description: 'Page ID to update' },
                properties: { type: 'object', description: 'Notion property objects to update' },
                archived: { type: 'boolean', description: 'Archive the page (optional)' },
            },
            required: ['page_id', 'properties'],
        },
    },
    {
        name: 'query_database',
        description: 'Query records from a Notion database with optional filters and sorts',
        inputSchema: {
            type: 'object',
            properties: {
                database_id: { type: 'string', description: 'Database ID to query' },
                filter: { type: 'object', description: 'Notion filter object (optional)' },
                sorts: { type: 'array', description: 'Array of sort objects (optional)' },
                page_size: { type: 'number', description: 'Number of results (max 100, default 10)' },
            },
            required: ['database_id'],
        },
    },
    {
        name: 'append_content',
        description: 'Append a paragraph of text to a Notion page',
        inputSchema: {
            type: 'object',
            properties: {
                block_id: { type: 'string', description: 'Page or block ID to append to' },
                text: { type: 'string', description: 'Text content to append as a paragraph block' },
            },
            required: ['block_id', 'text'],
        },
    },
];

async function notion(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${NOTION_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Notion API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'search': {
            const body: Record<string, unknown> = { query: args.query };
            if (args.filter_type) {
                body.filter = { value: args.filter_type, property: 'object' };
            }
            const data = await notion('/search', token, {
                method: 'POST',
                body: JSON.stringify({ ...body, page_size: 10 }),
            }) as any;
            return data.results?.map((r: any) => ({
                id: r.id,
                type: r.object,
                title: extractTitle(r),
                url: r.url,
                last_edited: r.last_edited_time,
            })) ?? [];
        }

        case 'get_page': {
            const page = await notion(`/pages/${args.page_id}`, token) as any;
            return {
                id: page.id,
                title: extractTitle(page),
                url: page.url,
                created_time: page.created_time,
                last_edited_time: page.last_edited_time,
                properties: page.properties,
            };
        }

        case 'get_page_content': {
            const data = await notion(`/blocks/${args.block_id}/children`, token) as any;
            return data.results?.map((block: any) => ({
                id: block.id,
                type: block.type,
                content: extractBlockText(block),
            })) ?? [];
        }

        case 'create_page': {
            const properties: Record<string, unknown> = {
                title: { title: [{ text: { content: args.title } }] },
                ...(args.properties ?? {}),
            };
            const page = await notion('/pages', token, {
                method: 'POST',
                body: JSON.stringify({
                    parent: { database_id: args.database_id },
                    properties,
                }),
            }) as any;
            return { id: page.id, url: page.url, title: args.title };
        }

        case 'update_page': {
            const body: Record<string, unknown> = { properties: args.properties };
            if (typeof args.archived === 'boolean') body.archived = args.archived;
            const page = await notion(`/pages/${args.page_id}`, token, {
                method: 'PATCH',
                body: JSON.stringify(body),
            }) as any;
            return { id: page.id, url: page.url, last_edited_time: page.last_edited_time };
        }

        case 'query_database': {
            const body: Record<string, unknown> = { page_size: Math.min(Number(args.page_size ?? 10), 100) };
            if (args.filter) body.filter = args.filter;
            if (args.sorts) body.sorts = args.sorts;
            const data = await notion(`/databases/${args.database_id}/query`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;
            return {
                results: data.results?.map((r: any) => ({
                    id: r.id,
                    title: extractTitle(r),
                    url: r.url,
                    properties: r.properties,
                })) ?? [],
                has_more: data.has_more,
            };
        }

        case 'append_content': {
            const result = await notion(`/blocks/${args.block_id}/children`, token, {
                method: 'PATCH',
                body: JSON.stringify({
                    children: [{
                        object: 'block',
                        type: 'paragraph',
                        paragraph: {
                            rich_text: [{ type: 'text', text: { content: args.text } }],
                        },
                    }],
                }),
            }) as any;
            return { block_id: result.results?.[0]?.id, success: true };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

function extractTitle(obj: any): string {
    if (!obj) return '';
    if (obj.object === 'database') {
        return obj.title?.[0]?.plain_text ?? 'Untitled';
    }
    const props = obj.properties ?? {};
    for (const prop of Object.values(props) as any[]) {
        if (prop?.type === 'title' && prop.title?.length > 0) {
            return prop.title[0]?.plain_text ?? 'Untitled';
        }
    }
    return 'Untitled';
}

function extractBlockText(block: any): string {
    const type = block.type;
    const content = block[type];
    if (!content) return '';
    if (content.rich_text) {
        return content.rich_text.map((t: any) => t.plain_text ?? '').join('');
    }
    return '';
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'notion-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'notion-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-NOTION-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing NOTION_TOKEN secret — add it to your workspace secrets');
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
