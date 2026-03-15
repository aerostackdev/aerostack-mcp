/**
 * Gmail MCP Worker
 * Implements MCP protocol over HTTP for Gmail operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   GMAIL_ACCESS_TOKEN → X-Mcp-Secret-GMAIL-ACCESS-TOKEN (OAuth 2.0 access token)
 *
 * Auth format: Bearer {access_token}
 * — Requires gmail.send and gmail.readonly OAuth scopes.
 *
 * Covers: Reading (5), Sending (4), Labels (4), Management (4), Profile & Settings (3) = 20 tools total
 */

// ── TypeScript interfaces ─────────────────────────────────────────────────────

interface GmailMessageHeader {
    name: string;
    value: string;
}

interface GmailMessagePart {
    partId?: string;
    mimeType?: string;
    filename?: string;
    headers?: GmailMessageHeader[];
    body?: { attachmentId?: string; size?: number; data?: string };
    parts?: GmailMessagePart[];
}

interface GmailMessage {
    id: string;
    threadId: string;
    labelIds?: string[];
    snippet?: string;
    payload?: GmailMessagePart;
    sizeEstimate?: number;
    internalDate?: string;
    historyId?: string;
}

interface GmailThread {
    id: string;
    snippet?: string;
    historyId?: string;
    messages?: GmailMessage[];
}

interface GmailLabel {
    id: string;
    name: string;
    messageListVisibility?: string;
    labelListVisibility?: string;
    type?: string;
    messagesTotal?: number;
    messagesUnread?: number;
    threadsTotal?: number;
    threadsUnread?: number;
}

interface GmailDraft {
    id: string;
    message?: GmailMessage;
}

interface GmailProfile {
    emailAddress: string;
    messagesTotal?: number;
    threadsTotal?: number;
    historyId?: string;
}

