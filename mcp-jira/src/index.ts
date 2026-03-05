/**
 * Jira MCP Worker
 * Implements MCP protocol over HTTP for Jira Cloud API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   JIRA_EMAIL     → header: X-Mcp-Secret-JIRA-EMAIL
 *   JIRA_API_TOKEN → header: X-Mcp-Secret-JIRA-API-TOKEN
 *   JIRA_DOMAIN    → header: X-Mcp-Secret-JIRA-DOMAIN  (e.g. mycompany — without .atlassian.net)
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-jira
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
        name: 'search_issues',
        description: 'Search Jira issues using JQL (Jira Query Language)',
        inputSchema: {
            type: 'object',
            properties: {
                jql: { type: 'string', description: "JQL query string (e.g. 'project = PROJ AND status = \"In Progress\"')" },
                max_results: { type: 'number', description: 'Max results (default 10, max 50)' },
            },
            required: ['jql'],
        },
    },
    {
        name: 'get_issue',
        description: 'Get details of a specific Jira issue by its key',
        inputSchema: {
            type: 'object',
            properties: {
                issue_key: { type: 'string', description: 'Jira issue key (e.g. PROJ-123)' },
            },
            required: ['issue_key'],
        },
    },
    {
        name: 'create_issue',
        description: 'Create a new Jira issue',
        inputSchema: {
            type: 'object',
            properties: {
                project_key: { type: 'string', description: 'Project key (e.g. PROJ)' },
                summary: { type: 'string', description: 'Issue summary/title' },
                issue_type: { type: 'string', description: 'Issue type (e.g. Bug, Task, Story, Epic)' },
                description: { type: 'string', description: 'Issue description as plain text (optional)' },
                priority: { type: 'string', enum: ['Highest', 'High', 'Medium', 'Low', 'Lowest'], description: 'Priority (optional)' },
            },
            required: ['project_key', 'summary', 'issue_type'],
        },
    },
    {
        name: 'add_comment',
        description: 'Add a comment to a Jira issue',
        inputSchema: {
            type: 'object',
            properties: {
                issue_key: { type: 'string', description: 'Jira issue key (e.g. PROJ-123)' },
                body: { type: 'string', description: 'Comment text' },
            },
            required: ['issue_key', 'body'],
        },
    },
    {
        name: 'list_projects',
        description: 'List all Jira projects the authenticated user has access to',
        inputSchema: {
            type: 'object',
            properties: {
                max_results: { type: 'number', description: 'Max results (default 20)' },
            },
        },
    },
    {
        name: 'transition_issue',
        description: 'Move a Jira issue to a new status (e.g. mark as Done, In Progress)',
        inputSchema: {
            type: 'object',
            properties: {
                issue_key: { type: 'string', description: 'Jira issue key (e.g. PROJ-123)' },
                transition_name: { type: 'string', description: "Target status name (e.g. 'In Progress', 'Done', 'To Do')" },
            },
            required: ['issue_key', 'transition_name'],
        },
    },
    {
        name: 'get_project_statuses',
        description: 'List available workflow statuses for a Jira project',
        inputSchema: {
            type: 'object',
            properties: {
                project_key: { type: 'string', description: 'Project key (e.g. PROJ)' },
            },
            required: ['project_key'],
        },
    },
];

function makeBasicAuth(email: string, token: string): string {
    return `Basic ${btoa(`${email}:${token}`)}`;
}

async function jira(path: string, auth: string, domain: string, opts: RequestInit = {}) {
    const base = `https://${domain}.atlassian.net/rest/api/3`;
    const res = await fetch(`${base}${path}`, {
        ...opts,
        headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Jira API ${res.status}: ${err}`);
    }
    return res.json();
}

function formatIssue(i: any) {
    return {
        key: i.key,
        summary: i.fields?.summary,
        status: i.fields?.status?.name,
        issue_type: i.fields?.issuetype?.name,
        priority: i.fields?.priority?.name,
        assignee: i.fields?.assignee?.displayName,
        reporter: i.fields?.reporter?.displayName,
        created: i.fields?.created,
        updated: i.fields?.updated,
        url: `https://jira.atlassian.com/browse/${i.key}`,
    };
}

async function callTool(name: string, args: Record<string, unknown>, auth: string, domain: string): Promise<unknown> {
    switch (name) {
        case 'search_issues': {
            const maxResults = Math.min(Number(args.max_results ?? 10), 50);
            const data = await jira(
                `/search?jql=${encodeURIComponent(String(args.jql))}&maxResults=${maxResults}&fields=summary,status,issuetype,priority,assignee,reporter,created,updated`,
                auth, domain,
            ) as any;
            return {
                total: data.total,
                issues: data.issues?.map(formatIssue) ?? [],
            };
        }

        case 'get_issue': {
            const data = await jira(
                `/issue/${args.issue_key}?fields=summary,description,status,issuetype,priority,assignee,reporter,created,updated,comment`,
                auth, domain,
            ) as any;
            return {
                ...formatIssue(data),
                description: data.fields?.description?.content
                    ?.flatMap((b: any) => b.content?.map((c: any) => c.text ?? '') ?? [])
                    .join(' ') ?? '',
                comments: data.fields?.comment?.comments?.slice(-5).map((c: any) => ({
                    author: c.author?.displayName,
                    body: c.body?.content?.flatMap((b: any) => b.content?.map((t: any) => t.text ?? '') ?? []).join(' ') ?? '',
                    created: c.created,
                })) ?? [],
            };
        }

        case 'create_issue': {
            const fields: Record<string, unknown> = {
                project: { key: args.project_key },
                summary: args.summary,
                issuetype: { name: args.issue_type },
            };
            if (args.description) {
                fields.description = {
                    type: 'doc',
                    version: 1,
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: args.description }] }],
                };
            }
            if (args.priority) fields.priority = { name: args.priority };

            const data = await jira('/issue', auth, domain, {
                method: 'POST',
                body: JSON.stringify({ fields }),
            }) as any;
            return { key: data.key, id: data.id, url: `https://${domain}.atlassian.net/browse/${data.key}` };
        }

        case 'add_comment': {
            await jira(`/issue/${args.issue_key}/comment`, auth, domain, {
                method: 'POST',
                body: JSON.stringify({
                    body: {
                        type: 'doc',
                        version: 1,
                        content: [{ type: 'paragraph', content: [{ type: 'text', text: args.body }] }],
                    },
                }),
            });
            return { success: true, issue_key: args.issue_key };
        }

        case 'list_projects': {
            const maxResults = Math.min(Number(args.max_results ?? 20), 50);
            const data = await jira(`/project/search?maxResults=${maxResults}`, auth, domain) as any;
            return data.values?.map((p: any) => ({
                key: p.key,
                name: p.name,
                type: p.projectTypeKey,
                style: p.style,
                lead: p.lead?.displayName,
            })) ?? [];
        }

        case 'transition_issue': {
            // Get available transitions
            const transitions = await jira(`/issue/${args.issue_key}/transitions`, auth, domain) as any;
            const target = transitions.transitions?.find(
                (t: any) => t.name?.toLowerCase() === String(args.transition_name).toLowerCase()
            );
            if (!target) {
                const available = transitions.transitions?.map((t: any) => t.name).join(', ');
                throw new Error(`Transition '${args.transition_name}' not found. Available: ${available}`);
            }
            await jira(`/issue/${args.issue_key}/transitions`, auth, domain, {
                method: 'POST',
                body: JSON.stringify({ transition: { id: target.id } }),
            });
            return { success: true, issue_key: args.issue_key, new_status: target.to?.name ?? args.transition_name };
        }

        case 'get_project_statuses': {
            const data = await jira(`/project/${args.project_key}/statuses`, auth, domain) as any;
            return data.map((issueType: any) => ({
                issue_type: issueType.name,
                statuses: issueType.statuses?.map((s: any) => ({ id: s.id, name: s.name, category: s.statusCategory?.name })),
            }));
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

            const email = request.headers.get('X-Mcp-Secret-JIRA-EMAIL');
            const apiToken = request.headers.get('X-Mcp-Secret-JIRA-API-TOKEN');
            const domain = request.headers.get('X-Mcp-Secret-JIRA-DOMAIN');
            if (!email || !apiToken || !domain) {
                return rpcErr(id, -32001, 'Missing secrets — add JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_DOMAIN to your workspace secrets');
            }

            const auth = makeBasicAuth(email, apiToken);

            try {
                const result = await callTool(toolName, toolArgs, auth, domain);
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
