/**
 * Linear MCP Worker
 * Implements MCP protocol over HTTP for Linear API operations (GraphQL).
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: LINEAR_API_KEY → header: X-Mcp-Secret-LINEAR-API-KEY
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-linear
 */

const LINEAR_API = 'https://api.linear.app/graphql';

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
        name: 'list_issues',
        description: 'List issues for the authenticated user, optionally filtered by team or state',
        inputSchema: {
            type: 'object',
            properties: {
                team_id: { type: 'string', description: 'Filter by team ID (optional)' },
                state: { type: 'string', description: 'Filter by state name: Todo, In Progress, Done, Cancelled (optional)' },
                limit: { type: 'number', description: 'Max issues to return (default 20)' },
            },
        },
    },
    {
        name: 'get_issue',
        description: 'Get detailed information about a Linear issue by its ID or identifier',
        inputSchema: {
            type: 'object',
            properties: {
                issue_id: { type: 'string', description: 'Linear issue ID (UUID) or identifier (e.g. TEAM-123)' },
            },
            required: ['issue_id'],
        },
    },
    {
        name: 'create_issue',
        description: 'Create a new issue in a Linear team',
        inputSchema: {
            type: 'object',
            properties: {
                team_id: { type: 'string', description: 'Team ID to create the issue in' },
                title: { type: 'string', description: 'Issue title' },
                description: { type: 'string', description: 'Issue description in markdown (optional)' },
                priority: { type: 'number', description: 'Priority: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low (optional)' },
            },
            required: ['team_id', 'title'],
        },
    },
    {
        name: 'update_issue',
        description: "Update an existing Linear issue's state, priority, or title",
        inputSchema: {
            type: 'object',
            properties: {
                issue_id: { type: 'string', description: 'Linear issue ID (UUID)' },
                title: { type: 'string', description: 'New title (optional)' },
                state_id: { type: 'string', description: 'New workflow state ID (optional)' },
                priority: { type: 'number', description: 'New priority 0–4 (optional)' },
                description: { type: 'string', description: 'New description in markdown (optional)' },
            },
            required: ['issue_id'],
        },
    },
    {
        name: 'list_teams',
        description: 'List all teams in the Linear workspace',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'list_projects',
        description: 'List projects in Linear, optionally filtered by team',
        inputSchema: {
            type: 'object',
            properties: {
                team_id: { type: 'string', description: 'Filter by team ID (optional)' },
            },
        },
    },
    {
        name: 'add_comment',
        description: 'Add a comment to a Linear issue',
        inputSchema: {
            type: 'object',
            properties: {
                issue_id: { type: 'string', description: 'Linear issue ID (UUID)' },
                body: { type: 'string', description: 'Comment text (markdown supported)' },
            },
            required: ['issue_id', 'body'],
        },
    },
];

