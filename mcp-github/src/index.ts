/**
 * GitHub MCP Worker
 * Implements MCP protocol over HTTP for GitHub API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: GITHUB_TOKEN → header: X-Mcp-Secret-GITHUB-TOKEN
 */

const GITHUB_API = 'https://api.github.com';

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
        name: 'list_repos',
        description: 'List GitHub repositories for the authenticated user',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Results per page (default 10, max 30)' },
                sort: { type: 'string', enum: ['updated', 'created', 'pushed', 'full_name'], description: 'Sort order' },
            },
        },
    },
    {
        name: 'get_repo',
        description: 'Get details of a GitHub repository',
        inputSchema: {
            type: 'object',
            properties: {
                owner: { type: 'string', description: 'Repository owner (username or org)' },
                repo: { type: 'string', description: 'Repository name' },
            },
            required: ['owner', 'repo'],
        },
    },
    {
        name: 'list_issues',
        description: 'List issues in a GitHub repository',
        inputSchema: {
            type: 'object',
            properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state filter' },
                per_page: { type: 'number', description: 'Results per page (default 10)' },
            },
            required: ['owner', 'repo'],
        },
    },
    {
        name: 'create_issue',
        description: 'Create a new issue in a GitHub repository',
        inputSchema: {
            type: 'object',
            properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                title: { type: 'string', description: 'Issue title' },
                body: { type: 'string', description: 'Issue body (markdown)' },
                labels: { type: 'array', items: { type: 'string' }, description: 'Labels to add' },
            },
            required: ['owner', 'repo', 'title'],
        },
    },
    {
        name: 'get_issue',
        description: 'Get details of a specific GitHub issue',
        inputSchema: {
            type: 'object',
            properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                issue_number: { type: 'number', description: 'Issue number' },
            },
            required: ['owner', 'repo', 'issue_number'],
        },
    },
    {
        name: 'search_repos',
        description: 'Search GitHub repositories by keyword',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query (GitHub search syntax supported)' },
                per_page: { type: 'number', description: 'Results per page (default 5)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'create_pr_comment',
        description: 'Add a comment to a pull request or issue',
        inputSchema: {
            type: 'object',
            properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                issue_number: { type: 'number', description: 'PR or issue number' },
                body: { type: 'string', description: 'Comment body (markdown)' },
            },
            required: ['owner', 'repo', 'issue_number', 'body'],
        },
    },
];

async function gh(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${GITHUB_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Aerostack-MCP/1.0',
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`GitHub API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'list_repos': {
            const per_page = Math.min(Number(args.per_page ?? 10), 30);
            const sort = (args.sort as string) ?? 'updated';
            const repos = await gh(`/user/repos?per_page=${per_page}&sort=${sort}`, token) as any[];
            return repos.map(r => ({
                full_name: r.full_name,
                description: r.description,
                language: r.language,
                stars: r.stargazers_count,
                url: r.html_url,
                updated_at: r.updated_at,
            }));
        }

        case 'get_repo': {
            const repo = await gh(`/repos/${args.owner}/${args.repo}`, token) as any;
            return {
                full_name: repo.full_name,
                description: repo.description,
                language: repo.language,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                open_issues: repo.open_issues_count,
                default_branch: repo.default_branch,
                url: repo.html_url,
                created_at: repo.created_at,
            };
        }

        case 'list_issues': {
            const per_page = Math.min(Number(args.per_page ?? 10), 30);
            const state = (args.state as string) ?? 'open';
            const issues = await gh(
                `/repos/${args.owner}/${args.repo}/issues?state=${state}&per_page=${per_page}`,
                token
            ) as any[];
            return issues.map(i => ({
                number: i.number,
                title: i.title,
                state: i.state,
                labels: i.labels?.map((l: any) => l.name) ?? [],
                url: i.html_url,
                created_at: i.created_at,
            }));
        }

        case 'create_issue': {
            const issue = await gh(`/repos/${args.owner}/${args.repo}/issues`, token, {
                method: 'POST',
                body: JSON.stringify({ title: args.title, body: args.body ?? '', labels: args.labels ?? [] }),
            }) as any;
            return { number: issue.number, url: issue.html_url, title: issue.title };
        }

        case 'get_issue': {
            const issue = await gh(`/repos/${args.owner}/${args.repo}/issues/${args.issue_number}`, token) as any;
            return {
                number: issue.number,
                title: issue.title,
                body: issue.body,
                state: issue.state,
                labels: issue.labels?.map((l: any) => l.name) ?? [],
                url: issue.html_url,
                author: issue.user?.login,
                created_at: issue.created_at,
            };
        }

        case 'search_repos': {
            const per_page = Math.min(Number(args.per_page ?? 5), 10);
            const data = await gh(`/search/repositories?q=${encodeURIComponent(args.query as string)}&per_page=${per_page}`, token) as any;
            return data.items?.map((r: any) => ({
                full_name: r.full_name,
                description: r.description,
                language: r.language,
                stars: r.stargazers_count,
                url: r.html_url,
            })) ?? [];
        }

        case 'create_pr_comment': {
            const comment = await gh(`/repos/${args.owner}/${args.repo}/issues/${args.issue_number}/comments`, token, {
                method: 'POST',
                body: JSON.stringify({ body: args.body }),
            }) as any;
            return { id: comment.id, url: comment.html_url };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'github-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'github-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            // Read token from injected secret header (underscore key → hyphen header)
            const token = request.headers.get('X-Mcp-Secret-GITHUB-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing GITHUB_TOKEN secret — add it to your workspace secrets');
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
