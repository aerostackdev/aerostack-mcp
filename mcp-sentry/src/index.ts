/**
 * Sentry MCP Worker
 * Implements MCP protocol over HTTP for Sentry API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: SENTRY_AUTH_TOKEN → header: X-Mcp-Secret-SENTRY-AUTH-TOKEN
 */

const SENTRY_API = 'https://sentry.io/api/0';

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
        name: 'list_organizations',
        description: 'List Sentry organizations accessible to the authenticated user',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'list_projects',
        description: 'List projects in a Sentry organization',
        inputSchema: {
            type: 'object',
            properties: {
                org_slug: { type: 'string', description: 'Organization slug' },
            },
            required: ['org_slug'],
        },
    },
    {
        name: 'list_issues',
        description: 'List issues for a project, optionally filtered by query',
        inputSchema: {
            type: 'object',
            properties: {
                org_slug: { type: 'string', description: 'Organization slug' },
                project_slug: { type: 'string', description: 'Project slug' },
                query: { type: 'string', description: 'Search query (Sentry search syntax)' },
            },
            required: ['org_slug', 'project_slug'],
        },
    },
    {
        name: 'get_issue',
        description: 'Get detailed information about a specific Sentry issue',
        inputSchema: {
            type: 'object',
            properties: {
                issue_id: { type: 'string', description: 'Sentry issue ID' },
            },
            required: ['issue_id'],
        },
    },
    {
        name: 'list_issue_events',
        description: 'List events (occurrences) for a specific issue',
        inputSchema: {
            type: 'object',
            properties: {
                issue_id: { type: 'string', description: 'Sentry issue ID' },
            },
            required: ['issue_id'],
        },
    },
    {
        name: 'resolve_issue',
        description: 'Resolve a Sentry issue by setting its status to resolved',
        inputSchema: {
            type: 'object',
            properties: {
                issue_id: { type: 'string', description: 'Sentry issue ID' },
            },
            required: ['issue_id'],
        },
    },
    {
        name: 'list_releases',
        description: 'List releases for a Sentry organization',
        inputSchema: {
            type: 'object',
            properties: {
                org_slug: { type: 'string', description: 'Organization slug' },
            },
            required: ['org_slug'],
        },
    },
    {
        name: 'get_event',
        description: 'Get full details of a specific event by its ID',
        inputSchema: {
            type: 'object',
            properties: {
                org_slug: { type: 'string', description: 'Organization slug' },
                event_id: { type: 'string', description: 'Event ID' },
            },
            required: ['org_slug', 'event_id'],
        },
    },
];

async function sentry(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${SENTRY_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Aerostack-MCP/1.0',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Sentry API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'list_organizations': {
            const orgs = await sentry('/organizations/', token) as any[];
            return orgs.map(o => ({
                slug: o.slug,
                name: o.name,
                id: o.id,
                status: o.status?.id,
                dateCreated: o.dateCreated,
            }));
        }

        case 'list_projects': {
            const projects = await sentry(`/organizations/${args.org_slug}/projects/`, token) as any[];
            return projects.map(p => ({
                slug: p.slug,
                name: p.name,
                id: p.id,
                platform: p.platform,
                dateCreated: p.dateCreated,
                firstEvent: p.firstEvent,
                hasAccess: p.hasAccess,
            }));
        }

        case 'list_issues': {
            const query = args.query ? `&query=${encodeURIComponent(args.query as string)}` : '';
            const issues = await sentry(
                `/projects/${args.org_slug}/${args.project_slug}/issues/?statsPeriod=24h${query}`,
                token
            ) as any[];
            return issues.map(i => ({
                id: i.id,
                shortId: i.shortId,
                title: i.title,
                culprit: i.culprit,
                level: i.level,
                status: i.status,
                count: i.count,
                userCount: i.userCount,
                firstSeen: i.firstSeen,
                lastSeen: i.lastSeen,
                permalink: i.permalink,
            }));
        }

        case 'get_issue': {
            const issue = await sentry(`/issues/${args.issue_id}/`, token) as any;
            return {
                id: issue.id,
                shortId: issue.shortId,
                title: issue.title,
                culprit: issue.culprit,
                level: issue.level,
                status: issue.status,
                platform: issue.platform,
                count: issue.count,
                userCount: issue.userCount,
                firstSeen: issue.firstSeen,
                lastSeen: issue.lastSeen,
                permalink: issue.permalink,
                metadata: issue.metadata,
                type: issue.type,
                project: issue.project ? { slug: issue.project.slug, name: issue.project.name } : null,
            };
        }

        case 'list_issue_events': {
            const events = await sentry(`/issues/${args.issue_id}/events/`, token) as any[];
            return events.map(e => ({
                id: e.id,
                eventID: e.eventID,
                title: e.title,
                message: e.message,
                dateCreated: e.dateCreated,
                platform: e.platform,
                tags: e.tags?.map((t: any) => ({ key: t.key, value: t.value })) ?? [],
            }));
        }

        case 'resolve_issue': {
            const issue = await sentry(`/issues/${args.issue_id}/`, token, {
                method: 'PUT',
                body: JSON.stringify({ status: 'resolved' }),
            }) as any;
            return {
                id: issue.id,
                shortId: issue.shortId,
                title: issue.title,
                status: issue.status,
                statusDetails: issue.statusDetails,
            };
        }

        case 'list_releases': {
            const releases = await sentry(`/organizations/${args.org_slug}/releases/`, token) as any[];
            return releases.map(r => ({
                version: r.version,
                shortVersion: r.shortVersion,
                dateCreated: r.dateCreated,
                dateReleased: r.dateReleased,
                newGroups: r.newGroups,
                commitCount: r.commitCount,
                lastDeploy: r.lastDeploy ? {
                    environment: r.lastDeploy.environment,
                    dateFinished: r.lastDeploy.dateFinished,
                } : null,
                projects: r.projects?.map((p: any) => ({ slug: p.slug, name: p.name })) ?? [],
            }));
        }

        case 'get_event': {
            const event = await sentry(
                `/organizations/${args.org_slug}/events/${args.event_id}/`,
                token
            ) as any;
            return {
                id: event.id,
                eventID: event.eventID,
                title: event.title,
                message: event.message,
                dateCreated: event.dateCreated,
                platform: event.platform,
                context: event.context,
                contexts: event.contexts,
                tags: event.tags?.map((t: any) => ({ key: t.key, value: t.value })) ?? [],
                entries: event.entries?.map((e: any) => ({
                    type: e.type,
                    data: e.type === 'exception'
                        ? {
                            values: e.data?.values?.map((v: any) => ({
                                type: v.type,
                                value: v.value,
                                mechanism: v.mechanism,
                                stacktrace: v.stacktrace?.frames?.slice(-5).map((f: any) => ({
                                    filename: f.filename,
                                    function: f.function,
                                    lineNo: f.lineNo,
                                    colNo: f.colNo,
                                    context: f.context,
                                })),
                            })) ?? [],
                        }
                        : e.type === 'breadcrumbs'
                        ? { values: e.data?.values?.slice(-10) }
                        : undefined,
                })).filter((e: any) => e.data !== undefined) ?? [],
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'sentry-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'sentry-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            // Read token from injected secret header (underscore key → hyphen header)
            const token = request.headers.get('X-Mcp-Secret-SENTRY-AUTH-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing SENTRY_AUTH_TOKEN secret — add it to your workspace secrets');
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
