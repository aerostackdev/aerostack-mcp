/**
 * Calendly MCP Worker
 * Implements MCP protocol over HTTP for Calendly scheduling operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   CALENDLY_API_TOKEN → X-Mcp-Secret-CALENDLY-API-TOKEN (Personal Access Token or OAuth token)
 *
 * Auth format: Bearer {token}
 *
 * Covers: User & Organization (2), Event Types (3), Scheduled Events (5),
 *         Scheduling Links (2), Webhooks (3) = 15 tools total
 */

// ── TypeScript interfaces ─────────────────────────────────────────────────────

interface CalendlyUser {
    uri: string;
    name: string;
    email: string;
    scheduling_url: string;
    timezone: string;
    avatar_url: string | null;
    created_at: string;
    updated_at: string;
    current_organization: string;
}

interface CalendlyOrganization {
    uri: string;
    name: string;
    plan: string;
    stage: string;
    created_at: string;
    updated_at: string;
}

interface CalendlyEventType {
    uri: string;
    name: string;
    active: boolean;
    slug: string;
    scheduling_url: string;
    duration: number;
    kind: string;
    pooling_type: string | null;
    type: string;
    color: string;
    created_at: string;
    updated_at: string;
    description_plain: string | null;
    description_html: string | null;
    profile: {
        type: string;
        name: string;
        owner: string;
    };
    secret: boolean;
    booking_method: string;
    custom_questions: Array<{
        name: string;
        type: string;
        position: number;
        enabled: boolean;
        required: boolean;
        answer_choices: string[];
        include_other: boolean;
    }>;
    deleted_at: string | null;
}

interface CalendlyScheduledEvent {
    uri: string;
    name: string;
    status: string;
    start_time: string;
    end_time: string;
    event_type: string;
    location: {
        type: string;
        location?: string;
        join_url?: string;
    } | null;
    invitees_counter: {
        total: number;
        active: number;
        limit: number;
    };
    created_at: string;
    updated_at: string;
    event_memberships: Array<{
        user: string;
        user_name: string;
        user_email: string;
        user_slug: string;
    }>;
    calendar_event: {
        kind: string;
        external_id: string;
    } | null;
}

