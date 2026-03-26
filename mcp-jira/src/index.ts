/**
 * Jira MCP Worker
 * Implements MCP protocol over HTTP for Jira Cloud REST API v3.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   JIRA_URL       → header: X-Mcp-Secret-JIRA-URL        (e.g. https://yourteam.atlassian.net)
 *   JIRA_EMAIL     → header: X-Mcp-Secret-JIRA-EMAIL      (Atlassian account email)
 *   JIRA_API_TOKEN → header: X-Mcp-Secret-JIRA-API-TOKEN  (API token from id.atlassian.com)
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
        name: '_ping',
        description: 'Verify Jira credentials by fetching the current user. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_issues',
        description: 'Search for Jira issues using JQL (Jira Query Language)',
        inputSchema: {
            type: 'object',
            properties: {
                jql: { type: 'string', description: 'JQL query (e.g. "project = DEV AND status = Open ORDER BY created DESC")' },
                max_results: { type: 'number', description: 'Max issues to return (default 20, max 50)' },
                fields: { type: 'string', description: 'Comma-separated fields to include (default: summary,status,assignee,priority,created,updated)' },
            },
            required: ['jql'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_issue',
        description: 'Get a Jira issue by key, including comments and changelog',
        inputSchema: {
            type: 'object',
            properties: {
                issue_key: { type: 'string', description: 'Issue key (e.g. PROJ-123)' },
                include_comments: { type: 'boolean', description: 'Include comments (default true)' },
                include_changelog: { type: 'boolean', description: 'Include status change history (default false)' },
            },
            required: ['issue_key'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_issue',
        description: 'Create a new Jira issue',
        inputSchema: {
            type: 'object',
            properties: {
                project: { type: 'string', description: 'Project key (e.g. DEV)' },
                issue_type: { type: 'string', description: 'Issue type (e.g. Task, Bug, Story, Epic)' },
                summary: { type: 'string', description: 'Issue title / summary' },
                description: { type: 'string', description: 'Issue description (plain text — converted to ADF)' },
                assignee: { type: 'string', description: 'Assignee account ID (optional)' },
                priority: { type: 'string', description: 'Priority name (e.g. High, Medium, Low) (optional)' },
                labels: { type: 'array', items: { type: 'string' }, description: 'Array of label strings (optional)' },
            },
            required: ['project', 'issue_type', 'summary'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_issue',
        description: 'Update fields on an existing Jira issue',
        inputSchema: {
            type: 'object',
            properties: {
                issue_key: { type: 'string', description: 'Issue key (e.g. PROJ-123)' },
                summary: { type: 'string', description: 'New summary (optional)' },
                description: { type: 'string', description: 'New description (plain text — converted to ADF) (optional)' },
                assignee: { type: 'string', description: 'New assignee account ID (optional)' },
                priority: { type: 'string', description: 'New priority name (optional)' },
                labels: { type: 'array', items: { type: 'string' }, description: 'New labels array (optional)' },
            },
            required: ['issue_key'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'add_comment',
        description: 'Add a comment to a Jira issue',
        inputSchema: {
            type: 'object',
            properties: {
                issue_key: { type: 'string', description: 'Issue key (e.g. PROJ-123)' },
                body: { type: 'string', description: 'Comment text (plain text — converted to ADF)' },
            },
            required: ['issue_key', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'transition_issue',
        description: 'Transition a Jira issue to a different status (e.g. To Do → In Progress → Done)',
        inputSchema: {
            type: 'object',
            properties: {
                issue_key: { type: 'string', description: 'Issue key (e.g. PROJ-123)' },
                transition_name: { type: 'string', description: 'Target transition name (e.g. "In Progress", "Done"). Use get_issue to see available transitions.' },
            },
            required: ['issue_key', 'transition_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_projects',
        description: 'List all accessible Jira projects',
        inputSchema: {
            type: 'object',
            properties: {
                max_results: { type: 'number', description: 'Max projects to return (default 20, max 50)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_board_sprints',
        description: 'Get sprints for a Jira board (requires Jira Software / Agile)',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: { type: 'number', description: 'Board ID (find via Jira board URL)' },
                state: { type: 'string', description: 'Sprint state filter: active, closed, future (default: active)' },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_sprint_issues',
        description: 'Get all issues in a specific sprint',
        inputSchema: {
            type: 'object',
            properties: {
                sprint_id: { type: 'number', description: 'Sprint ID (get from get_board_sprints)' },
                max_results: { type: 'number', description: 'Max issues to return (default 50)' },
            },
            required: ['sprint_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

/** Convert plain text to Atlassian Document Format (ADF) */
function textToAdf(text: string) {
    return {
        type: 'doc',
        version: 1,
        content: text.split('\n\n').map(paragraph => ({
            type: 'paragraph',
            content: [{ type: 'text', text: paragraph }],
        })),
    };
}

