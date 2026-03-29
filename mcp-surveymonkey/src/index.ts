/**
 * SurveyMonkey MCP Worker
 * Implements MCP protocol over HTTP for SurveyMonkey survey management operations.
 * Secrets received via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   SURVEYMONKEY_ACCESS_TOKEN → X-Mcp-Secret-SURVEYMONKEY-ACCESS-TOKEN
 *
 * Auth: Authorization: Bearer {token}
 * Base URL: https://api.surveymonkey.com/v3
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

const API_BASE = 'https://api.surveymonkey.com/v3';

async function smFetch(token: string, path: string, options: RequestInit = {}): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });
    if (res.status === 204) return {};
    const text = await res.text();
    if (!text) return {};
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw { code: -32603, message: `SurveyMonkey HTTP ${res.status}: ${text}` }; }
    if (!res.ok) {
        const d = data as Record<string, unknown>;
        const msg = (d?.error as Record<string, unknown>)?.message as string || (d?.message as string) || res.statusText;
        throw { code: -32603, message: `SurveyMonkey API error ${res.status}: ${msg}` };
    }
    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_surveys',
        description: 'List all surveys in the account with pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Results per page (default: 25)' },
                page: { type: 'number', description: 'Page number (default: 1)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_survey',
        description: 'Get basic survey information by ID.',
        inputSchema: {
            type: 'object',
            properties: { surveyId: { type: 'string', description: 'Survey ID' } },
            required: ['surveyId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_survey',
        description: 'Create a new survey.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Survey title' },
                nickname: { type: 'string', description: 'Optional nickname for the survey' },
            },
            required: ['title'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'get_survey_details',
        description: 'Get full survey details including pages and questions.',
        inputSchema: {
            type: 'object',
            properties: { surveyId: { type: 'string', description: 'Survey ID' } },
            required: ['surveyId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_pages',
        description: 'List all pages in a survey.',
        inputSchema: {
            type: 'object',
            properties: { surveyId: { type: 'string', description: 'Survey ID' } },
            required: ['surveyId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_page',
        description: 'Add a new page to a survey.',
        inputSchema: {
            type: 'object',
            properties: {
                surveyId: { type: 'string', description: 'Survey ID' },
                title: { type: 'string', description: 'Page title' },
                description: { type: 'string', description: 'Page description' },
            },
            required: ['surveyId', 'title'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_questions',
        description: 'List all questions on a survey page.',
        inputSchema: {
            type: 'object',
            properties: {
                surveyId: { type: 'string', description: 'Survey ID' },
                pageId: { type: 'string', description: 'Page ID' },
            },
            required: ['surveyId', 'pageId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_question',
        description: 'Add a question to a survey page.',
        inputSchema: {
            type: 'object',
            properties: {
                surveyId: { type: 'string', description: 'Survey ID' },
                pageId: { type: 'string', description: 'Page ID' },
                family: { type: 'string', description: 'Question family: single_choice, multiple_choice, open_ended, rating, matrix' },
                subtype: { type: 'string', description: 'Question subtype (e.g. vertical, horizontal)' },
                heading: { type: 'string', description: 'Question text/heading' },
                answers: { type: 'object', description: 'Answer choices object' },
            },
            required: ['surveyId', 'pageId', 'family', 'subtype', 'heading'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_collectors',
        description: 'List collectors (distribution links) for a survey.',
        inputSchema: {
            type: 'object',
            properties: {
                surveyId: { type: 'string', description: 'Survey ID' },
                per_page: { type: 'number', description: 'Results per page (default: 25)' },
            },
            required: ['surveyId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_collector',
        description: 'Create a new web link collector for a survey.',
        inputSchema: {
            type: 'object',
            properties: {
                surveyId: { type: 'string', description: 'Survey ID' },
                name: { type: 'string', description: 'Collector name' },
            },
            required: ['surveyId', 'name'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_responses',
        description: 'List responses for a collector.',
        inputSchema: {
            type: 'object',
            properties: {
                collectorId: { type: 'string', description: 'Collector ID' },
                per_page: { type: 'number', description: 'Results per page (default: 25)' },
            },
            required: ['collectorId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_response_details',
        description: 'Get full details of a specific survey response.',
        inputSchema: {
            type: 'object',
            properties: {
                surveyId: { type: 'string', description: 'Survey ID' },
                responseId: { type: 'string', description: 'Response ID' },
            },
            required: ['surveyId', 'responseId'],
        },
        annotations: { readOnlyHint: true },
    },
];

// ── Request handler ───────────────────────────────────────────────────────────

async function handleRequest(request: Request): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', mcp: 'mcp-surveymonkey' }), {
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
            serverInfo: { name: 'mcp-surveymonkey', version: '1.0.0' },
        });
    }

    if (body.method === 'tools/list') {
        return rpcOk(id, { tools: TOOLS });
    }

    if (body.method === 'tools/call') {
        const token = request.headers.get('X-Mcp-Secret-SURVEYMONKEY-ACCESS-TOKEN');
        if (!token) return rpcErr(id, -32001, 'Missing required secret: SURVEYMONKEY_ACCESS_TOKEN');

        const toolName = (body.params?.name ?? '') as string;
        const args = (body.params?.arguments ?? {}) as Record<string, unknown>;

        try {
            const result = await dispatchTool(token, toolName, args);
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

async function dispatchTool(token: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case 'list_surveys': {
            const per_page = (args.per_page as number) ?? 25;
            const page = (args.page as number) ?? 1;
            const data = await smFetch(token, `/surveys?per_page=${per_page}&page=${page}`);
            return toolOk(data);
        }
        case 'get_survey': {
            validateRequired(args, ['surveyId']);
            const data = await smFetch(token, `/surveys/${args.surveyId}`);
            return toolOk(data);
        }
        case 'create_survey': {
            validateRequired(args, ['title']);
            const body: Record<string, unknown> = { title: args.title };
            if (args.nickname) body.nickname = args.nickname;
            const data = await smFetch(token, '/surveys', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            return toolOk(data);
        }
        case 'get_survey_details': {
            validateRequired(args, ['surveyId']);
            const data = await smFetch(token, `/surveys/${args.surveyId}/details`);
            return toolOk(data);
        }
        case 'list_pages': {
            validateRequired(args, ['surveyId']);
            const data = await smFetch(token, `/surveys/${args.surveyId}/pages`);
            return toolOk(data);
        }
        case 'create_page': {
            validateRequired(args, ['surveyId', 'title']);
            const body: Record<string, unknown> = { title: args.title };
            if (args.description) body.description = args.description;
            const data = await smFetch(token, `/surveys/${args.surveyId}/pages`, {
                method: 'POST',
                body: JSON.stringify(body),
            });
            return toolOk(data);
        }
        case 'list_questions': {
            validateRequired(args, ['surveyId', 'pageId']);
            const data = await smFetch(token, `/surveys/${args.surveyId}/pages/${args.pageId}/questions`);
            return toolOk(data);
        }
        case 'create_question': {
            validateRequired(args, ['surveyId', 'pageId', 'family', 'subtype', 'heading']);
            const qBody: Record<string, unknown> = {
                family: args.family,
                subtype: args.subtype,
                headings: [{ heading: args.heading }],
            };
            if (args.answers) qBody.answers = args.answers;
            const data = await smFetch(token, `/surveys/${args.surveyId}/pages/${args.pageId}/questions`, {
                method: 'POST',
                body: JSON.stringify(qBody),
            });
            return toolOk(data);
        }
        case 'list_collectors': {
            validateRequired(args, ['surveyId']);
            const per_page = (args.per_page as number) ?? 25;
            const data = await smFetch(token, `/surveys/${args.surveyId}/collectors?per_page=${per_page}`);
            return toolOk(data);
        }
        case 'create_collector': {
            validateRequired(args, ['surveyId', 'name']);
            const data = await smFetch(token, `/surveys/${args.surveyId}/collectors`, {
                method: 'POST',
                body: JSON.stringify({ type: 'weblink', name: args.name }),
            });
            return toolOk(data);
        }
        case 'list_responses': {
            validateRequired(args, ['collectorId']);
            const per_page = (args.per_page as number) ?? 25;
            const data = await smFetch(token, `/collectors/${args.collectorId}/responses?per_page=${per_page}`);
            return toolOk(data);
        }
        case 'get_response_details': {
            validateRequired(args, ['surveyId', 'responseId']);
            const data = await smFetch(token, `/surveys/${args.surveyId}/responses/${args.responseId}/details`);
            return toolOk(data);
        }
        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

export default { fetch: handleRequest };
