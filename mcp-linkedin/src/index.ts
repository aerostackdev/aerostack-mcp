/**
 * LinkedIn MCP Worker
 * Implements MCP protocol over HTTP for LinkedIn REST API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   LINKEDIN_ACCESS_TOKEN  → X-Mcp-Secret-LINKEDIN-ACCESS-TOKEN  (OAuth 2.0 user access token)
 *
 * Auth format: Authorization: Bearer {access_token}
 *
 * Key headers sent on every request:
 *   X-Restli-Protocol-Version: 2.0.0
 *   LinkedIn-Version: 202310
 *
 * Covers: Profile (4), Posts & Content (6), Company/Organization (5),
 *         Jobs & Messaging (5) = 20 tools total + _ping
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const LINKEDIN_BASE_URL = 'https://api.linkedin.com';
const LINKEDIN_VERSION = '202310';

function linkedInUrl(path: string): string {
    return `${LINKEDIN_BASE_URL}${path}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

function getSecrets(request: Request): { accessToken: string | null } {
    return {
        accessToken: request.headers.get('X-Mcp-Secret-LINKEDIN-ACCESS-TOKEN'),
    };
}

async function linkedInFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : linkedInUrl(path);
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': LINKEDIN_VERSION,
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return { success: true };

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `LinkedIn HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object') {
            const d = data as { message?: string; serviceErrorCode?: number; status?: number };
            msg = d.message || msg;
        }
        throw { code: -32603, message: `LinkedIn API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Profile (4 tools) ───────────────────────────────────────────

    {
        name: 'get_my_profile',
        description: 'Get the authenticated user\'s LinkedIn profile. Returns name, headline, summary, location, industry, profile URL, and connection count.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_profile_by_id',
        description: 'Get a LinkedIn member profile by their URN or member ID. Returns name, headline, summary, current position, location, and industry.',
        inputSchema: {
            type: 'object',
            properties: {
                person_id: {
                    type: 'string',
                    description: 'LinkedIn member URN (e.g. "urn:li:person:AbCdEfGhIj") or just the ID portion (e.g. "AbCdEfGhIj")',
                },
            },
            required: ['person_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_connections',
        description: 'Get the authenticated user\'s first-degree connections list. Returns member IDs, names, and headlines. LinkedIn limits this to 500 results per call.',
        inputSchema: {
            type: 'object',
            properties: {
                start: {
                    type: 'number',
                    description: 'Pagination start offset (default 0)',
                },
                count: {
                    type: 'number',
                    description: 'Number of connections to return (max 500, default 50)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_profile_views',
        description: 'Get who viewed your LinkedIn profile in the last 90 days. Returns viewer profiles and view timestamps. Requires premium LinkedIn account for full data.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Posts & Content (6 tools) ──────────────────────────────────

    {
        name: 'create_post',
        description: 'Create a text post on LinkedIn on behalf of the authenticated user. Set visibility to PUBLIC or CONNECTIONS.',
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'Text content of the LinkedIn post (max 3000 characters)',
                },
                visibility: {
                    type: 'string',
                    enum: ['PUBLIC', 'CONNECTIONS'],
                    description: 'Post visibility. PUBLIC is visible to everyone; CONNECTIONS is visible only to first-degree connections. (default: PUBLIC)',
                },
            },
            required: ['text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_post_with_image',
        description: 'Create a LinkedIn post that includes an image from a URL. The image is attached as a media asset alongside the text content.',
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'Text content of the LinkedIn post',
                },
                image_url: {
                    type: 'string',
                    description: 'Public URL of the image to include in the post (JPEG, PNG, or GIF)',
                },
                image_title: {
                    type: 'string',
                    description: 'Optional title/alt text for the image',
                },
                visibility: {
                    type: 'string',
                    enum: ['PUBLIC', 'CONNECTIONS'],
                    description: 'Post visibility (default: PUBLIC)',
                },
            },
            required: ['text', 'image_url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_post',
        description: 'Delete a LinkedIn post by its URN. You can only delete posts authored by the authenticated user.',
        inputSchema: {
            type: 'object',
            properties: {
                post_urn: {
                    type: 'string',
                    description: 'The LinkedIn post URN (e.g. "urn:li:share:7123456789012345678" or "urn:li:ugcPost:7123456789012345678")',
                },
            },
            required: ['post_urn'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_post',
        description: 'Get details of a specific LinkedIn post by URN, including text, author, creation time, and social activity counts.',
        inputSchema: {
            type: 'object',
            properties: {
                post_urn: {
                    type: 'string',
                    description: 'The LinkedIn post URN (e.g. "urn:li:share:7123456789012345678")',
                },
            },
            required: ['post_urn'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'like_post',
        description: 'Like a LinkedIn post on behalf of the authenticated user.',
        inputSchema: {
            type: 'object',
            properties: {
                post_urn: {
                    type: 'string',
                    description: 'The LinkedIn post URN to like',
                },
            },
            required: ['post_urn'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'comment_on_post',
        description: 'Add a comment to a LinkedIn post on behalf of the authenticated user.',
        inputSchema: {
            type: 'object',
            properties: {
                post_urn: {
                    type: 'string',
                    description: 'The LinkedIn post URN to comment on',
                },
                text: {
                    type: 'string',
                    description: 'Text content of the comment (max 1250 characters)',
                },
            },
            required: ['post_urn', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 3 — Company/Organization (5 tools) ──────────────────────────────

    {
        name: 'get_company',
        description: 'Get company details by LinkedIn organization ID. Returns name, description, website, industry, follower count, employee count, and headquarters.',
        inputSchema: {
            type: 'object',
            properties: {
                company_id: {
                    type: 'string',
                    description: 'LinkedIn organization/company numeric ID (e.g. "1234567"). Find it in the company page URL: linkedin.com/company/{id}/',
                },
            },
            required: ['company_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_company_posts',
        description: 'Get recent posts from a LinkedIn company page. Returns post text, creation time, and engagement counts.',
        inputSchema: {
            type: 'object',
            properties: {
                company_id: {
                    type: 'string',
                    description: 'LinkedIn organization/company numeric ID',
                },
                count: {
                    type: 'number',
                    description: 'Number of posts to return (max 50, default 10)',
                },
                start: {
                    type: 'number',
                    description: 'Pagination start offset (default 0)',
                },
            },
            required: ['company_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_company_post',
        description: 'Post content on behalf of a LinkedIn company page. The authenticated user must be a page admin.',
        inputSchema: {
            type: 'object',
            properties: {
                company_id: {
                    type: 'string',
                    description: 'LinkedIn organization/company numeric ID (must be a page you administer)',
                },
                text: {
                    type: 'string',
                    description: 'Text content of the company post (max 3000 characters)',
                },
                visibility: {
                    type: 'string',
                    enum: ['PUBLIC', 'LOGGED_IN'],
                    description: 'Post visibility. PUBLIC is visible to everyone; LOGGED_IN is visible to all LinkedIn members. (default: PUBLIC)',
                },
            },
            required: ['company_id', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_company_followers',
        description: 'Get follower count and follower demographic summary for a LinkedIn company page.',
        inputSchema: {
            type: 'object',
            properties: {
                company_id: {
                    type: 'string',
                    description: 'LinkedIn organization/company numeric ID',
                },
            },
            required: ['company_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_companies',
        description: 'Search for LinkedIn companies by name or keyword. Returns company names, IDs, industry, and follower counts.',
        inputSchema: {
            type: 'object',
            properties: {
                keywords: {
                    type: 'string',
                    description: 'Search keywords to find companies (e.g. "cloud infrastructure", "fintech")',
                },
                count: {
                    type: 'number',
                    description: 'Number of results to return (max 50, default 10)',
                },
            },
            required: ['keywords'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Jobs & Messaging (5 tools) ─────────────────────────────────

    {
        name: 'search_jobs',
        description: 'Search LinkedIn job postings by keywords, location, and company. Returns job title, company, location, and job description snippet.',
        inputSchema: {
            type: 'object',
            properties: {
                keywords: {
                    type: 'string',
                    description: 'Job title or skill keywords (e.g. "senior software engineer", "product manager AI")',
                },
                location: {
                    type: 'string',
                    description: 'Location to filter by (e.g. "San Francisco, CA", "Remote", "London")',
                },
                company: {
                    type: 'string',
                    description: 'Company name to filter by (optional)',
                },
                count: {
                    type: 'number',
                    description: 'Number of job results to return (max 50, default 10)',
                },
            },
            required: ['keywords'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_job',
        description: 'Get detailed information about a specific LinkedIn job posting by job ID. Returns job title, description, requirements, salary range, and application status.',
        inputSchema: {
            type: 'object',
            properties: {
                job_id: {
                    type: 'string',
                    description: 'LinkedIn job posting numeric ID (found in the job URL: linkedin.com/jobs/view/{job_id})',
                },
            },
            required: ['job_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'send_message',
        description: 'Send a direct LinkedIn message to a connection. The recipient must be a first-degree connection.',
        inputSchema: {
            type: 'object',
            properties: {
                recipient_urn: {
                    type: 'string',
                    description: 'LinkedIn member URN of the recipient (e.g. "urn:li:person:AbCdEfGhIj")',
                },
                subject: {
                    type: 'string',
                    description: 'Subject line of the message',
                },
                body: {
                    type: 'string',
                    description: 'Body text of the message (max 2000 characters)',
                },
            },
            required: ['recipient_urn', 'subject', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_conversations',
        description: 'Get the list of LinkedIn message conversations for the authenticated user. Returns conversation IDs, participants, last message preview, and timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                count: {
                    type: 'number',
                    description: 'Number of conversations to return (max 20, default 10)',
                },
                start: {
                    type: 'number',
                    description: 'Pagination start offset (default 0)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_conversation_messages',
        description: 'Get messages within a specific LinkedIn conversation by conversation ID.',
        inputSchema: {
            type: 'object',
            properties: {
                conversation_id: {
                    type: 'string',
                    description: 'LinkedIn conversation ID (obtained from get_conversations)',
                },
                count: {
                    type: 'number',
                    description: 'Number of messages to return (max 20, default 10)',
                },
            },
            required: ['conversation_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ─────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify credentials by calling GET /v2/me with the access token. Returns the authenticated user\'s profile if the token is valid.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        // ── Profile ─────────────────────────────────────────────────────────────

        case 'get_my_profile': {
            const params = new URLSearchParams({
                projection: '(id,localizedFirstName,localizedLastName,localizedHeadline,localizedSummary,profilePicture,vanityName)',
            });
            return linkedInFetch(`/v2/me?${params}`, token);
        }

        case 'get_profile_by_id': {
            validateRequired(args, ['person_id']);
            let urn = args.person_id as string;
            if (!urn.startsWith('urn:li:person:')) {
                urn = `urn:li:person:${urn}`;
            }
            const encodedUrn = encodeURIComponent(urn);
            const params = new URLSearchParams({
                projection: '(id,localizedFirstName,localizedLastName,localizedHeadline,localizedSummary,profilePicture)',
            });
            return linkedInFetch(`/v2/people/${encodedUrn}?${params}`, token);
        }

        case 'get_connections': {
            const start = (args.start as number) || 0;
            const count = Math.min(500, (args.count as number) || 50);
            const params = new URLSearchParams({
                q: 'viewer',
                start: String(start),
                count: String(count),
                projection: '(elements*(to~(id,localizedFirstName,localizedLastName,localizedHeadline)))',
            });
            return linkedInFetch(`/v2/connections?${params}`, token);
        }

        case 'get_profile_views': {
            return linkedInFetch('/v2/me/profileViews?q=recentWhoViewed', token);
        }

        // ── Posts & Content ──────────────────────────────────────────────────────

        case 'create_post': {
            validateRequired(args, ['text']);
            const visibility = (args.visibility as string) || 'PUBLIC';
            // Get the author URN first by fetching /v2/me
            const me = await linkedInFetch('/v2/me', token) as { id: string };
            const authorUrn = `urn:li:person:${me.id}`;
            return linkedInFetch('/v2/ugcPosts', token, {
                method: 'POST',
                body: JSON.stringify({
                    author: authorUrn,
                    lifecycleState: 'PUBLISHED',
                    specificContent: {
                        'com.linkedin.ugc.ShareContent': {
                            shareCommentary: { text: args.text },
                            shareMediaCategory: 'NONE',
                        },
                    },
                    visibility: {
                        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
                    },
                }),
            });
        }

        case 'create_post_with_image': {
            validateRequired(args, ['text', 'image_url']);
            const visibility = (args.visibility as string) || 'PUBLIC';
            const me = await linkedInFetch('/v2/me', token) as { id: string };
            const authorUrn = `urn:li:person:${me.id}`;
            return linkedInFetch('/v2/ugcPosts', token, {
                method: 'POST',
                body: JSON.stringify({
                    author: authorUrn,
                    lifecycleState: 'PUBLISHED',
                    specificContent: {
                        'com.linkedin.ugc.ShareContent': {
                            shareCommentary: { text: args.text },
                            shareMediaCategory: 'IMAGE',
                            media: [{
                                status: 'READY',
                                originalUrl: args.image_url,
                                title: { text: args.image_title || '' },
                            }],
                        },
                    },
                    visibility: {
                        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
                    },
                }),
            });
        }

        case 'delete_post': {
            validateRequired(args, ['post_urn']);
            const encodedUrn = encodeURIComponent(args.post_urn as string);
            return linkedInFetch(`/v2/ugcPosts/${encodedUrn}`, token, { method: 'DELETE' });
        }

        case 'get_post': {
            validateRequired(args, ['post_urn']);
            const encodedUrn = encodeURIComponent(args.post_urn as string);
            return linkedInFetch(`/v2/ugcPosts/${encodedUrn}`, token);
        }

        case 'like_post': {
            validateRequired(args, ['post_urn']);
            const me = await linkedInFetch('/v2/me', token) as { id: string };
            const actorUrn = `urn:li:person:${me.id}`;
            const params = new URLSearchParams({ actor: actorUrn });
            return linkedInFetch(`/v2/likes?${params}`, token, {
                method: 'POST',
                body: JSON.stringify({
                    actor: actorUrn,
                    object: args.post_urn,
                }),
            });
        }

        case 'comment_on_post': {
            validateRequired(args, ['post_urn', 'text']);
            const me = await linkedInFetch('/v2/me', token) as { id: string };
            const actorUrn = `urn:li:person:${me.id}`;
            const params = new URLSearchParams({ actor: actorUrn });
            return linkedInFetch(`/v2/comments?${params}`, token, {
                method: 'POST',
                body: JSON.stringify({
                    actor: actorUrn,
                    object: args.post_urn,
                    message: { text: args.text },
                }),
            });
        }

        // ── Company/Organization ─────────────────────────────────────────────────

        case 'get_company': {
            validateRequired(args, ['company_id']);
            const params = new URLSearchParams({
                projection: '(id,localizedName,localizedDescription,websiteUrl,industries,staffCount,followingInfo,vanityName,headquartersLocation)',
            });
            return linkedInFetch(`/v2/organizations/${args.company_id}?${params}`, token);
        }

        case 'get_company_posts': {
            validateRequired(args, ['company_id']);
            const start = (args.start as number) || 0;
            const count = Math.min(50, (args.count as number) || 10);
            const authorUrn = encodeURIComponent(`urn:li:organization:${args.company_id}`);
            const params = new URLSearchParams({
                q: 'authors',
                authors: `List(${decodeURIComponent(authorUrn)})`,
                count: String(count),
                start: String(start),
            });
            return linkedInFetch(`/v2/ugcPosts?${params}`, token);
        }

        case 'create_company_post': {
            validateRequired(args, ['company_id', 'text']);
            const visibility = (args.visibility as string) || 'PUBLIC';
            const authorUrn = `urn:li:organization:${args.company_id}`;
            return linkedInFetch('/v2/ugcPosts', token, {
                method: 'POST',
                body: JSON.stringify({
                    author: authorUrn,
                    lifecycleState: 'PUBLISHED',
                    specificContent: {
                        'com.linkedin.ugc.ShareContent': {
                            shareCommentary: { text: args.text },
                            shareMediaCategory: 'NONE',
                        },
                    },
                    visibility: {
                        'com.linkedin.ugc.MemberNetworkVisibility': visibility === 'LOGGED_IN' ? 'LOGGED_IN' : 'PUBLIC',
                    },
                }),
            });
        }

        case 'get_company_followers': {
            validateRequired(args, ['company_id']);
            const params = new URLSearchParams({
                q: 'organizationalEntity',
                organizationalEntity: `urn:li:organization:${args.company_id}`,
            });
            return linkedInFetch(`/v2/organizationalEntityFollowerStatistics?${params}`, token);
        }

        case 'search_companies': {
            validateRequired(args, ['keywords']);
            const count = Math.min(50, (args.count as number) || 10);
            const params = new URLSearchParams({
                q: 'search',
                query: '(keywords:' + encodeURIComponent(args.keywords as string) + ')',
                count: String(count),
            });
            return linkedInFetch(`/v2/organizations?${params}`, token);
        }

        // ── Jobs & Messaging ─────────────────────────────────────────────────────

        case 'search_jobs': {
            validateRequired(args, ['keywords']);
            const count = Math.min(50, (args.count as number) || 10);
            const queryParts: string[] = [`keywords:${args.keywords}`];
            if (args.location) queryParts.push(`locationFallback:${args.location}`);
            if (args.company) queryParts.push(`company:${args.company}`);
            const params = new URLSearchParams({
                q: 'jobSearch',
                keywords: args.keywords as string,
                count: String(count),
            });
            if (args.location) params.set('locationFallback', args.location as string);
            return linkedInFetch(`/v2/jobSearch?${params}`, token);
        }

        case 'get_job': {
            validateRequired(args, ['job_id']);
            const params = new URLSearchParams({
                projection: '(id,title,description,companyDetails,formattedLocation,applyMethod,listedAt,expireAt)',
            });
            return linkedInFetch(`/v2/jobs/${args.job_id}?${params}`, token);
        }

        case 'send_message': {
            validateRequired(args, ['recipient_urn', 'subject', 'body']);
            const me = await linkedInFetch('/v2/me', token) as { id: string };
            const senderUrn = `urn:li:person:${me.id}`;
            return linkedInFetch('/v2/messages', token, {
                method: 'POST',
                body: JSON.stringify({
                    recipients: [`urn:li:mailbox:${(args.recipient_urn as string).replace('urn:li:person:', '')}`],
                    subject: args.subject,
                    body: args.body,
                    messageType: 'MEMBER_TO_MEMBER',
                    senderInformation: {
                        sender: senderUrn,
                        senderType: 'MEMBER',
                    },
                }),
            });
        }

        case 'get_conversations': {
            const start = (args.start as number) || 0;
            const count = Math.min(20, (args.count as number) || 10);
            const params = new URLSearchParams({
                q: 'participant',
                start: String(start),
                count: String(count),
            });
            return linkedInFetch(`/v2/conversations?${params}`, token);
        }

        case 'get_conversation_messages': {
            validateRequired(args, ['conversation_id']);
            const count = Math.min(20, (args.count as number) || 10);
            const params = new URLSearchParams({
                count: String(count),
            });
            return linkedInFetch(`/v2/conversations/${args.conversation_id}/events?${params}`, token);
        }

        // ── Ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            return linkedInFetch('/v2/me', token);
        }

        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-linkedin', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        // ── MCP protocol methods ──────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-linkedin', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const { accessToken } = getSecrets(request);
            if (!accessToken) {
                return rpcErr(id, -32001, 'Missing required secret: LINKEDIN_ACCESS_TOKEN (header: X-Mcp-Secret-LINKEDIN-ACCESS-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, accessToken);
                return rpcOk(id, toolOk(result));
            } catch (err: unknown) {
                if (err && typeof err === 'object' && 'code' in err) {
                    const e = err as { code: number; message: string };
                    return rpcErr(id, e.code, e.message);
                }
                if (err instanceof Error) {
                    return rpcErr(id, -32603, err.message);
                }
                return rpcErr(id, -32603, 'Internal error');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
