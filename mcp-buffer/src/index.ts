/**
 * Buffer MCP Worker
 * Implements MCP protocol over HTTP for Buffer social media scheduling operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   BUFFER_ACCESS_TOKEN  → X-Mcp-Secret-BUFFER-ACCESS-TOKEN  (OAuth Bearer token)
 *
 * Auth format: Authorization: Bearer {access_token}
 * Content-Type for POST/PUT: application/x-www-form-urlencoded (Buffer v1 API quirk)
 * Base URL: https://api.bufferapp.com/1
 *
 * Covers: User & Profiles (4), Posts/Updates (6), Scheduling (3),
 *         Analytics (3), Queue (2) = 18 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const BUFFER_BASE_URL = 'https://api.bufferapp.com/1';

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

function getSecrets(request: Request): { token: string | null } {
    return {
        token: request.headers.get('X-Mcp-Secret-BUFFER-ACCESS-TOKEN'),
    };
}

/** Encode an object as application/x-www-form-urlencoded */
function toFormEncoded(data: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [key, val] of Object.entries(data)) {
        if (val === undefined || val === null) continue;
        if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                const item = val[i];
                if (item !== null && typeof item === 'object') {
                    for (const [subKey, subVal] of Object.entries(item as Record<string, unknown>)) {
                        parts.push(
                            `${encodeURIComponent(`${key}[${i}][${subKey}]`)}=${encodeURIComponent(String(subVal))}`,
                        );
                    }
                } else {
                    parts.push(`${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(String(item))}`);
                }
            }
        } else if (typeof val === 'object') {
            for (const [subKey, subVal] of Object.entries(val as Record<string, unknown>)) {
                parts.push(`${encodeURIComponent(`${key}[${subKey}]`)}=${encodeURIComponent(String(subVal))}`);
            }
        } else {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
        }
    }
    return parts.join('&');
}

async function bufferFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${BUFFER_BASE_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            ...(options.headers as Record<string, string> || {}),
        },
    });

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Buffer HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        const errData = data as { error?: string; message?: string };
        const msg = errData?.error || errData?.message || res.statusText;
        throw { code: -32603, message: `Buffer API error ${res.status}: ${msg}` };
    }

    return data;
}

async function bufferGet(path: string, token: string): Promise<unknown> {
    return bufferFetch(path, token);
}

async function bufferPost(
    path: string,
    token: string,
    body: Record<string, unknown>,
): Promise<unknown> {
    return bufferFetch(path, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: toFormEncoded(body),
    });
}

