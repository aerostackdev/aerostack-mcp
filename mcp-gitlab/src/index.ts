/**
 * mcp-gitlab — GitLab MCP Server
 *
 * Manage projects, issues, merge requests, pipelines, branches, and search code.
 * Uses GitLab REST API v4 directly — works with gitlab.com and self-hosted instances.
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 */

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify GitLab connectivity by fetching the authenticated user. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
    {
        name: 'list_projects',
        description: 'List GitLab projects accessible to the authenticated user with name, URL, visibility, star count, and last activity',
        inputSchema: {
            type: 'object' as const,
            properties: {
                search: { type: 'string', description: 'Search projects by name or path' },
                owned: { type: 'boolean', description: 'Only list projects owned by the authenticated user (default: false)' },
                membership: { type: 'boolean', description: 'Only list projects the user is a member of (default: true)' },
                order_by: { type: 'string', description: 'Sort by: created_at, updated_at, last_activity_at, name, star_count (default: last_activity_at)' },
                per_page: { type: 'number', description: 'Results per page (default: 20, max: 100)' },
            },
            required: [] as string[],
        },
    },
    {
        name: 'get_project',
        description: 'Get detailed info about a GitLab project — description, default branch, visibility, statistics, and namespace',
        inputSchema: {
            type: 'object' as const,
            properties: {
                project: { type: 'string', description: 'Project ID (number) or URL-encoded path (e.g. "group/project")' },
            },
            required: ['project'],
        },
    },
    {
        name: 'list_issues',
        description: 'List issues in a project with optional filters for state, labels, assignee, milestone, and search',
        inputSchema: {
            type: 'object' as const,
            properties: {
                project: { type: 'string', description: 'Project ID or URL-encoded path' },
                state: { type: 'string', description: 'Filter by state: opened, closed, all (default: opened)' },
                labels: { type: 'string', description: 'Comma-separated label names to filter by' },
                assignee_username: { type: 'string', description: 'Filter by assignee username' },
                search: { type: 'string', description: 'Search issues by title and description' },
                per_page: { type: 'number', description: 'Results per page (default: 20, max: 100)' },
            },
            required: ['project'],
        },
    },
    {
        name: 'create_issue',
        description: 'Create a new issue in a GitLab project with title, description, labels, assignees, and milestone',
        inputSchema: {
            type: 'object' as const,
            properties: {
                project: { type: 'string', description: 'Project ID or URL-encoded path' },
                title: { type: 'string', description: 'Issue title' },
                description: { type: 'string', description: 'Issue description (supports GitLab Flavored Markdown)' },
                labels: { type: 'string', description: 'Comma-separated label names' },
                assignee_ids: { type: 'array', items: { type: 'number' }, description: 'Array of user IDs to assign' },
                milestone_id: { type: 'number', description: 'Milestone ID to assign' },
            },
            required: ['project', 'title'],
        },
    },
    {
        name: 'list_merge_requests',
        description: 'List merge requests in a project with filters for state, labels, author, target branch, and review status',
        inputSchema: {
            type: 'object' as const,
            properties: {
                project: { type: 'string', description: 'Project ID or URL-encoded path' },
                state: { type: 'string', description: 'Filter by state: opened, closed, merged, all (default: opened)' },
                target_branch: { type: 'string', description: 'Filter by target branch name' },
                author_username: { type: 'string', description: 'Filter by author username' },
                search: { type: 'string', description: 'Search by title and description' },
                per_page: { type: 'number', description: 'Results per page (default: 20, max: 100)' },
            },
            required: ['project'],
        },
    },
    {
        name: 'get_merge_request',
        description: 'Get full details of a merge request — diff stats, approvals, pipeline status, conflicts, and reviewers',
        inputSchema: {
            type: 'object' as const,
            properties: {
                project: { type: 'string', description: 'Project ID or URL-encoded path' },
                mr_iid: { type: 'number', description: 'Merge request IID (internal ID within the project)' },
            },
            required: ['project', 'mr_iid'],
        },
    },
    {
        name: 'list_pipelines',
        description: 'List CI/CD pipelines for a project with status, ref (branch/tag), duration, and trigger info',
        inputSchema: {
            type: 'object' as const,
            properties: {
                project: { type: 'string', description: 'Project ID or URL-encoded path' },
                status: { type: 'string', description: 'Filter by status: running, pending, success, failed, canceled, skipped, manual' },
                ref: { type: 'string', description: 'Filter by branch or tag name' },
                per_page: { type: 'number', description: 'Results per page (default: 20, max: 100)' },
            },
            required: ['project'],
        },
    },
    {
        name: 'list_branches',
        description: 'List branches in a project with name, commit SHA, protected status, and whether merged',
        inputSchema: {
            type: 'object' as const,
            properties: {
                project: { type: 'string', description: 'Project ID or URL-encoded path' },
                search: { type: 'string', description: 'Search branches by name' },
            },
            required: ['project'],
        },
    },
    {
        name: 'search_code',
        description: 'Search for code across a project by keyword, returning matching file paths and line content',
        inputSchema: {
            type: 'object' as const,
            properties: {
                project: { type: 'string', description: 'Project ID or URL-encoded path' },
                query: { type: 'string', description: 'Search query string' },
                ref: { type: 'string', description: 'Branch or tag to search in (default: default branch)' },
            },
            required: ['project', 'query'],
        },
    },
    {
        name: 'get_file',
        description: 'Read a file from a GitLab repository by path and branch — returns decoded content for text files',
        inputSchema: {
            type: 'object' as const,
            properties: {
                project: { type: 'string', description: 'Project ID or URL-encoded path' },
                file_path: { type: 'string', description: 'Path to the file in the repository (e.g. "src/index.ts")' },
                ref: { type: 'string', description: 'Branch, tag, or commit SHA (default: default branch)' },
            },
            required: ['project', 'file_path'],
        },
    },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function rpcOk(id: unknown, result: unknown) {
    return Response.json({ jsonrpc: '2.0', id, result });
}

