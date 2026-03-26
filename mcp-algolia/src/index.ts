/**
 * Algolia MCP Worker
 * Implements MCP protocol over HTTP for Algolia Search.
 *
 * Secrets:
 *   ALGOLIA_APP_ID  → header: X-Mcp-Secret-ALGOLIA-APP-ID
 *   ALGOLIA_API_KEY → header: X-Mcp-Secret-ALGOLIA-API-KEY
 *
 * Base URL: https://{appId}-dsn.algolia.net/1/indexes/
 */

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Algolia connectivity by listing indexes. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search',
        description: 'Search an Algolia index with a text query, optional filters, facets, and pagination',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name to search' },
                query: { type: 'string', description: 'Search query text' },
                filters: { type: 'string', description: 'Algolia filter string, e.g. "category:books AND price < 20"' },
                facets: { type: 'array', items: { type: 'string' }, description: 'Facet attributes to retrieve counts for, e.g. ["category", "brand"]' },
                hitsPerPage: { type: 'number', description: 'Number of hits per page (default: 20, max: 1000)' },
                page: { type: 'number', description: 'Page number for pagination (0-based, default: 0)' },
                attributesToRetrieve: { type: 'array', items: { type: 'string' }, description: 'Attributes to include in results (default: all)' },
                attributesToHighlight: { type: 'array', items: { type: 'string' }, description: 'Attributes to highlight in results' },
            },
            required: ['index', 'query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_indexes',
        description: 'List all indexes in the Algolia application with their stats (entries, size, last updated)',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_index_settings',
        description: 'Get the full configuration/settings for an Algolia index (searchable attributes, ranking, facets, etc.)',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name' },
            },
            required: ['index'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'browse_index',
        description: 'Browse/iterate all records in an Algolia index using cursor-based pagination',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name to browse' },
                cursor: { type: 'string', description: 'Cursor from a previous browse response to get the next page (omit for first page)' },
                hitsPerPage: { type: 'number', description: 'Number of records per page (default: 100, max: 1000)' },
                filters: { type: 'string', description: 'Optional Algolia filter string to narrow browsed records' },
                attributesToRetrieve: { type: 'array', items: { type: 'string' }, description: 'Attributes to include (default: all)' },
            },
            required: ['index'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_records',
        description: 'Add or update one or more records in an Algolia index (batch operation). Each record should include an objectID to update existing records.',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name' },
                records: {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Array of record objects to add/update. Include "objectID" to update existing records.',
                },
            },
            required: ['index', 'records'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_record',
        description: 'Delete a single record from an Algolia index by its objectID',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name' },
                objectID: { type: 'string', description: 'The objectID of the record to delete' },
            },
            required: ['index', 'objectID'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_record',
        description: 'Get a single record from an Algolia index by its objectID',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name' },
                objectID: { type: 'string', description: 'The objectID of the record to retrieve' },
                attributesToRetrieve: { type: 'array', items: { type: 'string' }, description: 'Attributes to include (default: all)' },
            },
            required: ['index', 'objectID'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'set_settings',
        description: 'Update index settings such as searchable attributes, custom ranking, facets, and relevance configuration',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name' },
                settings: {
                    type: 'object',
                    description: 'Algolia index settings object. Common keys: searchableAttributes (array), attributesForFaceting (array), customRanking (array), ranking (array), replicas (array), unretrievableAttributes (array), attributesToRetrieve (array)',
                },
            },
            required: ['index', 'settings'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

function algoliaBase(appId: string): string {
    return `https://${appId}-dsn.algolia.net/1/indexes`;
}

function algoliaHeaders(appId: string, apiKey: string): Record<string, string> {
    return {
        'X-Algolia-Application-Id': appId,
        'X-Algolia-API-Key': apiKey,
        'Content-Type': 'application/json',
    };
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    appId: string,
    apiKey: string,
) {
    const base = algoliaBase(appId);
    const headers = algoliaHeaders(appId, apiKey);

    switch (name) {
        case '_ping': {
            const res = await fetch(`${base}`, { headers });
            if (!res.ok) throw new Error(`Algolia returned ${res.status}: ${await res.text()}`);
            const data = await res.json() as { items?: Array<{ name: string }> };
            const count = data.items?.length ?? 0;
            return text(`Connected to Algolia app "${appId}" — ${count} index${count === 1 ? '' : 'es'} found`);
        }

        case 'search': {
            const index = args.index as string;
            const body: Record<string, unknown> = {
                query: args.query as string,
            };
            if (args.filters) body.filters = args.filters;
            if (args.facets) body.facets = args.facets;
            if (args.hitsPerPage !== undefined) body.hitsPerPage = Math.min(Number(args.hitsPerPage), 1000);
            if (args.page !== undefined) body.page = args.page;
            if (args.attributesToRetrieve) body.attributesToRetrieve = args.attributesToRetrieve;
            if (args.attributesToHighlight) body.attributesToHighlight = args.attributesToHighlight;

            const res = await fetch(`${base}/${encodeURIComponent(index)}/query`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as {
                hits?: unknown[];
                nbHits?: number;
                page?: number;
                nbPages?: number;
                hitsPerPage?: number;
                facets?: unknown;
            };
            return json({
                hits: data.hits,
                nbHits: data.nbHits,
                page: data.page,
                nbPages: data.nbPages,
                hitsPerPage: data.hitsPerPage,
                facets: data.facets,
            });
        }

        case 'list_indexes': {
            const res = await fetch(`${base}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { items?: Array<{ name: string; entries: number; dataSize: number; lastBuildTimeS: number; updatedAt: string }> };
            const indexes = (data.items ?? []).map(i => ({
                name: i.name,
                entries: i.entries,
                dataSize: i.dataSize,
                updatedAt: i.updatedAt,
            }));
            return json({ indexes, count: indexes.length });
        }

        case 'get_index_settings': {
            const index = args.index as string;
            const res = await fetch(`${base}/${encodeURIComponent(index)}/settings`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'browse_index': {
            const index = args.index as string;
            const body: Record<string, unknown> = {};
            if (args.cursor) body.cursor = args.cursor;
            if (args.hitsPerPage !== undefined) body.hitsPerPage = Math.min(Number(args.hitsPerPage), 1000);
            if (args.filters) body.filters = args.filters;
            if (args.attributesToRetrieve) body.attributesToRetrieve = args.attributesToRetrieve;

            const res = await fetch(`${base}/${encodeURIComponent(index)}/browse`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { hits?: unknown[]; cursor?: string; nbHits?: number };
            return json({
                hits: data.hits,
                cursor: data.cursor,
                nbHits: data.nbHits,
                hasMore: !!data.cursor,
            });
        }

        case 'add_records': {
            const index = args.index as string;
            const records = args.records as Array<Record<string, unknown>>;
            if (!records || !records.length) throw new Error('records array is empty');

            const requests = records.map(record => ({
                action: 'addObject' as const,
                body: record,
            }));

            const res = await fetch(`${base}/${encodeURIComponent(index)}/batch`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ requests }),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { objectIDs?: string[]; taskID?: number };
            return json({ objectIDs: data.objectIDs, taskID: data.taskID, count: data.objectIDs?.length ?? 0 });
        }

        case 'delete_record': {
            const index = args.index as string;
            const objectID = args.objectID as string;
            const res = await fetch(`${base}/${encodeURIComponent(index)}/${encodeURIComponent(objectID)}`, {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'get_record': {
            const index = args.index as string;
            const objectID = args.objectID as string;
            let url = `${base}/${encodeURIComponent(index)}/${encodeURIComponent(objectID)}`;
            if (args.attributesToRetrieve) {
                const attrs = (args.attributesToRetrieve as string[]).join(',');
                url += `?attributesToRetrieve=${encodeURIComponent(attrs)}`;
            }
            const res = await fetch(url, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'set_settings': {
            const index = args.index as string;
            const settings = args.settings as Record<string, unknown>;
            const res = await fetch(`${base}/${encodeURIComponent(index)}/settings`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(settings),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        default:
            return text(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-algolia', version: '1.0.0' });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json() as typeof body;
        } catch {
            return Response.json({
                jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' },
            });
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return Response.json({
                jsonrpc: '2.0', id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'mcp-algolia', version: '1.0.0' },
                },
            });
        }

        if (method === 'tools/list') {
            return Response.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        }

        if (method === 'tools/call') {
            const appId = request.headers.get('X-Mcp-Secret-ALGOLIA-APP-ID') || '';
            const apiKey = request.headers.get('X-Mcp-Secret-ALGOLIA-API-KEY') || '';

            if (!appId || !apiKey) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32001, message: 'Missing secrets: ALGOLIA_APP_ID and ALGOLIA_API_KEY required — add them to your workspace secrets' },
                });
            }

            const { name, arguments: args = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, args, appId, apiKey);
                return Response.json({ jsonrpc: '2.0', id, result });
            } catch (err) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
                });
            }
        }

        return Response.json({
            jsonrpc: '2.0', id,
            error: { code: -32601, message: `Method not found: ${method}` },
        });
    },
};