async function gql(query: string, variables: Record<string, unknown>, token: string) {
    const res = await fetch(LINEAR_API, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
        throw new Error(`Linear API HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json() as any;
    if (data.errors?.length) {
        throw new Error(`Linear GraphQL error: ${data.errors[0].message}`);
    }
    return data.data;
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'list_issues': {
            const limit = Math.min(Number(args.limit ?? 20), 50);
            const filter: Record<string, unknown> = {};
            if (args.team_id) filter.team = { id: { eq: args.team_id } };
            if (args.state) filter.state = { name: { eq: args.state } };

            const data = await gql(`
                query ListIssues($filter: IssueFilter, $first: Int) {
                    issues(filter: $filter, first: $first, orderBy: updatedAt) {
                        nodes {
                            id identifier title priority
                            state { name color }
                            assignee { name email }
                            team { name key }
                            createdAt updatedAt url
                        }
                    }
                }
            `, { filter: Object.keys(filter).length ? filter : undefined, first: limit }, token);

            return data.issues?.nodes?.map((i: any) => ({
                id: i.id,
                identifier: i.identifier,
                title: i.title,
                state: i.state?.name,
                priority: ['No priority', 'Urgent', 'High', 'Medium', 'Low'][i.priority] ?? i.priority,
                assignee: i.assignee?.name,
                team: i.team?.key,
                url: i.url,
                updated_at: i.updatedAt,
            })) ?? [];
        }

        case 'get_issue': {
            // Try by identifier (e.g. TEAM-123) first
            const isIdentifier = /^[A-Z]+-\d+$/.test(String(args.issue_id));
            const filter = isIdentifier
                ? { identifier: { eq: args.issue_id } }
                : { id: { eq: args.issue_id } };

            const data = await gql(`
                query GetIssue($filter: IssueFilter) {
                    issues(filter: $filter, first: 1) {
                        nodes {
                            id identifier title description priority
                            state { name }
                            assignee { name email }
                            team { name key }
                            labels { nodes { name } }
                            comments { nodes { body createdAt user { name } } }
                            createdAt updatedAt url
                        }
                    }
                }
            `, { filter }, token);

            const issue = data.issues?.nodes?.[0];
            if (!issue) throw new Error(`Issue ${args.issue_id} not found`);

            return {
                id: issue.id,
                identifier: issue.identifier,
                title: issue.title,
                description: issue.description ?? '',
                state: issue.state?.name,
                priority: ['No priority', 'Urgent', 'High', 'Medium', 'Low'][issue.priority] ?? issue.priority,
                assignee: issue.assignee?.name,
                team: issue.team?.key,
                labels: issue.labels?.nodes?.map((l: any) => l.name) ?? [],
                url: issue.url,
                comments: issue.comments?.nodes?.map((c: any) => ({
                    author: c.user?.name,
                    body: c.body,
                    created_at: c.createdAt,
                })) ?? [],
            };
        }

        case 'create_issue': {
            const data = await gql(`
                mutation CreateIssue($input: IssueCreateInput!) {
                    issueCreate(input: $input) {
                        success
                        issue { id identifier title url state { name } }
                    }
                }
            `, {
                input: {
                    teamId: args.team_id,
                    title: args.title,
                    description: args.description,
                    priority: typeof args.priority === 'number' ? args.priority : undefined,
                },
            }, token);

            const issue = data.issueCreate?.issue;
            return { id: issue.id, identifier: issue.identifier, title: issue.title, url: issue.url, state: issue.state?.name };
        }

        case 'update_issue': {
            const input: Record<string, unknown> = {};
            if (args.title) input.title = args.title;
            if (args.state_id) input.stateId = args.state_id;
            if (typeof args.priority === 'number') input.priority = args.priority;
            if (args.description) input.description = args.description;

            const data = await gql(`
                mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
                    issueUpdate(id: $id, input: $input) {
                        success
                        issue { id identifier title url state { name } priority }
                    }
                }
            `, { id: args.issue_id, input }, token);

            const issue = data.issueUpdate?.issue;
            return { id: issue.id, identifier: issue.identifier, title: issue.title, url: issue.url, state: issue.state?.name };
        }

        case 'list_teams': {
            const data = await gql(`
                query { teams { nodes { id name key description } } }
            `, {}, token);
            return data.teams?.nodes ?? [];
        }

        case 'list_projects': {
            const filter = args.team_id ? { team: { id: { eq: args.team_id } } } : undefined;
            const data = await gql(`
                query ListProjects($filter: ProjectFilter) {
                    projects(filter: $filter, first: 30) {
                        nodes { id name description state url startDate targetDate }
                    }
                }
            `, { filter }, token);
            return data.projects?.nodes ?? [];
        }

        case 'add_comment': {
            const data = await gql(`
                mutation AddComment($input: CommentCreateInput!) {
                    commentCreate(input: $input) {
                        success
                        comment { id body createdAt }
                    }
                }
            `, { input: { issueId: args.issue_id, body: args.body } }, token);

            return { id: data.commentCreate?.comment?.id, success: data.commentCreate?.success };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'linear-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'linear-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-LINEAR-API-KEY');
            if (!token) {
                return rpcErr(id, -32001, 'Missing LINEAR_API_KEY secret — add it to your workspace secrets');
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