interface GmailAttachment {
    attachmentId?: string;
    size?: number;
    data?: string;
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

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1';

async function gmailFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${GMAIL_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });

    // 204 No Content (DELETE)
    if (res.status === 204) return {};

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`Gmail HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        const err = data.error as { message?: string; status?: string; code?: number } | undefined;
        const detail = err?.message ?? text;
        const status = err?.status ?? '';

        switch (res.status) {
            case 401:
                throw new Error(
                    'Authentication failed — your GMAIL_ACCESS_TOKEN is invalid or expired. Refresh the OAuth token and try again.',
                );
            case 403:
                throw new Error(
                    `Permission denied — ensure the token has the required Gmail scopes (gmail.readonly, gmail.send). Detail: ${detail}`,
                );
            case 404:
                throw new Error(`Not found — the resource does not exist or you lack access. Detail: ${detail}`);
            case 429:
                throw new Error('Rate limited — Gmail API quota exceeded. Try again in a moment.');
            case 400:
                throw new Error(`Bad request: ${detail}`);
            default:
                throw new Error(`Gmail HTTP ${res.status} ${status}: ${detail}`);
        }
    }

    return data;
}

// ── RFC 2822 helpers ──────────────────────────────────────────────────────────

function buildRfc2822(args: Record<string, unknown>): string {
    const to = Array.isArray(args.to) ? (args.to as string[]).join(', ') : args.to as string;
    const lines = [
        `To: ${to}`,
        `Subject: ${args.subject as string}`,
    ];
    if (args.cc) lines.push(`Cc: ${Array.isArray(args.cc) ? (args.cc as string[]).join(', ') : args.cc as string}`);
    if (args.bcc) lines.push(`Bcc: ${Array.isArray(args.bcc) ? (args.bcc as string[]).join(', ') : args.bcc as string}`);
    if (args.in_reply_to) lines.push(`In-Reply-To: ${args.in_reply_to as string}`);
    if (args.references) lines.push(`References: ${args.references as string}`);

    if (args.html_body) {
        lines.push('MIME-Version: 1.0');
        lines.push('Content-Type: text/html; charset=utf-8');
        lines.push('');
        lines.push(args.html_body as string);
    } else {
        lines.push('MIME-Version: 1.0');
        lines.push('Content-Type: text/plain; charset=utf-8');
        lines.push('');
        lines.push((args.body as string) ?? '');
    }

    return lines.join('\r\n');
}

function base64urlEncode(str: string): string {
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getHeader(headers: GmailMessageHeader[] | undefined, name: string): string {
    return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Reading Messages (5 tools) ─────────────────────────────────

    {
        name: 'list_messages',
        description: 'List Gmail messages matching an optional query using Gmail search syntax. Returns message IDs and thread IDs. Use search_messages for a more descriptive search-focused tool.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Gmail search query (e.g. "is:unread", "from:boss@example.com", "subject:invoice", "after:2024/01/01"). Omit for all messages.',
                },
                max: {
                    type: 'number',
                    description: 'Maximum number of messages to return (default 20, max 500)',
                },
                pageToken: {
                    type: 'string',
                    description: 'Page token from a previous list response to fetch the next page',
                },
            },
        },
    },
    {
        name: 'get_message',
        description: 'Get a specific Gmail message by ID. Returns full message details including headers, body, and labels. Use format=metadata for just headers.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Gmail message ID (from list_messages or search_messages)',
                },
                format: {
                    type: 'string',
                    enum: ['full', 'metadata', 'minimal'],
                    description: 'Response format: full=complete message, metadata=headers only, minimal=IDs+labels only. Default: full',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'search_messages',
        description: 'Search Gmail messages using Gmail search syntax. Supports complex queries like "from:alice is:unread subject:invoice after:2024/01/01 has:attachment". Returns message list with snippets.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Gmail search query. Examples: "is:unread from:boss@example.com", "subject:invoice has:attachment", "after:2024/01/01 before:2024/02/01", "label:INBOX is:important"',
                },
                max: {
                    type: 'number',
                    description: 'Maximum number of messages to return (default 20)',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'list_threads',
        description: 'List Gmail conversation threads matching an optional query. Threads group related messages together. Use query with Gmail search syntax.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Gmail search query to filter threads (e.g. "is:unread", "from:boss@example.com"). Omit for all threads.',
                },
                max: {
                    type: 'number',
                    description: 'Maximum number of threads to return (default 20)',
                },
            },
        },
    },
    {
        name: 'get_thread',
        description: 'Get a full conversation thread by thread ID, including all messages in the thread. Returns all messages with their snippets and IDs.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Gmail thread ID (from list_threads or list_messages)',
                },
                format: {
                    type: 'string',
                    enum: ['full', 'metadata', 'minimal'],
                    description: 'Response format for each message: full=complete, metadata=headers only, minimal=IDs+labels. Default: full',
                },
            },
            required: ['id'],
        },
    },

    // ── Group 2 — Sending (4 tools) ───────────────────────────────────────────

    {
        name: 'send_email',
        description: 'Send an email via Gmail. Supports plain text and HTML bodies, CC, BCC. Builds a proper RFC 2822 message and sends it via the Gmail API.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    oneOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                    description: 'Recipient email address(es). Single string or array of addresses.',
                },
                subject: {
                    type: 'string',
                    description: 'Email subject line',
                },
                body: {
                    type: 'string',
                    description: 'Plain text email body. Used when html_body is not provided.',
                },
                html_body: {
                    type: 'string',
                    description: 'HTML email body. When provided, overrides body and sends as text/html.',
                },
                cc: {
                    oneOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                    description: 'CC recipient email address(es)',
                },
                bcc: {
                    oneOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                    description: 'BCC recipient email address(es)',
                },
                thread_id: {
                    type: 'string',
                    description: 'Optional thread ID to add this message to an existing thread',
                },
            },
            required: ['to', 'subject'],
        },
    },
    {
        name: 'reply_to_message',
        description: 'Reply to an existing Gmail message in the same thread. Automatically sets In-Reply-To and References headers and keeps the message in the same thread.',
        inputSchema: {
            type: 'object',
            properties: {
                message_id: {
                    type: 'string',
                    description: 'The Gmail message ID to reply to (NOT the email Message-ID header, but the Gmail API message ID)',
                },
                body: {
                    type: 'string',
                    description: 'Plain text reply body',
                },
                html_body: {
                    type: 'string',
                    description: 'HTML reply body (overrides body)',
                },
                cc: {
                    oneOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                    description: 'CC addresses for the reply',
                },
            },
            required: ['message_id', 'body'],
        },
    },
    {
        name: 'forward_message',
        description: 'Forward a Gmail message to one or more recipients. Fetches the original message and creates a new message with "Fwd:" subject prefix.',
        inputSchema: {
            type: 'object',
            properties: {
                message_id: {
                    type: 'string',
                    description: 'Gmail message ID to forward',
                },
                to: {
                    oneOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                    description: 'Recipient(s) to forward to',
                },
                note: {
                    type: 'string',
                    description: 'Optional text to prepend before the forwarded message body',
                },
            },
            required: ['message_id', 'to'],
        },
    },
    {
        name: 'create_draft',
        description: 'Create a draft email in Gmail without sending it. The draft can be edited and sent later from the Gmail UI or via the send API.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    oneOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                    description: 'Recipient email address(es)',
                },
                subject: {
                    type: 'string',
                    description: 'Draft subject line',
                },
                body: {
                    type: 'string',
                    description: 'Plain text draft body',
                },
                html_body: {
                    type: 'string',
                    description: 'HTML draft body (overrides body)',
                },
                cc: {
                    oneOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                    description: 'CC recipients',
                },
                bcc: {
                    oneOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                    description: 'BCC recipients',
                },
            },
            required: ['to', 'subject'],
        },
    },

    // ── Group 3 — Labels (4 tools) ────────────────────────────────────────────

    {
        name: 'list_labels',
        description: 'List all Gmail labels in the account, including system labels (INBOX, SENT, TRASH, SPAM) and user-created labels.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'get_label',
        description: 'Get details of a specific Gmail label by ID, including message counts and visibility settings.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Label ID (e.g. "INBOX", "SENT", "Label_123456" for custom labels). Use list_labels to find IDs.',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'create_label',
        description: 'Create a new Gmail label for organizing messages.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Label name. Use "/" for nested labels (e.g. "Work/Invoices")',
                },
                messageListVisibility: {
                    type: 'string',
                    enum: ['show', 'hide'],
                    description: 'Whether messages with this label show in the message list. Default: show',
                },
                labelListVisibility: {
                    type: 'string',
                    enum: ['labelShow', 'labelShowIfUnread', 'labelHide'],
                    description: 'Whether label shows in the label list. Default: labelShow',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'modify_message_labels',
        description: 'Add and/or remove labels from a Gmail message. Use this to label messages, move them between folders, or mark them as read/unread.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Gmail message ID to modify',
                },
                addLabelIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Label IDs to add (e.g. ["STARRED", "Label_123"])',
                },
                removeLabelIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Label IDs to remove (e.g. ["UNREAD", "INBOX"])',
                },
            },
            required: ['id'],
        },
    },

    // ── Group 4 — Management (4 tools) ────────────────────────────────────────

    {
        name: 'trash_message',
        description: 'Move a Gmail message to the Trash. Trashed messages are auto-deleted after 30 days. Use delete_message for immediate permanent deletion.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Gmail message ID to trash',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'delete_message',
        description: 'Permanently delete a Gmail message. This cannot be undone. Use trash_message if you want a recoverable delete.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Gmail message ID to permanently delete',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'mark_as_read',
        description: 'Mark a Gmail message as read by removing the UNREAD label.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Gmail message ID to mark as read',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'mark_as_unread',
        description: 'Mark a Gmail message as unread by adding the UNREAD label.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Gmail message ID to mark as unread',
                },
            },
            required: ['id'],
        },
    },

    // ── Group 5 — Profile & Settings (3 tools) ────────────────────────────────

    {
        name: 'get_profile',
        description: 'Get the Gmail profile for the authenticated user including email address, message count, thread count, and history ID.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'list_drafts',
        description: 'List draft emails in the Gmail drafts folder.',
        inputSchema: {
            type: 'object',
            properties: {
                max: {
                    type: 'number',
                    description: 'Maximum number of drafts to return (default 20)',
                },
            },
        },
    },
    {
        name: 'get_attachment',
        description: 'Download a Gmail message attachment by its attachment ID. Returns the base64url-encoded attachment data.',
        inputSchema: {
            type: 'object',
            properties: {
                message_id: {
                    type: 'string',
                    description: 'Gmail message ID that contains the attachment',
                },
                attachment_id: {
                    type: 'string',
                    description: 'Attachment ID (from the message payload parts)',
                },
            },
            required: ['message_id', 'attachment_id'],
        },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {

        // ── Reading Messages ───────────────────────────────────────────────────

        case 'list_messages': {
            const max = (args.max as number) ?? 20;
            let path = `/users/me/messages?maxResults=${max}`;
            if (args.query) path += `&q=${encodeURIComponent(args.query as string)}`;
            if (args.pageToken) path += `&pageToken=${encodeURIComponent(args.pageToken as string)}`;
            const data = await gmailFetch(path, token) as {
                messages?: Array<{ id: string; threadId: string }>;
                nextPageToken?: string;
                resultSizeEstimate?: number;
            };
            return {
                messages: data.messages ?? [],
                nextPageToken: data.nextPageToken,
                resultSizeEstimate: data.resultSizeEstimate ?? 0,
            };
        }

        case 'get_message': {
            validateRequired(args, ['id']);
            const format = (args.format as string) ?? 'full';
            const data = await gmailFetch(
                `/users/me/messages/${args.id as string}?format=${format}`,
                token,
            ) as GmailMessage;
            return {
                id: data.id,
                threadId: data.threadId,
                labelIds: data.labelIds ?? [],
                snippet: data.snippet ?? '',
                from: getHeader(data.payload?.headers, 'From'),
                to: getHeader(data.payload?.headers, 'To'),
                subject: getHeader(data.payload?.headers, 'Subject'),
                date: getHeader(data.payload?.headers, 'Date'),
                sizeEstimate: data.sizeEstimate,
                internalDate: data.internalDate,
            };
        }

        case 'search_messages': {
            validateRequired(args, ['query']);
            const max = (args.max as number) ?? 20;
            const path = `/users/me/messages?maxResults=${max}&q=${encodeURIComponent(args.query as string)}`;
            const data = await gmailFetch(path, token) as {
                messages?: Array<{ id: string; threadId: string }>;
                nextPageToken?: string;
                resultSizeEstimate?: number;
            };
            return {
                query: args.query,
                messages: data.messages ?? [],
                nextPageToken: data.nextPageToken,
                resultSizeEstimate: data.resultSizeEstimate ?? 0,
            };
        }

        case 'list_threads': {
            const max = (args.max as number) ?? 20;
            let path = `/users/me/threads?maxResults=${max}`;
            if (args.query) path += `&q=${encodeURIComponent(args.query as string)}`;
            const data = await gmailFetch(path, token) as {
                threads?: Array<{ id: string; snippet: string; historyId: string }>;
                nextPageToken?: string;
                resultSizeEstimate?: number;
            };
            return {
                threads: data.threads ?? [],
                nextPageToken: data.nextPageToken,
                resultSizeEstimate: data.resultSizeEstimate ?? 0,
            };
        }

        case 'get_thread': {
            validateRequired(args, ['id']);
            const format = (args.format as string) ?? 'full';
            const data = await gmailFetch(
                `/users/me/threads/${args.id as string}?format=${format}`,
                token,
            ) as GmailThread;
            return {
                id: data.id,
                snippet: data.snippet ?? '',
                historyId: data.historyId,
                messageCount: data.messages?.length ?? 0,
                messages: (data.messages ?? []).map(m => ({
                    id: m.id,
                    threadId: m.threadId,
                    labelIds: m.labelIds ?? [],
                    snippet: m.snippet ?? '',
                    from: getHeader(m.payload?.headers, 'From'),
                    subject: getHeader(m.payload?.headers, 'Subject'),
                    date: getHeader(m.payload?.headers, 'Date'),
                })),
            };
        }

        // ── Sending ────────────────────────────────────────────────────────────

        case 'send_email': {
            validateRequired(args, ['to', 'subject']);
            const raw = base64urlEncode(buildRfc2822(args));
            const requestBody: Record<string, unknown> = { raw };
            if (args.thread_id) requestBody.threadId = args.thread_id;
            const data = await gmailFetch('/users/me/messages/send', token, {
                method: 'POST',
                body: JSON.stringify(requestBody),
            }) as GmailMessage;
            return {
                id: data.id,
                threadId: data.threadId,
                labelIds: data.labelIds ?? [],
            };
        }

        case 'reply_to_message': {
            validateRequired(args, ['message_id', 'body']);
            // Fetch original message to get headers
            const original = await gmailFetch(
                `/users/me/messages/${args.message_id as string}?format=metadata`,
                token,
            ) as GmailMessage;
            const headers = original.payload?.headers ?? [];
            const originalFrom = getHeader(headers, 'From');
            const originalSubject = getHeader(headers, 'Subject');
            const originalMsgId = getHeader(headers, 'Message-ID');
            const originalRefs = getHeader(headers, 'References');

            const replyArgs = {
                ...args,
                to: originalFrom,
                subject: originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`,
                in_reply_to: originalMsgId,
                references: originalRefs
                    ? `${originalRefs} ${originalMsgId}`
                    : originalMsgId,
            };

            const raw = base64urlEncode(buildRfc2822(replyArgs));
            const data = await gmailFetch('/users/me/messages/send', token, {
                method: 'POST',
                body: JSON.stringify({ raw, threadId: original.threadId }),
            }) as GmailMessage;
            return {
                id: data.id,
                threadId: data.threadId,
                labelIds: data.labelIds ?? [],
                repliedTo: args.message_id,
            };
        }

        case 'forward_message': {
            validateRequired(args, ['message_id', 'to']);
            // Fetch original message
            const original = await gmailFetch(
                `/users/me/messages/${args.message_id as string}?format=full`,
                token,
            ) as GmailMessage;
            const headers = original.payload?.headers ?? [];
            const originalSubject = getHeader(headers, 'Subject');
            const originalFrom = getHeader(headers, 'From');
            const originalDate = getHeader(headers, 'Date');
            const originalSnippet = original.snippet ?? '';

            const fwdSubject = originalSubject.startsWith('Fwd:')
                ? originalSubject
                : `Fwd: ${originalSubject}`;

            const note = args.note ? `${args.note as string}\r\n\r\n` : '';
            const fwdBody = `${note}---------- Forwarded message ---------\r\nFrom: ${originalFrom}\r\nDate: ${originalDate}\r\nSubject: ${originalSubject}\r\n\r\n${originalSnippet}`;

            const fwdArgs = {
                to: args.to,
                subject: fwdSubject,
                body: fwdBody,
            };

            const raw = base64urlEncode(buildRfc2822(fwdArgs));
            const data = await gmailFetch('/users/me/messages/send', token, {
                method: 'POST',
                body: JSON.stringify({ raw }),
            }) as GmailMessage;
            return {
                id: data.id,
                threadId: data.threadId,
                labelIds: data.labelIds ?? [],
                forwardedFrom: args.message_id,
                subject: fwdSubject,
            };
        }

        case 'create_draft': {
            validateRequired(args, ['to', 'subject']);
            const raw = base64urlEncode(buildRfc2822(args));
            const data = await gmailFetch('/users/me/drafts', token, {
                method: 'POST',
                body: JSON.stringify({ message: { raw } }),
            }) as GmailDraft;
            return {
                draftId: data.id,
                messageId: data.message?.id,
                threadId: data.message?.threadId,
            };
        }

        // ── Labels ─────────────────────────────────────────────────────────────

        case 'list_labels': {
            const data = await gmailFetch('/users/me/labels', token) as { labels?: GmailLabel[] };
            return (data.labels ?? []).map(l => ({
                id: l.id,
                name: l.name,
                type: l.type,
                messageListVisibility: l.messageListVisibility,
                labelListVisibility: l.labelListVisibility,
                messagesTotal: l.messagesTotal,
                messagesUnread: l.messagesUnread,
            }));
        }

        case 'get_label': {
            validateRequired(args, ['id']);
            const data = await gmailFetch(`/users/me/labels/${args.id as string}`, token) as GmailLabel;
            return {
                id: data.id,
                name: data.name,
                type: data.type,
                messageListVisibility: data.messageListVisibility,
                labelListVisibility: data.labelListVisibility,
                messagesTotal: data.messagesTotal,
                messagesUnread: data.messagesUnread,
                threadsTotal: data.threadsTotal,
                threadsUnread: data.threadsUnread,
            };
        }

        case 'create_label': {
            validateRequired(args, ['name']);
            const labelBody: Record<string, unknown> = {
                name: args.name,
                messageListVisibility: (args.messageListVisibility as string) ?? 'show',
                labelListVisibility: (args.labelListVisibility as string) ?? 'labelShow',
            };
            const data = await gmailFetch('/users/me/labels', token, {
                method: 'POST',
                body: JSON.stringify(labelBody),
            }) as GmailLabel;
            return {
                id: data.id,
                name: data.name,
                type: data.type,
                messageListVisibility: data.messageListVisibility,
                labelListVisibility: data.labelListVisibility,
            };
        }

        case 'modify_message_labels': {
            validateRequired(args, ['id']);
            const modifyBody: Record<string, unknown> = {};
            if (args.addLabelIds) modifyBody.addLabelIds = args.addLabelIds;
            if (args.removeLabelIds) modifyBody.removeLabelIds = args.removeLabelIds;
            const data = await gmailFetch(`/users/me/messages/${args.id as string}/modify`, token, {
                method: 'POST',
                body: JSON.stringify(modifyBody),
            }) as GmailMessage;
            return {
                id: data.id,
                threadId: data.threadId,
                labelIds: data.labelIds ?? [],
            };
        }

        // ── Management ─────────────────────────────────────────────────────────

        case 'trash_message': {
            validateRequired(args, ['id']);
            const data = await gmailFetch(`/users/me/messages/${args.id as string}/trash`, token, {
                method: 'POST',
            }) as GmailMessage;
            return {
                id: data.id,
                threadId: data.threadId,
                labelIds: data.labelIds ?? [],
                trashed: true,
            };
        }

        case 'delete_message': {
            validateRequired(args, ['id']);
            await gmailFetch(`/users/me/messages/${args.id as string}`, token, {
                method: 'DELETE',
            });
            return {
                id: args.id,
                deleted: true,
                note: 'Message permanently deleted — this cannot be undone',
            };
        }

        case 'mark_as_read': {
            validateRequired(args, ['id']);
            const data = await gmailFetch(`/users/me/messages/${args.id as string}/modify`, token, {
                method: 'POST',
                body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
            }) as GmailMessage;
            return {
                id: data.id,
                threadId: data.threadId,
                labelIds: data.labelIds ?? [],
                read: true,
            };
        }

        case 'mark_as_unread': {
            validateRequired(args, ['id']);
            const data = await gmailFetch(`/users/me/messages/${args.id as string}/modify`, token, {
                method: 'POST',
                body: JSON.stringify({ addLabelIds: ['UNREAD'] }),
            }) as GmailMessage;
            return {
                id: data.id,
                threadId: data.threadId,
                labelIds: data.labelIds ?? [],
                unread: true,
            };
        }

        // ── Profile & Settings ─────────────────────────────────────────────────

        case 'get_profile': {
            const data = await gmailFetch('/users/me/profile', token) as GmailProfile;
            return {
                emailAddress: data.emailAddress,
                messagesTotal: data.messagesTotal,
                threadsTotal: data.threadsTotal,
                historyId: data.historyId,
            };
        }

        case 'list_drafts': {
            const max = (args.max as number) ?? 20;
            const data = await gmailFetch(`/users/me/drafts?maxResults=${max}`, token) as {
                drafts?: Array<{ id: string; message?: { id: string; threadId: string } }>;
                nextPageToken?: string;
                resultSizeEstimate?: number;
            };
            return {
                drafts: (data.drafts ?? []).map(d => ({
                    id: d.id,
                    messageId: d.message?.id,
                    threadId: d.message?.threadId,
                })),
                nextPageToken: data.nextPageToken,
                resultSizeEstimate: data.resultSizeEstimate ?? 0,
            };
        }

        case 'get_attachment': {
            validateRequired(args, ['message_id', 'attachment_id']);
            const data = await gmailFetch(
                `/users/me/messages/${args.message_id as string}/attachments/${args.attachment_id as string}`,
                token,
            ) as GmailAttachment;
            return {
                attachmentId: args.attachment_id,
                size: data.size,
                data: data.data,
            };
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
                JSON.stringify({ status: 'ok', server: 'mcp-gmail', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-gmail', version: '1.0.0' },
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
        const token = request.headers.get('X-Mcp-Secret-GMAIL-ACCESS-TOKEN');

        if (!token) {
            return rpcErr(
                id,
                -32001,
                'Missing required secret — add GMAIL_ACCESS_TOKEN to workspace secrets (OAuth 2.0 access token with gmail.readonly and gmail.send scopes)',
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