async function bufferDelete(path: string, token: string): Promise<unknown> {
    return bufferFetch(path, token, { method: 'DELETE' });
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — User & Profiles (4 tools) ───────────────────────────────────

    {
        name: 'get_user',
        description: 'Get authenticated Buffer user info including id, name, email, and plan.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_profiles',
        description: 'List all social profiles connected to the Buffer account (Twitter, Facebook, LinkedIn, Instagram). Returns id, service, username, formatted_service.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_profile',
        description: 'Get details for a specific social profile by ID including service, username, and statistics (followers, following, posts).',
        inputSchema: {
            type: 'object',
            properties: {
                profile_id: {
                    type: 'string',
                    description: 'Buffer profile ID to retrieve',
                },
            },
            required: ['profile_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_configurations',
        description: 'Get Buffer account configurations including supported services and available plans.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Posts/Updates (6 tools) ─────────────────────────────────────

    {
        name: 'list_pending_updates',
        description: 'List queued/pending posts for a social profile. Returns updates sorted by scheduled time.',
        inputSchema: {
            type: 'object',
            properties: {
                profile_id: {
                    type: 'string',
                    description: 'Buffer profile ID to list pending updates for',
                },
                page: {
                    type: 'number',
                    description: 'Page number for pagination (default 1)',
                },
                count: {
                    type: 'number',
                    description: 'Number of updates per page (default 10, max 100)',
                },
            },
            required: ['profile_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_sent_updates',
        description: 'List sent/published posts for a social profile ordered by sent time descending.',
        inputSchema: {
            type: 'object',
            properties: {
                profile_id: {
                    type: 'string',
                    description: 'Buffer profile ID to list sent updates for',
                },
                page: {
                    type: 'number',
                    description: 'Page number for pagination (default 1)',
                },
                count: {
                    type: 'number',
                    description: 'Number of updates per page (default 10, max 100)',
                },
            },
            required: ['profile_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_update',
        description: 'Get a specific update by ID including text, media, profile_ids, scheduled_at, and status.',
        inputSchema: {
            type: 'object',
            properties: {
                update_id: {
                    type: 'string',
                    description: 'Buffer update ID to retrieve',
                },
            },
            required: ['update_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_update',
        description: 'Create a scheduled post for one or more social profiles. Optionally set scheduled_at (Unix timestamp) or let Buffer auto-schedule. Supports link shortening and media attachments.',
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'Post text content (required)',
                },
                profile_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of Buffer profile IDs to post to (required, at least one)',
                },
                scheduled_at: {
                    type: 'number',
                    description: 'Unix timestamp to schedule the post (optional — omit to use next available queue slot)',
                },
                shorten: {
                    type: 'boolean',
                    description: 'Whether to shorten links in the post (default: true)',
                },
                media: {
                    type: 'object',
                    description: 'Optional media attachment with link, photo, and/or thumbnail URLs',
                    properties: {
                        link: { type: 'string', description: 'URL to link in the media attachment' },
                        photo: { type: 'string', description: 'URL of photo to attach' },
                        thumbnail: { type: 'string', description: 'Thumbnail image URL for the link' },
                    },
                },
            },
            required: ['text', 'profile_ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_update',
        description: 'Edit a queued (pending) update. Update the text and/or scheduled time.',
        inputSchema: {
            type: 'object',
            properties: {
                update_id: {
                    type: 'string',
                    description: 'Buffer update ID to edit',
                },
                text: {
                    type: 'string',
                    description: 'New post text content',
                },
                scheduled_at: {
                    type: 'number',
                    description: 'New scheduled time as Unix timestamp',
                },
            },
            required: ['update_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_update',
        description: 'Delete a queued update from the Buffer queue by its ID.',
        inputSchema: {
            type: 'object',
            properties: {
                update_id: {
                    type: 'string',
                    description: 'Buffer update ID to delete',
                },
            },
            required: ['update_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 3 — Scheduling (3 tools) ────────────────────────────────────────

    {
        name: 'get_scheduled_times',
        description: 'Get the scheduled posting times/slots configured for a social profile.',
        inputSchema: {
            type: 'object',
            properties: {
                profile_id: {
                    type: 'string',
                    description: 'Buffer profile ID to get schedule for',
                },
            },
            required: ['profile_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_scheduled_times',
        description: 'Set the posting schedule for a social profile. Provide an array of day/time combinations.',
        inputSchema: {
            type: 'object',
            properties: {
                profile_id: {
                    type: 'string',
                    description: 'Buffer profile ID to update schedule for',
                },
                schedules: {
                    type: 'array',
                    description: 'Array of schedule objects, each with days and times arrays',
                    items: {
                        type: 'object',
                        properties: {
                            days: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Days of week, e.g. ["mon", "wed", "fri"]',
                            },
                            times: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Time slots in HH:MM format, e.g. ["09:00", "17:00"]',
                            },
                        },
                    },
                },
            },
            required: ['profile_id', 'schedules'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'move_to_top',
        description: 'Move a queued update to the top of the posting queue so it publishes next.',
        inputSchema: {
            type: 'object',
            properties: {
                update_id: {
                    type: 'string',
                    description: 'Buffer update ID to move to the top of the queue',
                },
            },
            required: ['update_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Analytics (3 tools) ─────────────────────────────────────────

    {
        name: 'get_update_interactions',
        description: 'Get interactions (clicks, retweets, favorites, mentions, reach) for a sent update.',
        inputSchema: {
            type: 'object',
            properties: {
                update_id: {
                    type: 'string',
                    description: 'Buffer sent update ID to get interactions for',
                },
                event: {
                    type: 'string',
                    description: 'Interaction type to filter by: clicks, retweets, favorites, mentions, or reach (default: clicks)',
                    enum: ['clicks', 'retweets', 'favorites', 'mentions', 'reach'],
                },
                count: {
                    type: 'number',
                    description: 'Number of interactions to return (default 10)',
                },
            },
            required: ['update_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_link_shares',
        description: 'Get share count for a URL across all social networks tracked by Buffer.',
        inputSchema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'URL to get share counts for',
                },
            },
            required: ['url'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_analytics_summary',
        description: 'Get aggregate analytics summary for a social profile including total clicks, retweets, favorites, and reach over a date range.',
        inputSchema: {
            type: 'object',
            properties: {
                profile_id: {
                    type: 'string',
                    description: 'Buffer profile ID to get analytics for',
                },
                start_date: {
                    type: 'number',
                    description: 'Start of date range as Unix timestamp',
                },
                end_date: {
                    type: 'number',
                    description: 'End of date range as Unix timestamp',
                },
            },
            required: ['profile_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 5 — Queue (2 tools) ──────────────────────────────────────────────

    {
        name: 'reorder_queue',
        description: "Reorder updates in a profile's posting queue by providing the desired order of update IDs.",
        inputSchema: {
            type: 'object',
            properties: {
                profile_id: {
                    type: 'string',
                    description: 'Buffer profile ID whose queue to reorder',
                },
                order: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of update IDs in the desired new order',
                },
            },
            required: ['profile_id', 'order'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'shuffle_queue',
        description: "Randomly shuffle all updates in a profile's posting queue.",
        inputSchema: {
            type: 'object',
            properties: {
                profile_id: {
                    type: 'string',
                    description: 'Buffer profile ID whose queue to shuffle',
                },
                count: {
                    type: 'number',
                    description: 'Number of updates to shuffle (optional — defaults to all)',
                },
            },
            required: ['profile_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        // ── User & Profiles ─────────────────────────────────────────────────────

        case 'get_user': {
            return bufferGet('/user.json', token);
        }

        case 'list_profiles': {
            return bufferGet('/profiles.json', token);
        }

        case 'get_profile': {
            validateRequired(args, ['profile_id']);
            return bufferGet(`/profiles/${args.profile_id}.json`, token);
        }

        case 'get_configurations': {
            return bufferGet('/info/configuration.json', token);
        }

        // ── Posts/Updates ───────────────────────────────────────────────────────

        case 'list_pending_updates': {
            validateRequired(args, ['profile_id']);
            const params = new URLSearchParams();
            if (args.page !== undefined) params.set('page', String(args.page));
            if (args.count !== undefined) params.set('count', String(args.count));
            const qs = params.toString() ? `?${params.toString()}` : '';
            return bufferGet(`/profiles/${args.profile_id}/updates/pending.json${qs}`, token);
        }

        case 'list_sent_updates': {
            validateRequired(args, ['profile_id']);
            const params = new URLSearchParams();
            if (args.page !== undefined) params.set('page', String(args.page));
            if (args.count !== undefined) params.set('count', String(args.count));
            const qs = params.toString() ? `?${params.toString()}` : '';
            return bufferGet(`/profiles/${args.profile_id}/updates/sent.json${qs}`, token);
        }

        case 'get_update': {
            validateRequired(args, ['update_id']);
            return bufferGet(`/updates/${args.update_id}.json`, token);
        }

        case 'create_update': {
            validateRequired(args, ['text', 'profile_ids']);
            const profileIds = args.profile_ids as string[];
            if (!Array.isArray(profileIds) || profileIds.length === 0) {
                throw new Error('profile_ids must be a non-empty array');
            }
            const body: Record<string, unknown> = {
                text: args.text,
                profile_ids: profileIds,
            };
            if (args.scheduled_at !== undefined) body.scheduled_at = args.scheduled_at;
            if (args.shorten !== undefined) body.shorten = args.shorten;
            if (args.media !== undefined) body.media = args.media;
            return bufferPost('/updates/create.json', token, body);
        }

        case 'update_update': {
            validateRequired(args, ['update_id']);
            const body: Record<string, unknown> = {};
            if (args.text !== undefined) body.text = args.text;
            if (args.scheduled_at !== undefined) body.scheduled_at = args.scheduled_at;
            return bufferPost(`/updates/${args.update_id}/update.json`, token, body);
        }

        case 'delete_update': {
            validateRequired(args, ['update_id']);
            return bufferPost(`/updates/${args.update_id}/destroy.json`, token, {});
        }

        // ── Scheduling ──────────────────────────────────────────────────────────

        case 'get_scheduled_times': {
            validateRequired(args, ['profile_id']);
            return bufferGet(`/profiles/${args.profile_id}/schedules.json`, token);
        }

        case 'update_scheduled_times': {
            validateRequired(args, ['profile_id', 'schedules']);
            return bufferPost(`/profiles/${args.profile_id}/schedules/update.json`, token, {
                schedules: args.schedules,
            });
        }

        case 'move_to_top': {
            validateRequired(args, ['update_id']);
            return bufferPost(`/updates/${args.update_id}/move_to_top.json`, token, {});
        }

        // ── Analytics ───────────────────────────────────────────────────────────

        case 'get_update_interactions': {
            validateRequired(args, ['update_id']);
            const event = (args.event as string) || 'clicks';
            const params = new URLSearchParams({ event });
            if (args.count !== undefined) params.set('count', String(args.count));
            return bufferGet(`/updates/${args.update_id}/interactions.json?${params.toString()}`, token);
        }

        case 'get_link_shares': {
            validateRequired(args, ['url']);
            const params = new URLSearchParams({ url: args.url as string });
            return bufferGet(`/links/shares.json?${params.toString()}`, token);
        }

        case 'get_analytics_summary': {
            validateRequired(args, ['profile_id']);
            const params = new URLSearchParams();
            if (args.start_date !== undefined) params.set('start_date', String(args.start_date));
            if (args.end_date !== undefined) params.set('end_date', String(args.end_date));
            const qs = params.toString() ? `?${params.toString()}` : '';
            return bufferGet(`/profiles/${args.profile_id}/analytics/summary.json${qs}`, token);
        }

        // ── Queue ───────────────────────────────────────────────────────────────

        case 'reorder_queue': {
            validateRequired(args, ['profile_id', 'order']);
            const order = args.order as string[];
            if (!Array.isArray(order) || order.length === 0) {
                throw new Error('order must be a non-empty array of update IDs');
            }
            return bufferPost(`/profiles/${args.profile_id}/updates/reorder.json`, token, {
                order,
            });
        }

        case 'shuffle_queue': {
            validateRequired(args, ['profile_id']);
            const body: Record<string, unknown> = {};
            if (args.count !== undefined) body.count = args.count;
            return bufferPost(`/profiles/${args.profile_id}/updates/shuffle.json`, token, body);
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
                JSON.stringify({ status: 'ok', server: 'mcp-buffer', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-buffer', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            // Validate secrets
            const { token } = getSecrets(request);
            if (!token) {
                return rpcErr(id, -32001, 'Missing required secrets: BUFFER_ACCESS_TOKEN (header: X-Mcp-Secret-BUFFER-ACCESS-TOKEN)');
            }

            // _ping — special built-in tool: GET /user.json
            if (toolName === '_ping') {
                try {
                    const data = await bufferGet('/user.json', token) as { id: string; name: string };
                    return rpcOk(id, toolOk({ ok: true, user_id: data.id, user_name: data.name }));
                } catch (err: unknown) {
                    if (err && typeof err === 'object' && 'code' in err) {
                        const e = err as { code: number; message: string };
                        return rpcErr(id, e.code, e.message);
                    }
                    return rpcErr(id, -32603, 'Ping failed');
                }
            }

            try {
                const result = await callTool(toolName, args, token);
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
