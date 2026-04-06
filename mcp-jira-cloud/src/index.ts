/**
 * Jira Cloud MCP Worker
 * Implements MCP protocol over HTTP for Jira Cloud project management operations.
 * Secrets received via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   JIRA_EMAIL      → X-Mcp-Secret-JIRA-EMAIL
 *   JIRA_API_TOKEN  → X-Mcp-Secret-JIRA-API-TOKEN
 *   JIRA_DOMAIN     → X-Mcp-Secret-JIRA-DOMAIN
 *
 * Auth: Authorization: Basic {btoa(email + ':' + token)}
 * Base URL: https://{domain}.atlassian.net/rest/api/3
 * Agile: https://{domain}.atlassian.net/rest/agile/1.0
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

async function jiraFetch(email: string, token: string, domain: string, path: string, options: RequestInit = {}): Promise<unknown> {
    const isAgile = path.includes('/rest/agile/') || path.includes('agile/1.0');
    const base = isAgile
        ? `https://${domain}.atlassian.net/rest/agile/1.0`
        : `https://${domain}.atlassian.net/rest/api/3`;
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const credentials = btoa(`${email}:${token}`);
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });
    if (res.status === 204) return {};
    const text = await res.text();
    if (!text) return {};
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw { code: -32603, message: `Jira HTTP ${res.status}: ${text}` }; }
    if (!res.ok) {
        const d = data as Record<string, unknown>;
        const errorMessages = d?.errorMessages as string[] || [];
        const errors = d?.errors as Record<string, string> || {};
        const msg = errorMessages[0] || Object.values(errors)[0] || res.statusText;
        throw { code: -32603, message: `Jira API error ${res.status}: ${msg}` };
    }
    return data;
}

function adfText(text: string) {
    return { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Jira Cloud credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_projects',
        description: 'List all projects in the Jira account.',
        inputSchema: {
            type: 'object',
            properties: {
                maxResults: { type: 'number', description: 'Max projects to return (default: 50)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_project',
        description: 'Get project details by project key.',
        inputSchema: {
            type: 'object',
            properties: { projectKey: { type: 'string', description: 'Jira project key (e.g. PROJ)' } },
            required: ['projectKey'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_issues',
        description: 'Search issues using JQL query.',
        inputSchema: {
            type: 'object',
            properties: {
                jql: { type: 'string', description: 'JQL query (e.g. "project = PROJ AND status = Open")' },
                maxResults: { type: 'number', description: 'Max issues to return (default: 25)' },
                startAt: { type: 'number', description: 'Offset for pagination (default: 0)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_issue',
        description: 'Get full issue details by issue key.',
        inputSchema: {
            type: 'object',
            properties: { issueKey: { type: 'string', description: 'Issue key (e.g. PROJ-123)' } },
            required: ['issueKey'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_issue',
        description: 'Create a new Jira issue.',
        inputSchema: {
            type: 'object',
            properties: {
                projectKey: { type: 'string', description: 'Project key' },
                summary: { type: 'string', description: 'Issue summary/title' },
                issueType: { type: 'string', description: 'Issue type name (e.g. Bug, Story, Task)' },
                description: { type: 'string', description: 'Issue description text' },
                priority: { type: 'string', description: 'Priority name (e.g. High, Medium, Low)' },
                assigneeAccountId: { type: 'string', description: 'Assignee account ID' },
            },
            required: ['projectKey', 'summary', 'issueType'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_issue',
        description: 'Update issue summary, priority, or assignee.',
        inputSchema: {
            type: 'object',
            properties: {
                issueKey: { type: 'string', description: 'Issue key to update' },
                summary: { type: 'string', description: 'Updated summary' },
                priority: { type: 'string', description: 'Updated priority name' },
                assigneeAccountId: { type: 'string', description: 'Updated assignee account ID' },
            },
            required: ['issueKey'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'delete_issue',
        description: 'Permanently delete an issue.',
        inputSchema: {
            type: 'object',
            properties: { issueKey: { type: 'string', description: 'Issue key to delete' } },
            required: ['issueKey'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'transition_issue',
        description: 'Move an issue to a new status by transitioning it.',
        inputSchema: {
            type: 'object',
            properties: {
                issueKey: { type: 'string', description: 'Issue key' },
                transitionId: { type: 'string', description: 'Transition ID (get from list_transitions)' },
            },
            required: ['issueKey', 'transitionId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_transitions',
        description: 'List available status transitions for an issue.',
        inputSchema: {
            type: 'object',
            properties: { issueKey: { type: 'string', description: 'Issue key' } },
            required: ['issueKey'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'add_comment',
        description: 'Add a comment to an issue.',
        inputSchema: {
            type: 'object',
            properties: {
                issueKey: { type: 'string', description: 'Issue key' },
                text: { type: 'string', description: 'Comment text' },
            },
            required: ['issueKey', 'text'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_comments',
        description: 'List comments on an issue.',
        inputSchema: {
            type: 'object',
            properties: {
                issueKey: { type: 'string', description: 'Issue key' },
                maxResults: { type: 'number', description: 'Max comments (default: 25)' },
            },
            required: ['issueKey'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'assign_issue',
        description: 'Assign an issue to a user by account ID.',
        inputSchema: {
            type: 'object',
            properties: {
                issueKey: { type: 'string', description: 'Issue key' },
                accountId: { type: 'string', description: 'User account ID to assign to' },
            },
            required: ['issueKey', 'accountId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'search_users',
        description: 'Search for users by query string.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query (name or email)' },
                maxResults: { type: 'number', description: 'Max results (default: 10)' },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_sprints',
        description: 'List active and future sprints for a board.',
        inputSchema: {
            type: 'object',
            properties: { boardId: { type: 'number', description: 'Agile board ID' } },
            required: ['boardId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_board',
        description: 'Get agile board details by ID.',
        inputSchema: {
            type: 'object',
            properties: { boardId: { type: 'number', description: 'Board ID' } },
            required: ['boardId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_boards',
        description: 'List all agile boards in the account.',
        inputSchema: {
            type: 'object',
            properties: {
                maxResults: { type: 'number', description: 'Max boards to return (default: 50)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
];

// ── Request handler ───────────────────────────────────────────────────────────

async function handleRequest(request: Request): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', mcp: 'mcp-jira-cloud' }), {
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
            serverInfo: { name: 'mcp-jira-cloud', version: '1.0.0' },
        });
    }

    if (body.method === 'tools/list') {
        return rpcOk(id, { tools: TOOLS });
    }

    if (body.method === 'tools/call') {
        const email = request.headers.get('X-Mcp-Secret-JIRA-EMAIL');
        const token = request.headers.get('X-Mcp-Secret-JIRA-API-TOKEN');
        const domain = request.headers.get('X-Mcp-Secret-JIRA-DOMAIN');
        const missing: string[] = [];
        if (!email) missing.push('JIRA_EMAIL');
        if (!token) missing.push('JIRA_API_TOKEN');
        if (!domain) missing.push('JIRA_DOMAIN');
        if (missing.length > 0) return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);

        const toolName = (body.params?.name ?? '') as string;
        const args = (body.params?.arguments ?? {}) as Record<string, unknown>;

        try {
            const result = await dispatchTool(email!, token!, domain!, toolName, args);
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

async function dispatchTool(email: string, token: string, domain: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const data = await jiraFetch(email, token, domain, '/myself');
            return toolOk(data);
        }
        case 'list_projects': {
            const max = (args.maxResults as number) ?? 50;
            const data = await jiraFetch(email, token, domain, `/project/search?maxResults=${max}`);
            return toolOk(data);
        }
        case 'get_project': {
            validateRequired(args, ['projectKey']);
            const data = await jiraFetch(email, token, domain, `/project/${args.projectKey}`);
            return toolOk(data);
        }
        case 'list_issues': {
            const jql = (args.jql as string) ?? '';
            const max = (args.maxResults as number) ?? 25;
            const startAt = (args.startAt as number) ?? 0;
            const fields = 'summary,status,assignee,priority,issuetype,created,updated';
            const q = jql ? `jql=${encodeURIComponent(jql)}&` : '';
            const data = await jiraFetch(email, token, domain, `/search?${q}maxResults=${max}&startAt=${startAt}&fields=${fields}`);
            return toolOk(data);
        }
        case 'get_issue': {
            validateRequired(args, ['issueKey']);
            const data = await jiraFetch(email, token, domain, `/issue/${args.issueKey}`);
            return toolOk(data);
        }
        case 'create_issue': {
            validateRequired(args, ['projectKey', 'summary', 'issueType']);
            const fields: Record<string, unknown> = {
                project: { key: args.projectKey },
                summary: args.summary,
                issuetype: { name: args.issueType },
            };
            if (args.description) fields.description = adfText(args.description as string);
            if (args.priority) fields.priority = { name: args.priority };
            if (args.assigneeAccountId) fields.assignee = { accountId: args.assigneeAccountId };
            const data = await jiraFetch(email, token, domain, '/issue', {
                method: 'POST',
                body: JSON.stringify({ fields }),
            });
            return toolOk(data);
        }
        case 'update_issue': {
            validateRequired(args, ['issueKey']);
            const fields: Record<string, unknown> = {};
            if (args.summary) fields.summary = args.summary;
            if (args.priority) fields.priority = { name: args.priority };
            if (args.assigneeAccountId) fields.assignee = { accountId: args.assigneeAccountId };
            const data = await jiraFetch(email, token, domain, `/issue/${args.issueKey}`, {
                method: 'PUT',
                body: JSON.stringify({ fields }),
            });
            return toolOk(data ?? { updated: true });
        }
        case 'delete_issue': {
            validateRequired(args, ['issueKey']);
            await jiraFetch(email, token, domain, `/issue/${args.issueKey}`, { method: 'DELETE' });
            return toolOk({ deleted: true });
        }
        case 'transition_issue': {
            validateRequired(args, ['issueKey', 'transitionId']);
            await jiraFetch(email, token, domain, `/issue/${args.issueKey}/transitions`, {
                method: 'POST',
                body: JSON.stringify({ transition: { id: args.transitionId } }),
            });
            return toolOk({ transitioned: true });
        }
        case 'list_transitions': {
            validateRequired(args, ['issueKey']);
            const data = await jiraFetch(email, token, domain, `/issue/${args.issueKey}/transitions`);
            return toolOk(data);
        }
        case 'add_comment': {
            validateRequired(args, ['issueKey', 'text']);
            const data = await jiraFetch(email, token, domain, `/issue/${args.issueKey}/comment`, {
                method: 'POST',
                body: JSON.stringify({ body: adfText(args.text as string) }),
            });
            return toolOk(data);
        }
        case 'list_comments': {
            validateRequired(args, ['issueKey']);
            const max = (args.maxResults as number) ?? 25;
            const data = await jiraFetch(email, token, domain, `/issue/${args.issueKey}/comment?maxResults=${max}`);
            return toolOk(data);
        }
        case 'assign_issue': {
            validateRequired(args, ['issueKey', 'accountId']);
            await jiraFetch(email, token, domain, `/issue/${args.issueKey}/assignee`, {
                method: 'PUT',
                body: JSON.stringify({ accountId: args.accountId }),
            });
            return toolOk({ assigned: true });
        }
        case 'search_users': {
            validateRequired(args, ['query']);
            const max = (args.maxResults as number) ?? 10;
            const data = await jiraFetch(email, token, domain, `/user/search?query=${encodeURIComponent(args.query as string)}&maxResults=${max}`);
            return toolOk(data);
        }
        case 'list_sprints': {
            validateRequired(args, ['boardId']);
            const url = `https://${domain}.atlassian.net/rest/agile/1.0/board/${args.boardId}/sprint?state=active,future`;
            const data = await jiraFetch(email, token, domain, url);
            return toolOk(data);
        }
        case 'get_board': {
            validateRequired(args, ['boardId']);
            const url = `https://${domain}.atlassian.net/rest/agile/1.0/board/${args.boardId}`;
            const data = await jiraFetch(email, token, domain, url);
            return toolOk(data);
        }
        case 'list_boards': {
            const max = (args.maxResults as number) ?? 50;
            const url = `https://${domain}.atlassian.net/rest/agile/1.0/board?maxResults=${max}`;
            const data = await jiraFetch(email, token, domain, url);
            return toolOk(data);
        }
        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

export default { fetch: handleRequest };
