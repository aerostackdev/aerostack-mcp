/**
 * mcp-docker — Docker Hub MCP Server
 *
 * Search images, inspect tags, view manifests, list repos, and manage Docker Hub.
 * Uses Docker Hub API v2 + Docker Hub API directly.
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 */

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Docker Hub connectivity by fetching the authenticated user profile. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
    {
        name: 'search_images',
        description: 'Search Docker Hub for container images by keyword — returns name, description, star count, pull count, and official status',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query (e.g. "nginx", "postgres", "node")' },
                limit: { type: 'number', description: 'Maximum results to return (default: 25, max: 100)' },
                type: { type: 'string', description: 'Filter by type: "image" (community) or "plugin"' },
                is_official: { type: 'boolean', description: 'Filter to only official images (default: false)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_repository',
        description: 'Get detailed information about a Docker Hub repository — description, star count, pull count, last updated, and Dockerfile',
        inputSchema: {
            type: 'object' as const,
            properties: {
                namespace: { type: 'string', description: 'Repository namespace/owner (e.g. "library" for official images, "myuser")' },
                repository: { type: 'string', description: 'Repository name (e.g. "nginx", "postgres")' },
            },
            required: ['repository'],
        },
    },
    {
        name: 'list_tags',
        description: 'List all tags for a Docker Hub repository with digest, size, architecture, OS, and last pushed date',
        inputSchema: {
            type: 'object' as const,
            properties: {
                namespace: { type: 'string', description: 'Repository namespace (default: "library" for official images)' },
                repository: { type: 'string', description: 'Repository name' },
                page_size: { type: 'number', description: 'Number of tags to return (default: 25, max: 100)' },
                ordering: { type: 'string', description: 'Sort order: "last_updated" or "-last_updated" (default: -last_updated)' },
            },
            required: ['repository'],
        },
    },
    {
        name: 'get_tag',
        description: 'Get detailed information about a specific tag — digest, compressed size, architecture variants, and layer count',
        inputSchema: {
            type: 'object' as const,
            properties: {
                namespace: { type: 'string', description: 'Repository namespace (default: "library")' },
                repository: { type: 'string', description: 'Repository name' },
                tag: { type: 'string', description: 'Tag name (e.g. "latest", "alpine", "22-slim")' },
            },
            required: ['repository', 'tag'],
        },
    },
    {
        name: 'list_repos',
        description: 'List all repositories for a Docker Hub user or organization with pull counts and last updated',
        inputSchema: {
            type: 'object' as const,
            properties: {
                namespace: { type: 'string', description: 'User or organization name (defaults to authenticated user)' },
                page_size: { type: 'number', description: 'Number of repos to return (default: 25, max: 100)' },
                ordering: { type: 'string', description: 'Sort: "last_updated" or "-last_updated" or "name"' },
            },
            required: [] as string[],
        },
    },
    {
        name: 'get_dockerfile',
        description: 'Retrieve the Dockerfile used to build a specific tag of an image (if available from build metadata)',
        inputSchema: {
            type: 'object' as const,
            properties: {
                namespace: { type: 'string', description: 'Repository namespace (default: "library")' },
                repository: { type: 'string', description: 'Repository name' },
                tag: { type: 'string', description: 'Tag name (default: "latest")' },
            },
            required: ['repository'],
        },
    },
    {
        name: 'get_vulnerabilities',
        description: 'Get vulnerability scan summary for a Docker Hub image tag — critical, high, medium, low counts (requires Docker Scout)',
        inputSchema: {
            type: 'object' as const,
            properties: {
                namespace: { type: 'string', description: 'Repository namespace (default: "library")' },
                repository: { type: 'string', description: 'Repository name' },
                tag: { type: 'string', description: 'Tag to scan (default: "latest")' },
            },
            required: ['repository'],
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

async function getDockerToken(username: string, password: string): Promise<string> {
    const res = await fetch('https://hub.docker.com/v2/users/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const data = (await res.json()) as any;
    if (!data.token) throw new Error(data.detail || data.message || 'Docker Hub login failed');
    return data.token;
}

async function hubFetch(token: string, path: string): Promise<any> {
    const res = await fetch(`https://hub.docker.com/v2${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Docker Hub API ${res.status}: ${errText.slice(0, 500)}`);
    }
    return res.json();
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    username: string,
): Promise<unknown> {
    const ns = (args.namespace as string) || 'library';

    switch (name) {
        case '_ping': {
            const user = await hubFetch(token, `/user/`);
            return text(`Connected to Docker Hub as "${user.username}" (${user.company || 'personal'})`);
        }

        case 'search_images': {
            const query = args.query as string;
            const limit = Math.min(Number(args.limit ?? 25), 100);
            const params = new URLSearchParams({ q: query, page_size: String(limit) });
            if (args.is_official) params.set('is_official', 'true');
            if (args.type) params.set('type', args.type as string);
            const data = await hubFetch(token, `/search/repositories?${params}`);
            const images = (data.results ?? []).map((r: any) => ({
                name: r.repo_name,
                description: r.short_description,
                stars: r.star_count,
                pulls: r.pull_count,
                is_official: r.is_official,
                is_automated: r.is_automated,
            }));
            return json({ images, count: images.length, total: data.count });
        }

        case 'get_repository': {
            const repo = args.repository as string;
            const data = await hubFetch(token, `/repositories/${ns}/${repo}/`);
            return json({
                name: data.name,
                namespace: data.namespace,
                description: data.description,
                full_description: data.full_description?.slice(0, 3000),
                stars: data.star_count,
                pulls: data.pull_count,
                is_private: data.is_private,
                last_updated: data.last_updated,
                status: data.status,
            });
        }

        case 'list_tags': {
            const repo = args.repository as string;
            const pageSize = Math.min(Number(args.page_size ?? 25), 100);
            const ordering = (args.ordering as string) || '-last_updated';
            const data = await hubFetch(token, `/repositories/${ns}/${repo}/tags?page_size=${pageSize}&ordering=${ordering}`);
            const tags = (data.results ?? []).map((t: any) => ({
                name: t.name,
                digest: t.digest?.slice(0, 19),
                compressed_size: t.full_size ? formatBytes(t.full_size) : null,
                last_updated: t.last_updated,
                images: t.images?.map((i: any) => ({
                    arch: i.architecture,
                    os: i.os,
                    size: i.size ? formatBytes(i.size) : null,
                })),
            }));
            return json({ tags, count: tags.length, total: data.count });
        }

        case 'get_tag': {
            const repo = args.repository as string;
            const tag = args.tag as string;
            const data = await hubFetch(token, `/repositories/${ns}/${repo}/tags/${tag}`);
            return json({
                name: data.name,
                digest: data.digest,
                compressed_size: data.full_size ? formatBytes(data.full_size) : null,
                last_updated: data.last_updated,
                last_updater_username: data.last_updater_username,
                images: data.images?.map((i: any) => ({
                    arch: i.architecture,
                    os: i.os,
                    os_version: i.os_version,
                    size: i.size ? formatBytes(i.size) : null,
                    digest: i.digest?.slice(0, 19),
                    last_pulled: i.last_pulled,
                    last_pushed: i.last_pushed,
                })),
            });
        }

        case 'list_repos': {
            const repoNs = (args.namespace as string) || username;
            const pageSize = Math.min(Number(args.page_size ?? 25), 100);
            const ordering = (args.ordering as string) || '-last_updated';
            const data = await hubFetch(token, `/repositories/${repoNs}/?page_size=${pageSize}&ordering=${ordering}`);
            const repos = (data.results ?? []).map((r: any) => ({
                name: r.name,
                namespace: r.namespace,
                description: r.description,
                pulls: r.pull_count,
                stars: r.star_count,
                is_private: r.is_private,
                last_updated: r.last_updated,
            }));
            return json({ repos, count: repos.length, total: data.count });
        }

        case 'get_dockerfile': {
            const repo = args.repository as string;
            const tag = (args.tag as string) || 'latest';
            try {
                const data = await hubFetch(token, `/repositories/${ns}/${repo}/dockerfile/`);
                return json({ repository: `${ns}/${repo}`, tag, dockerfile: data.contents });
            } catch {
                return text(`Dockerfile not available for ${ns}/${repo}:${tag}. This is common for images not built via Docker Hub automated builds.`);
            }
        }

        case 'get_vulnerabilities': {
            const repo = args.repository as string;
            const tag = (args.tag as string) || 'latest';
            try {
                const data = await hubFetch(token, `/repositories/${ns}/${repo}/tags/${tag}/vulnerabilities`);
                return json({
                    repository: `${ns}/${repo}:${tag}`,
                    critical: data.critical,
                    high: data.high,
                    medium: data.medium,
                    low: data.low,
                    total: (data.critical ?? 0) + (data.high ?? 0) + (data.medium ?? 0) + (data.low ?? 0),
                });
            } catch {
                return text(`Vulnerability data not available for ${ns}/${repo}:${tag}. Docker Scout must be enabled for the repository.`);
            }
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ─── Worker Entry ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-docker', version: '1.0.0' });
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
                serverInfo: { name: 'mcp-docker', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const username = request.headers.get('X-Mcp-Secret-DOCKER-USERNAME');
            const password = request.headers.get('X-Mcp-Secret-DOCKER-PASSWORD');

            if (!username || !password) {
                return rpcErr(id, -32001, 'Missing Docker Hub credentials — add DOCKER_USERNAME and DOCKER_PASSWORD (or personal access token) to workspace secrets');
            }

            let token: string;
            try {
                token = await getDockerToken(username, password);
            } catch (e: unknown) {
                return rpcErr(id, -32001, `Docker Hub login failed: ${e instanceof Error ? e.message : 'unknown error'}`);
            }

            const { name, arguments: toolArgs = {} } = (params ?? {}) as {
                name: string;
                arguments?: Record<string, unknown>;
            };

            try {
                const result = await callTool(name, toolArgs, token, username);
                return rpcOk(id, result);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