interface JiraAuth {
    baseUrl: string;
    email: string;
    token: string;
}

async function jira(auth: JiraAuth, path: string, method = 'GET', body?: unknown): Promise<any> {
    const url = `${auth.baseUrl}${path}`;
    const headers: Record<string, string> = {
        Authorization: 'Basic ' + btoa(`${auth.email}:${auth.token}`),
        Accept: 'application/json',
    };
    const opts: RequestInit = { method, headers };

    if (body) {
        headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);
    if (res.status === 204) return { success: true };

    const data = await res.json() as any;

    if (!res.ok) {
        const messages = data.errorMessages?.join('; ') ?? data.errors ? JSON.stringify(data.errors) : `HTTP ${res.status}`;
        throw new Error(`Jira API error: ${messages}`);
    }

    return data;
}

async function callTool(name: string, args: Record<string, unknown>, auth: JiraAuth): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await jira(auth, '/rest/api/3/myself');
            return { content: [{ type: 'text', text: `Connected to Jira as ${data.displayName} (${data.emailAddress})` }] };
        }

        case 'search_issues': {
            const maxResults = Math.min(Number(args.max_results ?? 20), 50);
            const fields = (args.fields as string) ?? 'summary,status,assignee,priority,created,updated';
            const data = await jira(auth, `/rest/api/3/search?jql=${encodeURIComponent(args.jql as string)}&maxResults=${maxResults}&fields=${encodeURIComponent(fields)}`);
            return {
                total: data.total,
                issues: data.issues?.map((i: any) => ({
                    key: i.key,
                    summary: i.fields?.summary,
                    status: i.fields?.status?.name,
                    assignee: i.fields?.assignee?.displayName ?? null,
                    priority: i.fields?.priority?.name ?? null,
                    created: i.fields?.created,
                    updated: i.fields?.updated,
                })) ?? [],
            };
        }

        case 'get_issue': {
            const expand = args.include_changelog ? 'changelog' : '';
            const data = await jira(auth, `/rest/api/3/issue/${args.issue_key}${expand ? `?expand=${expand}` : ''}`);
            const result: Record<string, unknown> = {
                key: data.key,
                summary: data.fields?.summary,
                status: data.fields?.status?.name,
                issue_type: data.fields?.issuetype?.name,
                priority: data.fields?.priority?.name,
                assignee: data.fields?.assignee?.displayName ?? null,
                reporter: data.fields?.reporter?.displayName ?? null,
                labels: data.fields?.labels ?? [],
                created: data.fields?.created,
                updated: data.fields?.updated,
                description: data.fields?.description ?? null,
            };

            // Fetch available transitions
            const transitions = await jira(auth, `/rest/api/3/issue/${args.issue_key}/transitions`);
            result.available_transitions = transitions.transitions?.map((t: any) => ({
                id: t.id,
                name: t.name,
                to: t.to?.name,
            })) ?? [];

            if (args.include_comments !== false) {
                const comments = await jira(auth, `/rest/api/3/issue/${args.issue_key}/comment?maxResults=20&orderBy=-created`);
                result.comments = comments.comments?.map((c: any) => ({
                    id: c.id,
                    author: c.author?.displayName,
                    body: c.body,
                    created: c.created,
                    updated: c.updated,
                })) ?? [];
            }

            if (args.include_changelog && data.changelog) {
                result.changelog = data.changelog.histories?.slice(0, 20).map((h: any) => ({
                    author: h.author?.displayName,
                    created: h.created,
                    items: h.items?.map((item: any) => ({
                        field: item.field,
                        from: item.fromString,
                        to: item.toString,
                    })),
                })) ?? [];
            }

            return result;
        }

        case 'create_issue': {
            const fields: Record<string, unknown> = {
                project: { key: args.project },
                issuetype: { name: args.issue_type },
                summary: args.summary,
            };
            if (args.description) fields.description = textToAdf(args.description as string);
            if (args.assignee) fields.assignee = { accountId: args.assignee };
            if (args.priority) fields.priority = { name: args.priority };
            if (args.labels) fields.labels = args.labels;

            const data = await jira(auth, '/rest/api/3/issue', 'POST', { fields });
            return { key: data.key, id: data.id, self: data.self };
        }

        case 'update_issue': {
            const fields: Record<string, unknown> = {};
            if (args.summary) fields.summary = args.summary;
            if (args.description) fields.description = textToAdf(args.description as string);
            if (args.assignee) fields.assignee = { accountId: args.assignee };
            if (args.priority) fields.priority = { name: args.priority };
            if (args.labels) fields.labels = args.labels;

            if (Object.keys(fields).length === 0) {
                throw new Error('No fields to update — provide at least one of: summary, description, assignee, priority, labels');
            }

            await jira(auth, `/rest/api/3/issue/${args.issue_key}`, 'PUT', { fields });
            return { success: true, issue_key: args.issue_key };
        }

        case 'add_comment': {
            const data = await jira(auth, `/rest/api/3/issue/${args.issue_key}/comment`, 'POST', {
                body: textToAdf(args.body as string),
            });
            return { id: data.id, issue_key: args.issue_key };
        }

        case 'transition_issue': {
            // First, get available transitions
            const transitions = await jira(auth, `/rest/api/3/issue/${args.issue_key}/transitions`);
            const target = transitions.transitions?.find(
                (t: any) => t.name.toLowerCase() === (args.transition_name as string).toLowerCase()
            );
            if (!target) {
                const available = transitions.transitions?.map((t: any) => t.name).join(', ') ?? 'none';
                throw new Error(`Transition "${args.transition_name}" not found. Available transitions: ${available}`);
            }

            await jira(auth, `/rest/api/3/issue/${args.issue_key}/transitions`, 'POST', {
                transition: { id: target.id },
            });
            return { success: true, issue_key: args.issue_key, transitioned_to: target.to?.name ?? target.name };
        }

        case 'list_projects': {
            const maxResults = Math.min(Number(args.max_results ?? 20), 50);
            const data = await jira(auth, `/rest/api/3/project/search?maxResults=${maxResults}`);
            return data.values?.map((p: any) => ({
                id: p.id,
                key: p.key,
                name: p.name,
                project_type: p.projectTypeKey,
                style: p.style,
                lead: p.lead?.displayName ?? null,
            })) ?? [];
        }

        case 'get_board_sprints': {
            const state = (args.state as string) ?? 'active';
            const data = await jira(auth, `/rest/agile/1.0/board/${args.board_id}/sprint?state=${state}`);
            return data.values?.map((s: any) => ({
                id: s.id,
                name: s.name,
                state: s.state,
                start_date: s.startDate ?? null,
                end_date: s.endDate ?? null,
                goal: s.goal ?? null,
            })) ?? [];
        }

        case 'get_sprint_issues': {
            const maxResults = Math.min(Number(args.max_results ?? 50), 50);
            const data = await jira(auth, `/rest/agile/1.0/sprint/${args.sprint_id}/issue?maxResults=${maxResults}`);
            return {
                total: data.total,
                issues: data.issues?.map((i: any) => ({
                    key: i.key,
                    summary: i.fields?.summary,
                    status: i.fields?.status?.name,
                    assignee: i.fields?.assignee?.displayName ?? null,
                    priority: i.fields?.priority?.name ?? null,
                    story_points: i.fields?.customfield_10016 ?? null,
                })) ?? [],
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'jira-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'jira-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const jiraUrl = request.headers.get('X-Mcp-Secret-JIRA-URL');
            const jiraEmail = request.headers.get('X-Mcp-Secret-JIRA-EMAIL');
            const jiraToken = request.headers.get('X-Mcp-Secret-JIRA-API-TOKEN');

            if (!jiraUrl) {
                return rpcErr(id, -32001, 'Missing JIRA_URL secret — add your Jira Cloud URL (e.g. https://yourteam.atlassian.net) to your workspace secrets');
            }
            if (!jiraEmail) {
                return rpcErr(id, -32001, 'Missing JIRA_EMAIL secret — add your Atlassian account email to your workspace secrets');
            }
            if (!jiraToken) {
                return rpcErr(id, -32001, 'Missing JIRA_API_TOKEN secret — add your Jira API token to your workspace secrets');
            }

            const auth: JiraAuth = {
                baseUrl: jiraUrl.replace(/\/+$/, ''),
                email: jiraEmail,
                token: jiraToken,
            };

            try {
                const result = await callTool(toolName, toolArgs, auth);
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
