/**
 * Microsoft Outlook MCP Worker
 * Deep Outlook email operations via Microsoft Graph API.
 * Separate from mcp-microsoft-graph (which covers broad 365 access).
 * This MCP focuses on advanced email: inbox rules, folders, focused inbox, search, attachments.
 *
 * Secret: MICROSOFT_ACCESS_TOKEN → X-Mcp-Secret-MICROSOFT-ACCESS-TOKEN
 * Scopes: Mail.ReadWrite, Mail.Send, MailboxSettings.ReadWrite
 *
 * Covers: Messages (5), Folders (4), Search (2), Rules (3), Attachments (2), Settings (2) = 18 tools
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';

function rpcOk(id: number | string, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { 'Content-Type': 'application/json' } });
}

function rpcErr(id: number | string | null, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function graphFetch(method: string, path: string, token: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const res = await fetch(`${GRAPH}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (!res.ok) throw new Error(`Graph API error (${res.status}): ${text.slice(0, 500)}`);
    if (!text) return { success: true };
    try { return JSON.parse(text); } catch { return { raw: text }; }
}

const TOOLS = [
    { name: '_ping', description: 'Verify Microsoft Outlook credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    // ── Messages ────────────────────────────────────────────────────────────
    { name: 'list_messages', description: 'List emails with filtering by folder, subject, sender, read status',
        inputSchema: { type: 'object', properties: {
            folder_id: { type: 'string', description: 'Folder ID (default: inbox)' },
            filter: { type: 'string', description: 'OData $filter (e.g. "isRead eq false")' },
            top: { type: 'number', description: 'Number of messages (default 20, max 50)' },
            select: { type: 'string', description: 'Comma-separated fields to return' },
        } }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'get_message', description: 'Get a single email with full body, headers, and attachment metadata',
        inputSchema: { type: 'object', properties: {
            message_id: { type: 'string', description: 'Message ID' },
        }, required: ['message_id'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'send_email', description: 'Send an email with HTML or text body, CC, BCC, and importance',
        inputSchema: { type: 'object', properties: {
            to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
            subject: { type: 'string', description: 'Email subject' },
            body: { type: 'string', description: 'Email body content' },
            body_type: { type: 'string', enum: ['text', 'html'], description: 'Body content type (default: html)' },
            cc: { type: 'array', items: { type: 'string' }, description: 'CC recipients' },
            bcc: { type: 'array', items: { type: 'string' }, description: 'BCC recipients' },
            importance: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Email importance' },
        }, required: ['to', 'subject', 'body'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'reply_to_message', description: 'Reply to an email (reply or reply-all)',
        inputSchema: { type: 'object', properties: {
            message_id: { type: 'string', description: 'Message ID to reply to' },
            comment: { type: 'string', description: 'Reply body text' },
            reply_all: { type: 'boolean', description: 'Reply to all recipients (default: false)' },
        }, required: ['message_id', 'comment'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'move_message', description: 'Move a message to a different folder',
        inputSchema: { type: 'object', properties: {
            message_id: { type: 'string', description: 'Message ID' },
            destination_folder_id: { type: 'string', description: 'Destination folder ID' },
        }, required: ['message_id', 'destination_folder_id'] }, annotations: { readOnlyHint: false, destructiveHint: false } },

    // ── Folders ─────────────────────────────────────────────────────────────
    { name: 'list_folders', description: 'List all mail folders with message counts',
        inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'create_folder', description: 'Create a new mail folder',
        inputSchema: { type: 'object', properties: {
            display_name: { type: 'string', description: 'Folder name' },
            parent_folder_id: { type: 'string', description: 'Parent folder ID (optional — creates at root)' },
        }, required: ['display_name'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'update_folder', description: 'Rename a mail folder',
        inputSchema: { type: 'object', properties: {
            folder_id: { type: 'string', description: 'Folder ID' },
            display_name: { type: 'string', description: 'New folder name' },
        }, required: ['folder_id', 'display_name'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'delete_folder', description: 'Delete a mail folder and all its contents',
        inputSchema: { type: 'object', properties: {
            folder_id: { type: 'string', description: 'Folder ID to delete' },
        }, required: ['folder_id'] }, annotations: { readOnlyHint: false, destructiveHint: true } },

    // ── Search ──────────────────────────────────────────────────────────────
    { name: 'search_messages', description: 'Full-text search across emails by keyword, sender, date range',
        inputSchema: { type: 'object', properties: {
            query: { type: 'string', description: 'Search query (KQL syntax: "from:john subject:meeting")' },
            top: { type: 'number', description: 'Max results (default 25)' },
        }, required: ['query'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'get_focused_inbox', description: 'List messages from the Focused Inbox (not Other)',
        inputSchema: { type: 'object', properties: {
            top: { type: 'number', description: 'Number of messages (default 20)' },
        } }, annotations: { readOnlyHint: true, destructiveHint: false } },

    // ── Inbox Rules ─────────────────────────────────────────────────────────
    { name: 'list_inbox_rules', description: 'List all inbox rules (auto-move, auto-reply, etc.)',
        inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'create_inbox_rule', description: 'Create an inbox rule to auto-move, categorize, or flag messages',
        inputSchema: { type: 'object', properties: {
            display_name: { type: 'string', description: 'Rule name' },
            conditions: { type: 'object', description: 'Rule conditions (e.g. {senderContains: ["newsletter"]})' },
            actions: { type: 'object', description: 'Rule actions (e.g. {moveToFolder: "Archive", markAsRead: true})' },
            is_enabled: { type: 'boolean', description: 'Enable rule (default: true)' },
        }, required: ['display_name', 'conditions', 'actions'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'delete_inbox_rule', description: 'Delete an inbox rule',
        inputSchema: { type: 'object', properties: {
            rule_id: { type: 'string', description: 'Inbox rule ID' },
        }, required: ['rule_id'] }, annotations: { readOnlyHint: false, destructiveHint: true } },

    // ── Attachments ─────────────────────────────────────────────────────────
    { name: 'list_attachments', description: 'List attachments on a message with size and content type',
        inputSchema: { type: 'object', properties: {
            message_id: { type: 'string', description: 'Message ID' },
        }, required: ['message_id'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'get_attachment', description: 'Download an attachment (returns base64 for binary, text for text files)',
        inputSchema: { type: 'object', properties: {
            message_id: { type: 'string', description: 'Message ID' },
            attachment_id: { type: 'string', description: 'Attachment ID' },
        }, required: ['message_id', 'attachment_id'] }, annotations: { readOnlyHint: true, destructiveHint: false } },

    // ── Settings ────────────────────────────────────────────────────────────
    { name: 'get_mailbox_settings', description: 'Get mailbox settings: auto-reply, working hours, locale, time zone',
        inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'update_auto_reply', description: 'Configure out-of-office auto-reply settings',
        inputSchema: { type: 'object', properties: {
            status: { type: 'string', enum: ['disabled', 'alwaysEnabled', 'scheduled'], description: 'Auto-reply status' },
            internal_message: { type: 'string', description: 'Reply message for internal senders' },
            external_message: { type: 'string', description: 'Reply message for external senders' },
            start_date: { type: 'string', description: 'Start date (ISO 8601, for scheduled)' },
            end_date: { type: 'string', description: 'End date (ISO 8601, for scheduled)' },
        }, required: ['status'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
];

// ── Tool Handlers ────────────────────────────────────────────────────────────

function toRecipients(emails: string[]) {
    return emails.map(e => ({ emailAddress: { address: e } }));
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case '_ping':
            return graphFetch('GET', '/me', token);
        case 'list_messages': {
            const folder = (args.folder_id as string) || 'inbox';
            const top = Math.min((args.top as number) || 20, 50);
            let path = `/me/mailFolders/${folder}/messages?$top=${top}&$orderby=receivedDateTime desc`;
            if (args.filter) path += `&$filter=${encodeURIComponent(args.filter as string)}`;
            if (args.select) path += `&$select=${args.select}`;
            return graphFetch('GET', path, token);
        }
        case 'get_message':
            return graphFetch('GET', `/me/messages/${args.message_id}`, token);
        case 'send_email':
            return graphFetch('POST', '/me/sendMail', token, {
                message: {
                    subject: args.subject, body: { contentType: (args.body_type as string) || 'html', content: args.body },
                    toRecipients: toRecipients(args.to as string[]),
                    ...(args.cc ? { ccRecipients: toRecipients(args.cc as string[]) } : {}),
                    ...(args.bcc ? { bccRecipients: toRecipients(args.bcc as string[]) } : {}),
                    ...(args.importance ? { importance: args.importance } : {}),
                },
            });
        case 'reply_to_message': {
            const endpoint = args.reply_all ? 'replyAll' : 'reply';
            return graphFetch('POST', `/me/messages/${args.message_id}/${endpoint}`, token, { comment: args.comment });
        }
        case 'move_message':
            return graphFetch('POST', `/me/messages/${args.message_id}/move`, token, { destinationId: args.destination_folder_id });
        case 'list_folders':
            return graphFetch('GET', '/me/mailFolders?$top=50', token);
        case 'create_folder': {
            const path = args.parent_folder_id ? `/me/mailFolders/${args.parent_folder_id}/childFolders` : '/me/mailFolders';
            return graphFetch('POST', path, token, { displayName: args.display_name });
        }
        case 'update_folder':
            return graphFetch('PATCH', `/me/mailFolders/${args.folder_id}`, token, { displayName: args.display_name });
        case 'delete_folder':
            return graphFetch('DELETE', `/me/mailFolders/${args.folder_id}`, token);
        case 'search_messages': {
            const top = (args.top as number) || 25;
            return graphFetch('GET', `/me/messages?$search="${encodeURIComponent(args.query as string)}"&$top=${top}`, token);
        }
        case 'get_focused_inbox': {
            const top = (args.top as number) || 20;
            return graphFetch('GET', `/me/mailFolders/inbox/messages?$filter=inferenceClassification eq 'focused'&$top=${top}&$orderby=receivedDateTime desc`, token);
        }
        case 'list_inbox_rules':
            return graphFetch('GET', '/me/mailFolders/inbox/messageRules', token);
        case 'create_inbox_rule':
            return graphFetch('POST', '/me/mailFolders/inbox/messageRules', token, {
                displayName: args.display_name, conditions: args.conditions, actions: args.actions,
                isEnabled: args.is_enabled !== false,
            });
        case 'delete_inbox_rule':
            return graphFetch('DELETE', `/me/mailFolders/inbox/messageRules/${args.rule_id}`, token);
        case 'list_attachments':
            return graphFetch('GET', `/me/messages/${args.message_id}/attachments`, token);
        case 'get_attachment':
            return graphFetch('GET', `/me/messages/${args.message_id}/attachments/${args.attachment_id}`, token);
        case 'get_mailbox_settings':
            return graphFetch('GET', '/me/mailboxSettings', token);
        case 'update_auto_reply':
            return graphFetch('PATCH', '/me/mailboxSettings', token, {
                automaticRepliesSetting: {
                    status: args.status,
                    ...(args.internal_message ? { internalReplyMessage: args.internal_message } : {}),
                    ...(args.external_message ? { externalReplyMessage: args.external_message } : {}),
                    ...(args.start_date ? { scheduledStartDateTime: { dateTime: args.start_date, timeZone: 'UTC' } } : {}),
                    ...(args.end_date ? { scheduledEndDateTime: { dateTime: args.end_date, timeZone: 'UTC' } } : {}),
                },
            });
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-outlook', version: '1.0.0', tools: TOOLS.length }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
        try { body = await request.json(); } catch { return rpcErr(null, -32700, 'Parse error'); }
        const { id, method, params } = body;

        if (method === 'initialize') return rpcOk(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mcp-outlook', version: '1.0.0' } });
        if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-MICROSOFT-ACCESS-TOKEN');
            if (!token) return rpcErr(id, -32001, 'Missing MICROSOFT_ACCESS_TOKEN — add your Microsoft access token to workspace secrets');
            try {
                const result = await callTool(params?.name as string, (params?.arguments ?? {}) as Record<string, unknown>, token);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            }
        }
        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