function rpcErr(id: unknown, code: number, message: string) {
    return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

async function glFetch(baseUrl: string, token: string, path: string, method = 'GET', body?: unknown): Promise<any> {
    const res = await fetch(`${baseUrl}/api/v4${path}`, {
        method,
        headers: {
            'PRIVATE-TOKEN': token,
            'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`GitLab API ${res.status}: ${errText.slice(0, 500)}`);
    }
    return res.json();
}

function enc(path: string): string {
    return encodeURIComponent(path);
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    baseUrl: string,
    token: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const user = await glFetch(baseUrl, token, '/user');
            return text(`Connected to GitLab as "${user.username}" (${user.name})`);
        }

        case 'list_projects': {
            const params = new URLSearchParams();
            if (args.search) params.set('search', args.search as string);
            if (args.owned) params.set('owned', 'true');
            params.set('membership', args.membership === false ? 'false' : 'true');
            params.set('order_by', (args.order_by as string) || 'last_activity_at');
            params.set('per_page', String(Math.min(Number(args.per_page ?? 20), 100)));
            const data = await glFetch(baseUrl, token, `/projects?${params}`);
            const projects = data.map((p: any) => ({
                id: p.id,
                name: p.name,
                path: p.path_with_namespace,
                url: p.web_url,
                visibility: p.visibility,
                default_branch: p.default_branch,
                stars: p.star_count,
                forks: p.forks_count,
                last_activity: p.last_activity_at,
            }));
            return json({ projects, count: projects.length });
        }

        case 'get_project': {
            const project = args.project as string;
            const p = await glFetch(baseUrl, token, `/projects/${enc(project)}?statistics=true`);
            return json({
                id: p.id,
                name: p.name,
                path: p.path_with_namespace,
                url: p.web_url,
                description: p.description,
                visibility: p.visibility,
                default_branch: p.default_branch,
                stars: p.star_count,
                forks: p.forks_count,
                open_issues: p.open_issues_count,
                created: p.created_at,
                last_activity: p.last_activity_at,
                statistics: p.statistics,
            });
        }

        case 'list_issues': {
            const project = args.project as string;
            const params = new URLSearchParams();
            params.set('state', (args.state as string) || 'opened');
            if (args.labels) params.set('labels', args.labels as string);
            if (args.assignee_username) params.set('assignee_username', args.assignee_username as string);
            if (args.search) params.set('search', args.search as string);
            params.set('per_page', String(Math.min(Number(args.per_page ?? 20), 100)));
            const data = await glFetch(baseUrl, token, `/projects/${enc(project)}/issues?${params}`);
            const issues = data.map((i: any) => ({
                iid: i.iid,
                title: i.title,
                state: i.state,
                labels: i.labels,
                assignees: i.assignees?.map((a: any) => a.username),
                author: i.author?.username,
                milestone: i.milestone?.title,
                created: i.created_at,
                updated: i.updated_at,
                url: i.web_url,
            }));
            return json({ issues, count: issues.length });
        }

        case 'create_issue': {
            const project = args.project as string;
            const body: any = { title: args.title };
            if (args.description) body.description = args.description;
            if (args.labels) body.labels = args.labels;
            if (args.assignee_ids) body.assignee_ids = args.assignee_ids;
            if (args.milestone_id) body.milestone_id = args.milestone_id;
            const issue = await glFetch(baseUrl, token, `/projects/${enc(project)}/issues`, 'POST', body);
            return json({ iid: issue.iid, title: issue.title, url: issue.web_url, state: issue.state });
        }

        case 'list_merge_requests': {
            const project = args.project as string;
            const params = new URLSearchParams();
            params.set('state', (args.state as string) || 'opened');
            if (args.target_branch) params.set('target_branch', args.target_branch as string);
            if (args.author_username) params.set('author_username', args.author_username as string);
            if (args.search) params.set('search', args.search as string);
            params.set('per_page', String(Math.min(Number(args.per_page ?? 20), 100)));
            const data = await glFetch(baseUrl, token, `/projects/${enc(project)}/merge_requests?${params}`);
            const mrs = data.map((m: any) => ({
                iid: m.iid,
                title: m.title,
                state: m.state,
                source_branch: m.source_branch,
                target_branch: m.target_branch,
                author: m.author?.username,
                merge_status: m.merge_status,
                has_conflicts: m.has_conflicts,
                created: m.created_at,
                url: m.web_url,
            }));
            return json({ merge_requests: mrs, count: mrs.length });
        }

        case 'get_merge_request': {
            const project = args.project as string;
            const mrIid = args.mr_iid as number;
            const m = await glFetch(baseUrl, token, `/projects/${enc(project)}/merge_requests/${mrIid}`);
            return json({
                iid: m.iid,
                title: m.title,
                description: m.description,
                state: m.state,
                source_branch: m.source_branch,
                target_branch: m.target_branch,
                author: m.author?.username,
                assignees: m.assignees?.map((a: any) => a.username),
                reviewers: m.reviewers?.map((r: any) => r.username),
                merge_status: m.merge_status,
                has_conflicts: m.has_conflicts,
                changes_count: m.changes_count,
                diff_stats: { additions: m.diff_refs?.additions, deletions: m.diff_refs?.deletions },
                pipeline_status: m.pipeline?.status,
                created: m.created_at,
                updated: m.updated_at,
                url: m.web_url,
            });
        }

        case 'list_pipelines': {
            const project = args.project as string;
            const params = new URLSearchParams();
            if (args.status) params.set('status', args.status as string);
            if (args.ref) params.set('ref', args.ref as string);
            params.set('per_page', String(Math.min(Number(args.per_page ?? 20), 100)));
            const data = await glFetch(baseUrl, token, `/projects/${enc(project)}/pipelines?${params}`);
            const pipelines = data.map((p: any) => ({
                id: p.id,
                status: p.status,
                ref: p.ref,
                sha: p.sha?.slice(0, 8),
                source: p.source,
                created: p.created_at,
                updated: p.updated_at,
                url: p.web_url,
            }));
            return json({ pipelines, count: pipelines.length });
        }

        case 'list_branches': {
            const project = args.project as string;
            const params = new URLSearchParams();
            if (args.search) params.set('search', args.search as string);
            const data = await glFetch(baseUrl, token, `/projects/${enc(project)}/repository/branches?${params}`);
            const branches = data.map((b: any) => ({
                name: b.name,
                commit_sha: b.commit?.short_id,
                commit_message: b.commit?.title,
                protected: b.protected,
                merged: b.merged,
                default: b.default,
            }));
            return json({ branches, count: branches.length });
        }

        case 'search_code': {
            const project = args.project as string;
            const params = new URLSearchParams({ search: args.query as string });
            if (args.ref) params.set('ref', args.ref as string);
            const data = await glFetch(baseUrl, token, `/projects/${enc(project)}/search?scope=blobs&${params}`);
            const results = data.map((r: any) => ({
                file: r.filename,
                path: r.path,
                ref: r.ref,
                startline: r.startline,
                data: r.data,
            }));
            return json({ results, count: results.length });
        }

        case 'get_file': {
            const project = args.project as string;
            const filePath = enc(args.file_path as string);
            const ref = (args.ref as string) || 'HEAD';
            const data = await glFetch(baseUrl, token, `/projects/${enc(project)}/repository/files/${filePath}?ref=${ref}`);
            let content = data.content;
            if (data.encoding === 'base64') {
                content = atob(data.content);
            }
            return json({
                path: data.file_path,
                size: data.size,
                encoding: data.encoding,
                ref: data.ref,
                content: content?.length > 100000 ? content.slice(0, 100000) + '\n...(truncated)' : content,
            });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ─── Worker Entry ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-gitlab', version: '1.0.0' });
        }
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = (await request.json()) as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-gitlab', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-GITLAB-TOKEN');
            const baseUrl = request.headers.get('X-Mcp-Secret-GITLAB-URL') || 'https://gitlab.com';

            if (!token) {
                return rpcErr(id, -32001, 'Missing GITLAB_TOKEN secret — add your GitLab personal access token to workspace secrets');
            }

            const { name, arguments: toolArgs = {} } = (params ?? {}) as {
                name: string;
                arguments?: Record<string, unknown>;
            };

            try {
                const result = await callTool(name, toolArgs, baseUrl.replace(/\/+$/, ''), token);
                return rpcOk(id, result);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
