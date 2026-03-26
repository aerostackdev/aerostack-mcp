/**
 * Microsoft Graph MCP Worker
 * Implements MCP protocol over HTTP for Microsoft 365 operations via Microsoft Graph API.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: MICROSOFT_ACCESS_TOKEN → header: X-Mcp-Secret-MICROSOFT-ACCESS-TOKEN
 *
 * Covers: Teams messaging, Outlook email, Calendar, and OneDrive.
 */

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

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
    // ── Teams ────────────────────────────────────────────────────────────────
    {
        name: 'list_teams',
        description: 'List all Microsoft Teams the authenticated user has joined',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_team_channels',
        description: 'List all channels in a Microsoft Teams team',
        inputSchema: {
            type: 'object',
            properties: {
                team_id: { type: 'string', description: 'The Microsoft Teams team ID' },
            },
            required: ['team_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'send_teams_message',
        description: 'Send a message to a Microsoft Teams channel',
        inputSchema: {
            type: 'object',
            properties: {
                team_id: { type: 'string', description: 'The Microsoft Teams team ID' },
                channel_id: { type: 'string', description: 'The channel ID within the team' },
                content: { type: 'string', description: 'Message content to send' },
                content_type: {
                    type: 'string',
                    enum: ['text', 'html'],
                    description: 'Content type of the message body (default: text)',
                },
            },
            required: ['team_id', 'channel_id', 'content'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_team_messages',
        description: 'List recent messages from a Microsoft Teams channel',
        inputSchema: {
            type: 'object',
            properties: {
                team_id: { type: 'string', description: 'The Microsoft Teams team ID' },
                channel_id: { type: 'string', description: 'The channel ID within the team' },
                limit: { type: 'number', description: 'Number of messages to return (default: 20)' },
            },
            required: ['team_id', 'channel_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Outlook Email ────────────────────────────────────────────────────────
    {
        name: 'send_email',
        description: 'Send an email via Outlook / Microsoft 365',
        inputSchema: {
            type: 'object',
            properties: {
                to: { type: 'string', description: 'Recipient email addresses, comma-separated' },
                subject: { type: 'string', description: 'Email subject line' },
                body: { type: 'string', description: 'Email body content' },
                body_type: {
                    type: 'string',
                    enum: ['text', 'html'],
                    description: 'Content type of the email body (default: text)',
                },
                cc: { type: 'string', description: 'CC email addresses, comma-separated (optional)' },
            },
            required: ['to', 'subject', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_emails',
        description: 'List emails from an Outlook mailbox folder',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of emails to return (default: 20)' },
                folder: {
                    type: 'string',
                    enum: ['inbox', 'sent', 'drafts'],
                    description: 'Mailbox folder to list from (default: inbox)',
                },
                search: { type: 'string', description: 'Optional keyword to search emails (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_email',
        description: 'Get a specific email by ID including its full body',
        inputSchema: {
            type: 'object',
            properties: {
                message_id: { type: 'string', description: 'The Outlook message ID' },
            },
            required: ['message_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'reply_to_email',
        description: 'Reply to an Outlook email message',
        inputSchema: {
            type: 'object',
            properties: {
                message_id: { type: 'string', description: 'The Outlook message ID to reply to' },
                comment: { type: 'string', description: 'Reply message content' },
            },
            required: ['message_id', 'comment'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Calendar ─────────────────────────────────────────────────────────────
    {
        name: 'list_calendar_events',
        description: 'List calendar events from the user\'s Outlook calendar',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of events to return (default: 20)' },
                start_date: { type: 'string', description: 'Filter events starting from this ISO 8601 datetime (optional)' },
                end_date: { type: 'string', description: 'Filter events ending before this ISO 8601 datetime (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_calendar_event',
        description: 'Create a new event in the user\'s Outlook calendar',
        inputSchema: {
            type: 'object',
            properties: {
                subject: { type: 'string', description: 'Event title/subject' },
                start: { type: 'string', description: 'Event start time as ISO 8601 datetime (e.g. 2025-06-01T10:00:00)' },
                end: { type: 'string', description: 'Event end time as ISO 8601 datetime (e.g. 2025-06-01T11:00:00)' },
                timezone: { type: 'string', description: 'Timezone for the event (default: UTC)' },
                body: { type: 'string', description: 'Event description/body (optional)' },
                location: { type: 'string', description: 'Event location (optional)' },
                attendees: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of attendee email addresses (optional)',
                },
            },
            required: ['subject', 'start', 'end'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_calendar_event',
        description: 'Update an existing event in the user\'s Outlook calendar',
        inputSchema: {
            type: 'object',
            properties: {
                event_id: { type: 'string', description: 'The calendar event ID to update' },
                subject: { type: 'string', description: 'New event title/subject (optional)' },
                start: { type: 'string', description: 'New event start time as ISO 8601 datetime (optional)' },
                end: { type: 'string', description: 'New event end time as ISO 8601 datetime (optional)' },
                body: { type: 'string', description: 'New event description/body (optional)' },
                location: { type: 'string', description: 'New event location (optional)' },
            },
            required: ['event_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_calendar_event',
        description: 'Delete a calendar event from the user\'s Outlook calendar',
        inputSchema: {
            type: 'object',
            properties: {
                event_id: { type: 'string', description: 'The calendar event ID to delete' },
            },
            required: ['event_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── OneDrive ─────────────────────────────────────────────────────────────
    {
        name: 'list_drive_files',
        description: 'List files and folders in OneDrive (root or a specific folder)',
        inputSchema: {
            type: 'object',
            properties: {
                folder_id: {
                    type: 'string',
                    description: 'OneDrive folder item ID to list children of (optional — defaults to root)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_drive_files',
        description: 'Search for files and folders in OneDrive by keyword',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query keyword' },
                limit: { type: 'number', description: 'Number of results to return (default: 20)' },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Microsoft Graph API helper ─────────────────────────────────────────────────

async function graph(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Promise<unknown> {
    const opts: RequestInit = {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'AerostackMCP/1.0 (https://aerostack.dev)',
        },
    };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${GRAPH_API}${path}`, opts);

    // 204 No Content — success with no body
    if (res.status === 204) return { success: true };

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`Graph HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        const errObj = data.error as Record<string, unknown> | undefined;
        const errCode = errObj?.code as string | undefined;
        const errMsg = errObj?.message as string | undefined;

        if (res.status === 401) throw new Error('Invalid or expired access token — check MICROSOFT_ACCESS_TOKEN in your workspace secrets');
        if (res.status === 403) throw new Error(`Missing Microsoft 365 permission — ${errMsg ?? 'the access token lacks the required scope for this action'}`);
        if (res.status === 404) throw new Error(`Not found — check the resource ID (Graph error: ${errCode ?? 'unknown'})`);
        if (res.status === 429) {
            const retryAfter = res.headers.get('Retry-After');
            throw new Error(`Rate limited by Microsoft Graph — retry after ${retryAfter ?? '?'}s`);
        }
        if (errCode === 'InvalidAuthenticationToken') throw new Error('Invalid access token — re-authenticate via Azure AD OAuth2');
        if (errCode === 'AuthenticationError') throw new Error('Authentication failed — verify your Microsoft access token');
        throw new Error(`Microsoft Graph API error ${res.status} (${errCode ?? 'unknown'}): ${errMsg ?? text}`);
    }

    return data;
}

// ── Tool implementations ───────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {

        // ── Teams ───────────────────────────────────────────────────────────

        case 'list_teams': {
            const data = await graph('GET', '/me/joinedTeams', token) as any;
            const teams = data.value ?? [];
            return teams.map((t: any) => ({
                id: t.id,
                displayName: t.displayName,
                description: t.description ?? null,
                webUrl: t.webUrl ?? null,
            }));
        }

        case 'list_team_channels': {
            const data = await graph('GET', `/teams/${args.team_id}/channels`, token) as any;
            const channels = data.value ?? [];
            return channels.map((c: any) => ({
                id: c.id,
                displayName: c.displayName,
                description: c.description ?? null,
                membershipType: c.membershipType ?? null,
                webUrl: c.webUrl ?? null,
            }));
        }

        case 'send_teams_message': {
            const contentType = String(args.content_type ?? 'text');
            const body = {
                body: {
                    contentType,
                    content: String(args.content),
                },
            };
            const data = await graph(
                'POST',
                `/teams/${args.team_id}/channels/${args.channel_id}/messages`,
                token,
                body,
            ) as any;
            return {
                id: data.id,
                createdDateTime: data.createdDateTime,
                webUrl: data.webUrl ?? null,
            };
        }

        case 'list_team_messages': {
            const limit = Number(args.limit ?? 20);
            const data = await graph(
                'GET',
                `/teams/${args.team_id}/channels/${args.channel_id}/messages?$top=${limit}`,
                token,
            ) as any;
            const messages = data.value ?? [];
            return messages.map((m: any) => ({
                id: m.id,
                body: m.body ?? null,
                from: m.from ?? null,
                createdDateTime: m.createdDateTime,
            }));
        }

        // ── Outlook Email ───────────────────────────────────────────────────

        case 'send_email': {
            const toAddresses = String(args.to).split(',').map((a: string) => ({
                emailAddress: { address: a.trim() },
            }));
            const bodyType = String(args.body_type ?? 'text');
            const message: Record<string, unknown> = {
                subject: args.subject,
                body: { contentType: bodyType, content: args.body },
                toRecipients: toAddresses,
            };
            if (args.cc) {
                message.ccRecipients = String(args.cc).split(',').map((a: string) => ({
                    emailAddress: { address: a.trim() },
                }));
            }
            await graph('POST', '/me/sendMail', token, { message });
            return { success: true, to: args.to, subject: args.subject };
        }

        case 'list_emails': {
            const limit = Number(args.limit ?? 20);
            const folderMap: Record<string, string> = {
                inbox: 'Inbox',
                sent: 'SentItems',
                drafts: 'Drafts',
            };
            const folder = folderMap[String(args.folder ?? 'inbox')] ?? 'Inbox';

            const params = new URLSearchParams({ $top: String(limit) });
            if (args.search) {
                params.set('$search', `"${args.search}"`);
            }

            const data = await graph(
                'GET',
                `/me/mailFolders/${folder}/messages?${params}`,
                token,
            ) as any;
            const messages = data.value ?? [];
            return messages.map((m: any) => ({
                id: m.id,
                subject: m.subject,
                from: m.from?.emailAddress ?? null,
                receivedDateTime: m.receivedDateTime,
                isRead: m.isRead,
                bodyPreview: m.bodyPreview ?? null,
            }));
        }

        case 'get_email': {
            const data = await graph('GET', `/me/messages/${args.message_id}`, token) as any;
            return {
                id: data.id,
                subject: data.subject,
                from: data.from?.emailAddress ?? null,
                toRecipients: data.toRecipients?.map((r: any) => r.emailAddress) ?? [],
                receivedDateTime: data.receivedDateTime,
                isRead: data.isRead,
                body: data.body ?? null,
                bodyPreview: data.bodyPreview ?? null,
            };
        }

        case 'reply_to_email': {
            await graph(
                'POST',
                `/me/messages/${args.message_id}/reply`,
                token,
                { comment: args.comment },
            );
            return { success: true, replied_to_message_id: args.message_id };
        }

        // ── Calendar ────────────────────────────────────────────────────────

        case 'list_calendar_events': {
            const limit = Number(args.limit ?? 20);
            const params = new URLSearchParams({ $top: String(limit) });

            if (args.start_date && args.end_date) {
                params.set(
                    '$filter',
                    `start/dateTime ge '${args.start_date}' and end/dateTime le '${args.end_date}'`,
                );
                params.set('$orderby', 'start/dateTime');
            }

            const data = await graph('GET', `/me/events?${params}`, token) as any;
            const events = data.value ?? [];
            return events.map((e: any) => ({
                id: e.id,
                subject: e.subject,
                start: e.start ?? null,
                end: e.end ?? null,
                location: e.location?.displayName ?? null,
                organizer: e.organizer?.emailAddress ?? null,
                isAllDay: e.isAllDay ?? false,
            }));
        }

        case 'create_calendar_event': {
            const timezone = String(args.timezone ?? 'UTC');
            const body: Record<string, unknown> = {
                subject: args.subject,
                start: { dateTime: args.start, timeZone: timezone },
                end: { dateTime: args.end, timeZone: timezone },
            };
            if (args.body) {
                body.body = { contentType: 'text', content: args.body };
            }
            if (args.location) {
                body.location = { displayName: args.location };
            }
            if (Array.isArray(args.attendees) && args.attendees.length > 0) {
                body.attendees = (args.attendees as string[]).map((email: string) => ({
                    emailAddress: { address: email },
                    type: 'required',
                }));
            }
            const data = await graph('POST', '/me/events', token, body) as any;
            return {
                id: data.id,
                subject: data.subject,
                start: data.start,
                end: data.end,
                webLink: data.webLink ?? null,
            };
        }

        case 'update_calendar_event': {
            const body: Record<string, unknown> = {};
            if (args.subject !== undefined) body.subject = args.subject;
            if (args.start !== undefined) body.start = { dateTime: args.start, timeZone: 'UTC' };
            if (args.end !== undefined) body.end = { dateTime: args.end, timeZone: 'UTC' };
            if (args.body !== undefined) body.body = { contentType: 'text', content: args.body };
            if (args.location !== undefined) body.location = { displayName: args.location };
            const data = await graph('PATCH', `/me/events/${args.event_id}`, token, body) as any;
            return {
                id: data.id,
                subject: data.subject,
                start: data.start,
                end: data.end,
            };
        }

        case 'delete_calendar_event': {
            await graph('DELETE', `/me/events/${args.event_id}`, token);
            return { success: true, deleted_event_id: args.event_id };
        }

        // ── OneDrive ─────────────────────────────────────────────────────────

        case 'list_drive_files': {
            const path = args.folder_id
                ? `/me/drive/items/${args.folder_id}/children`
                : '/me/drive/root/children';
            const data = await graph('GET', path, token) as any;
            const items = data.value ?? [];
            return items.map((item: any) => ({
                id: item.id,
                name: item.name,
                size: item.size ?? null,
                lastModifiedDateTime: item.lastModifiedDateTime,
                webUrl: item.webUrl ?? null,
                type: item.file ? 'file' : item.folder ? 'folder' : 'unknown',
            }));
        }

        case 'search_drive_files': {
            const limit = Number(args.limit ?? 20);
            const query = encodeURIComponent(String(args.query));
            const data = await graph(
                'GET',
                `/me/drive/search(q='${query}')?$top=${limit}`,
                token,
            ) as any;
            const items = data.value ?? [];
            return items.map((item: any) => ({
                id: item.id,
                name: item.name,
                size: item.size ?? null,
                lastModifiedDateTime: item.lastModifiedDateTime,
                webUrl: item.webUrl ?? null,
                type: item.file ? 'file' : item.folder ? 'folder' : 'unknown',
            }));
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker entry ───────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-microsoft-graph', version: '1.0.0', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
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
                serverInfo: { name: 'mcp-microsoft-graph', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-MICROSOFT-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing MICROSOFT_ACCESS_TOKEN — add your Microsoft access token to workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