interface CalendlyInvitee {
    uri: string;
    email: string;
    name: string;
    status: string;
    timezone: string;
    created_at: string;
    updated_at: string;
    event: string;
    text_reminder_number: string | null;
    rescheduled: boolean;
    old_invitee: string | null;
    new_invitee: string | null;
    cancel_url: string;
    reschedule_url: string;
    questions_and_answers: Array<{
        question: string;
        answer: string;
        position: number;
    }>;
    routing_form_submission: string | null;
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

const BASE_URL = 'https://api.calendly.com';

async function calendlyFetch(
    path: string,
    token: string,
    options: { method?: string; body?: string } = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
    const method = options.method ?? 'GET';

    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: options.body,
    });

    // Handle 204 No Content (DELETE)
    if (res.status === 204) {
        return {};
    }

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`Calendly HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        let detail = '';
        if (typeof data.message === 'string') {
            detail = data.message;
        } else if (Array.isArray(data.details)) {
            detail = (data.details as Array<{ message: string }>).map(d => d.message).join('; ');
        } else if (typeof data.title === 'string') {
            detail = data.title;
        }

        switch (res.status) {
            case 400:
                throw new Error(`Bad request: ${detail || text}`);
            case 401:
                throw new Error(
                    'Authentication failed — verify CALENDLY_API_TOKEN is a valid Personal Access Token or OAuth token',
                );
            case 403:
                throw new Error(
                    'Permission denied — your Calendly account lacks access to this resource',
                );
            case 404:
                throw new Error(
                    `Not found — check the UUID is correct and belongs to your Calendly account`,
                );
            case 409:
                throw new Error(`Conflict: ${detail || text}`);
            case 429:
                throw new Error(
                    `Rate limited — Calendly rate limit exceeded. Please retry after a short delay.`,
                );
            case 500:
                throw new Error('Calendly internal server error — please retry later');
            default:
                throw new Error(`Calendly HTTP ${res.status}: ${detail || text}`);
        }
    }

    return data;
}

// ── URI extraction helpers ────────────────────────────────────────────────────

function extractUuid(uri: string): string {
    const parts = uri.split('/');
    return parts[parts.length - 1];
}

async function getCurrentUserUri(token: string): Promise<string> {
    const data = await calendlyFetch('/users/me', token) as { resource: CalendlyUser };
    return data.resource.uri;
}

async function getOrgUri(token: string): Promise<string> {
    const data = await calendlyFetch('/users/me', token) as { resource: CalendlyUser };
    return data.resource.current_organization;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Calendly credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 1 — User & Organization (2 tools) ───────────────────────────────

    {
        name: 'get_current_user',
        description: 'Get the current authenticated Calendly user\'s profile — name, email, timezone, scheduling URL, and organization URI.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_organization',
        description: 'Get details of the organization the current user belongs to — name, plan, stage, and timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_uuid: {
                    type: 'string',
                    description: 'Organization UUID. If not provided, fetches from the current user\'s organization automatically.',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Event Types (3 tools) ──────────────────────────────────────

    {
        name: 'list_event_types',
        description: 'List all active event types for a user (e.g. "30 Minute Meeting", "60 Minute Consultation"). Returns scheduling URLs, durations, and kind (one-on-one vs group).',
        inputSchema: {
            type: 'object',
            properties: {
                user_uri: {
                    type: 'string',
                    description: 'Full Calendly user URI (e.g. "https://api.calendly.com/users/ABC"). If not provided, fetches for the current authenticated user.',
                },
                count: {
                    type: 'number',
                    description: 'Number of event types to return (default 20, max 100)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_event_type',
        description: 'Get full details of a specific event type by UUID — name, duration, description, custom questions, color, scheduling URL.',
        inputSchema: {
            type: 'object',
            properties: {
                event_type_uuid: {
                    type: 'string',
                    description: 'Event type UUID (the last segment of the event type URI)',
                },
            },
            required: ['event_type_uuid'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_event_type_availability',
        description: 'Get available time slots for a specific event type within a date range. Returns a list of start times when the event type can be booked.',
        inputSchema: {
            type: 'object',
            properties: {
                event_type_uri: {
                    type: 'string',
                    description: 'Full Calendly event type URI (e.g. "https://api.calendly.com/event_types/ABC")',
                },
                start_time: {
                    type: 'string',
                    description: 'Start of the availability window in ISO 8601 format (e.g. "2024-01-15T00:00:00Z")',
                },
                end_time: {
                    type: 'string',
                    description: 'End of the availability window in ISO 8601 format. Must be within 7 days of start_time.',
                },
            },
            required: ['event_type_uri', 'start_time', 'end_time'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Scheduled Events (5 tools) ─────────────────────────────────

    {
        name: 'list_scheduled_events',
        description: 'List scheduled events for a user. Filter by status (active/cancelled), date range, and count. Returns event names, times, locations, and invitee counts.',
        inputSchema: {
            type: 'object',
            properties: {
                user_uri: {
                    type: 'string',
                    description: 'Full Calendly user URI. If not provided, fetches for the current authenticated user.',
                },
                count: {
                    type: 'number',
                    description: 'Number of events to return (default 20, max 100)',
                },
                status: {
                    type: 'string',
                    enum: ['active', 'cancelled'],
                    description: 'Filter by event status. active=upcoming/occurred, cancelled=cancelled by host or invitee (default: active)',
                },
                min_start_time: {
                    type: 'string',
                    description: 'Return events starting on or after this time (ISO 8601, e.g. "2024-01-01T00:00:00Z")',
                },
                max_start_time: {
                    type: 'string',
                    description: 'Return events starting on or before this time (ISO 8601)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_scheduled_event',
        description: 'Get full details of a specific scheduled event by UUID — name, start/end time, location, status, invitee count, and event type.',
        inputSchema: {
            type: 'object',
            properties: {
                event_uuid: {
                    type: 'string',
                    description: 'Scheduled event UUID (the last segment of the event URI)',
                },
            },
            required: ['event_uuid'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_event_invitees',
        description: 'List all invitees for a specific scheduled event. Returns invitee names, emails, status, timezone, and answers to custom questions.',
        inputSchema: {
            type: 'object',
            properties: {
                event_uuid: {
                    type: 'string',
                    description: 'Scheduled event UUID',
                },
                count: {
                    type: 'number',
                    description: 'Number of invitees to return (default 20, max 100)',
                },
            },
            required: ['event_uuid'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'cancel_event',
        description: 'Cancel a scheduled event. Notifies all invitees with the cancellation reason.',
        inputSchema: {
            type: 'object',
            properties: {
                event_uuid: {
                    type: 'string',
                    description: 'Scheduled event UUID to cancel',
                },
                reason: {
                    type: 'string',
                    description: 'Reason for cancellation shown to invitees (default: "Cancelled via MCP")',
                },
            },
            required: ['event_uuid'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_invitee',
        description: 'Get details of a specific invitee by UUID — name, email, status, timezone, Q&A responses, cancel/reschedule URLs.',
        inputSchema: {
            type: 'object',
            properties: {
                invitee_uuid: {
                    type: 'string',
                    description: 'Invitee UUID (the last segment of the invitee URI)',
                },
            },
            required: ['invitee_uuid'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Scheduling Links (2 tools) ─────────────────────────────────

    {
        name: 'create_scheduling_link',
        description: 'Create a single-use or limited-use scheduling link for an event type. Useful for sharing a specific meeting link that expires after a set number of uses.',
        inputSchema: {
            type: 'object',
            properties: {
                event_type_uri: {
                    type: 'string',
                    description: 'Full Calendly event type URI (e.g. "https://api.calendly.com/event_types/ABC")',
                },
                max_event_count: {
                    type: 'number',
                    description: 'Maximum number of events that can be booked via this link (default 1)',
                },
                period_type: {
                    type: 'string',
                    enum: ['unlimited', 'rolling', 'fixed'],
                    description: 'Scheduling period type. unlimited=no expiry, rolling=X days from link creation, fixed=specific date range (default: unlimited)',
                },
            },
            required: ['event_type_uri'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_scheduling_links',
        description: 'List all scheduling links owned by the current user or a specific user.',
        inputSchema: {
            type: 'object',
            properties: {
                user_uri: {
                    type: 'string',
                    description: 'Full Calendly user URI. If not provided, fetches for the current authenticated user.',
                },
                count: {
                    type: 'number',
                    description: 'Number of links to return (default 20, max 100)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 5 — Webhooks (3 tools) ─────────────────────────────────────────

    {
        name: 'list_webhooks',
        description: 'List all webhook subscriptions for the organization. Returns webhook URLs, event types they listen to, and their status.',
        inputSchema: {
            type: 'object',
            properties: {
                org_uri: {
                    type: 'string',
                    description: 'Full Calendly organization URI. If not provided, fetches from the current user\'s organization automatically.',
                },
                count: {
                    type: 'number',
                    description: 'Number of webhooks to return (default 20, max 100)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_webhook',
        description: 'Create a new webhook subscription to receive real-time events (invitee.created, invitee.canceled, etc.) at a specified URL.',
        inputSchema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'HTTPS URL that will receive webhook POST requests',
                },
                events: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of event types to subscribe to. Options: invitee.created, invitee.canceled, invitee_no_show.created, routing_form_submission.created',
                },
                organization: {
                    type: 'string',
                    description: 'Full Calendly organization URI. If not provided, fetches from the current user\'s organization automatically.',
                },
                scope: {
                    type: 'string',
                    enum: ['organization', 'user'],
                    description: 'Scope of the webhook. organization=all events in the org, user=only current user\'s events (default: organization)',
                },
                signing_key: {
                    type: 'string',
                    description: 'Optional secret key for validating webhook signatures via HMAC-SHA256',
                },
            },
            required: ['url', 'events'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_webhook',
        description: 'Delete (unsubscribe) a webhook subscription by UUID.',
        inputSchema: {
            type: 'object',
            properties: {
                webhook_uuid: {
                    type: 'string',
                    description: 'Webhook subscription UUID (the last segment of the webhook URI)',
                },
            },
            required: ['webhook_uuid'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {

        case '_ping': {
            return calendlyFetch('/users/me', token);
        }

        // ── User & Organization ───────────────────────────────────────────────

        case 'get_current_user': {
            const data = await calendlyFetch('/users/me', token) as { resource: CalendlyUser };
            const u = data.resource;
            return {
                uri: u.uri,
                uuid: extractUuid(u.uri),
                name: u.name,
                email: u.email,
                scheduling_url: u.scheduling_url,
                timezone: u.timezone,
                avatar_url: u.avatar_url,
                current_organization: u.current_organization,
                org_uuid: extractUuid(u.current_organization),
                created_at: u.created_at,
                updated_at: u.updated_at,
            };
        }

        case 'get_organization': {
            let orgUuid = args.organization_uuid as string | undefined;
            if (!orgUuid) {
                const orgUri = await getOrgUri(token);
                orgUuid = extractUuid(orgUri);
            }
            const data = await calendlyFetch(`/organizations/${orgUuid}`, token) as { resource: CalendlyOrganization };
            const o = data.resource;
            return {
                uri: o.uri,
                uuid: extractUuid(o.uri),
                name: o.name,
                plan: o.plan,
                stage: o.stage,
                created_at: o.created_at,
                updated_at: o.updated_at,
            };
        }

        // ── Event Types ───────────────────────────────────────────────────────

        case 'list_event_types': {
            const userUri = (args.user_uri as string) || await getCurrentUserUri(token);
            const count = (args.count as number) ?? 20;
            const data = await calendlyFetch(
                `/event_types?user=${encodeURIComponent(userUri)}&active=true&count=${count}`,
                token,
            ) as { collection: CalendlyEventType[] };
            return (data.collection ?? []).map(et => ({
                uri: et.uri,
                uuid: extractUuid(et.uri),
                name: et.name,
                active: et.active,
                slug: et.slug,
                scheduling_url: et.scheduling_url,
                duration: et.duration,
                kind: et.kind,
                type: et.type,
                color: et.color,
                description_plain: et.description_plain,
                created_at: et.created_at,
                updated_at: et.updated_at,
            }));
        }

        case 'get_event_type': {
            validateRequired(args, ['event_type_uuid']);
            const data = await calendlyFetch(
                `/event_types/${args.event_type_uuid as string}`,
                token,
            ) as { resource: CalendlyEventType };
            const et = data.resource;
            return {
                uri: et.uri,
                uuid: extractUuid(et.uri),
                name: et.name,
                active: et.active,
                slug: et.slug,
                scheduling_url: et.scheduling_url,
                duration: et.duration,
                kind: et.kind,
                type: et.type,
                color: et.color,
                description_plain: et.description_plain,
                description_html: et.description_html,
                profile: et.profile,
                secret: et.secret,
                booking_method: et.booking_method,
                custom_questions: et.custom_questions,
                deleted_at: et.deleted_at,
                created_at: et.created_at,
                updated_at: et.updated_at,
            };
        }

        case 'get_event_type_availability': {
            validateRequired(args, ['event_type_uri', 'start_time', 'end_time']);
            const data = await calendlyFetch(
                `/event_type_available_times?event_type=${encodeURIComponent(args.event_type_uri as string)}&start_time=${encodeURIComponent(args.start_time as string)}&end_time=${encodeURIComponent(args.end_time as string)}`,
                token,
            ) as { collection: Array<{ status: string; start_time: string; invitees_remaining: number }> };
            return {
                event_type_uri: args.event_type_uri,
                available_times: (data.collection ?? []).map(slot => ({
                    status: slot.status,
                    start_time: slot.start_time,
                    invitees_remaining: slot.invitees_remaining,
                })),
            };
        }

        // ── Scheduled Events ──────────────────────────────────────────────────

        case 'list_scheduled_events': {
            const userUri = (args.user_uri as string) || await getCurrentUserUri(token);
            const count = (args.count as number) ?? 20;
            const status = (args.status as string) ?? 'active';

            let path = `/scheduled_events?user=${encodeURIComponent(userUri)}&count=${count}&status=${status}`;
            if (args.min_start_time) {
                path += `&min_start_time=${encodeURIComponent(args.min_start_time as string)}`;
            }
            if (args.max_start_time) {
                path += `&max_start_time=${encodeURIComponent(args.max_start_time as string)}`;
            }

            const data = await calendlyFetch(path, token) as { collection: CalendlyScheduledEvent[] };
            return (data.collection ?? []).map(ev => ({
                uri: ev.uri,
                uuid: extractUuid(ev.uri),
                name: ev.name,
                status: ev.status,
                start_time: ev.start_time,
                end_time: ev.end_time,
                event_type: ev.event_type,
                location: ev.location,
                invitees_counter: ev.invitees_counter,
                created_at: ev.created_at,
                updated_at: ev.updated_at,
            }));
        }

        case 'get_scheduled_event': {
            validateRequired(args, ['event_uuid']);
            const data = await calendlyFetch(
                `/scheduled_events/${args.event_uuid as string}`,
                token,
            ) as { resource: CalendlyScheduledEvent };
            const ev = data.resource;
            return {
                uri: ev.uri,
                uuid: extractUuid(ev.uri),
                name: ev.name,
                status: ev.status,
                start_time: ev.start_time,
                end_time: ev.end_time,
                event_type: ev.event_type,
                location: ev.location,
                invitees_counter: ev.invitees_counter,
                event_memberships: ev.event_memberships,
                calendar_event: ev.calendar_event,
                created_at: ev.created_at,
                updated_at: ev.updated_at,
            };
        }

        case 'list_event_invitees': {
            validateRequired(args, ['event_uuid']);
            const count = (args.count as number) ?? 20;
            const data = await calendlyFetch(
                `/scheduled_events/${args.event_uuid as string}/invitees?count=${count}`,
                token,
            ) as { collection: CalendlyInvitee[] };
            return (data.collection ?? []).map(inv => ({
                uri: inv.uri,
                uuid: extractUuid(inv.uri),
                email: inv.email,
                name: inv.name,
                status: inv.status,
                timezone: inv.timezone,
                rescheduled: inv.rescheduled,
                cancel_url: inv.cancel_url,
                reschedule_url: inv.reschedule_url,
                questions_and_answers: inv.questions_and_answers,
                created_at: inv.created_at,
                updated_at: inv.updated_at,
            }));
        }

        case 'cancel_event': {
            validateRequired(args, ['event_uuid']);
            const data = await calendlyFetch(
                `/scheduled_events/${args.event_uuid as string}/cancellation`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({ reason: (args.reason as string) ?? 'Cancelled via MCP' }),
                },
            ) as { resource?: { canceler_type?: string; reason?: string; created_at?: string } };
            return {
                success: true,
                event_uuid: args.event_uuid,
                reason: (args.reason as string) ?? 'Cancelled via MCP',
                cancellation: data.resource ?? {},
            };
        }

        case 'get_invitee': {
            validateRequired(args, ['invitee_uuid']);
            const data = await calendlyFetch(
                `/invitees/${args.invitee_uuid as string}`,
                token,
            ) as { resource: CalendlyInvitee };
            const inv = data.resource;
            return {
                uri: inv.uri,
                uuid: extractUuid(inv.uri),
                email: inv.email,
                name: inv.name,
                status: inv.status,
                timezone: inv.timezone,
                event: inv.event,
                rescheduled: inv.rescheduled,
                old_invitee: inv.old_invitee,
                new_invitee: inv.new_invitee,
                cancel_url: inv.cancel_url,
                reschedule_url: inv.reschedule_url,
                questions_and_answers: inv.questions_and_answers,
                text_reminder_number: inv.text_reminder_number,
                routing_form_submission: inv.routing_form_submission,
                created_at: inv.created_at,
                updated_at: inv.updated_at,
            };
        }

        // ── Scheduling Links ──────────────────────────────────────────────────

        case 'create_scheduling_link': {
            validateRequired(args, ['event_type_uri']);
            const body: Record<string, unknown> = {
                owner: args.event_type_uri,
                owner_type: 'EventType',
                max_event_count: (args.max_event_count as number) ?? 1,
                period_type: (args.period_type as string) ?? 'unlimited',
            };
            const data = await calendlyFetch('/scheduling_links', token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as { resource: { booking_url: string; owner: string; owner_type: string } };
            return {
                booking_url: data.resource.booking_url,
                owner: data.resource.owner,
                owner_type: data.resource.owner_type,
                max_event_count: args.max_event_count ?? 1,
                period_type: args.period_type ?? 'unlimited',
            };
        }

        case 'list_scheduling_links': {
            const userUri = (args.user_uri as string) || await getCurrentUserUri(token);
            const count = (args.count as number) ?? 20;
            const data = await calendlyFetch(
                `/scheduling_links?owner=${encodeURIComponent(userUri)}&owner_type=User&count=${count}`,
                token,
            ) as { collection: Array<{ booking_url: string; owner: string; owner_type: string }> };
            return (data.collection ?? []).map(link => ({
                booking_url: link.booking_url,
                owner: link.owner,
                owner_type: link.owner_type,
            }));
        }

        // ── Webhooks ──────────────────────────────────────────────────────────

        case 'list_webhooks': {
            let orgUri = args.org_uri as string | undefined;
            if (!orgUri) {
                orgUri = await getOrgUri(token);
            }
            const count = (args.count as number) ?? 20;
            const data = await calendlyFetch(
                `/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&scope=organization&count=${count}`,
                token,
            ) as {
                collection: Array<{
                    uri: string;
                    callback_url: string;
                    created_at: string;
                    updated_at: string;
                    retry_started_at: string | null;
                    state: string;
                    events: string[];
                    scope: string;
                    organization: string;
                    user: string | null;
                    creator: string;
                }>
            };
            return (data.collection ?? []).map(wh => ({
                uri: wh.uri,
                uuid: extractUuid(wh.uri),
                callback_url: wh.callback_url,
                state: wh.state,
                events: wh.events,
                scope: wh.scope,
                organization: wh.organization,
                user: wh.user,
                creator: wh.creator,
                created_at: wh.created_at,
                updated_at: wh.updated_at,
            }));
        }

        case 'create_webhook': {
            validateRequired(args, ['url', 'events']);
            let orgUri = args.organization as string | undefined;
            if (!orgUri) {
                orgUri = await getOrgUri(token);
            }
            const webhookBody: Record<string, unknown> = {
                url: args.url,
                events: args.events,
                organization: orgUri,
                scope: (args.scope as string) ?? 'organization',
            };
            if (args.signing_key) {
                webhookBody.signing_key = args.signing_key;
            }
            const data = await calendlyFetch('/webhook_subscriptions', token, {
                method: 'POST',
                body: JSON.stringify(webhookBody),
            }) as {
                resource: {
                    uri: string;
                    callback_url: string;
                    created_at: string;
                    updated_at: string;
                    state: string;
                    events: string[];
                    scope: string;
                    organization: string;
                }
            };
            const wh = data.resource;
            return {
                uri: wh.uri,
                uuid: extractUuid(wh.uri),
                callback_url: wh.callback_url,
                state: wh.state,
                events: wh.events,
                scope: wh.scope,
                organization: wh.organization,
                created_at: wh.created_at,
                updated_at: wh.updated_at,
            };
        }

        case 'delete_webhook': {
            validateRequired(args, ['webhook_uuid']);
            await calendlyFetch(
                `/webhook_subscriptions/${args.webhook_uuid as string}`,
                token,
                { method: 'DELETE' },
            );
            return { success: true, deleted_uuid: args.webhook_uuid };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-calendly', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        // Parse JSON-RPC body
        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error — invalid JSON');
        }

        const { id, method, params } = body;

        // ── Protocol methods ──────────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-calendly', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'notifications/initialized') {
            return rpcOk(id, {});
        }

        if (method !== 'tools/call') {
            return rpcErr(id, -32601, `Method not found: ${method}`);
        }

        // ── tools/call ────────────────────────────────────────────────────────

        // Extract secret from header
        const token = request.headers.get('X-Mcp-Secret-CALENDLY-API-TOKEN');

        if (!token) {
            return rpcErr(
                id,
                -32001,
                'Missing required secret — add CALENDLY_API_TOKEN to workspace secrets',
            );
        }

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        try {
            const result = await callTool(toolName, args, token);
            return rpcOk(id, toolOk(result));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.startsWith('Missing required parameter:')) {
                return rpcErr(id, -32603, msg);
            }
            return rpcErr(id, -32603, msg);
        }
    },
};
