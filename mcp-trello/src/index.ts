/**
 * Trello MCP Worker
 * Implements MCP protocol over HTTP for Trello project management operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   TRELLO_API_KEY  → X-Mcp-Secret-TRELLO-API-KEY  (Trello Power-Up / developer API key)
 *   TRELLO_TOKEN    → X-Mcp-Secret-TRELLO-TOKEN     (OAuth user token granting board access)
 *
 * Auth format: ?key={API_KEY}&token={TOKEN} appended to every request
 *
 * Covers: _ping (1), Boards (5), Lists (4), Cards (7), Checklists & Labels (4) = 21 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const TRELLO_BASE = 'https://api.trello.com/1';

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

function getSecrets(request: Request): { apiKey: string | null; token: string | null } {
    return {
        apiKey: request.headers.get('X-Mcp-Secret-TRELLO-API-KEY'),
        token: request.headers.get('X-Mcp-Secret-TRELLO-TOKEN'),
    };
}

async function trelloFetch(
    path: string,
    apiKey: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const separator = path.includes('?') ? '&' : '?';
    const url = `${TRELLO_BASE}${path}${separator}key=${apiKey}&token=${token}`;

    const res = await fetch(url, {
        ...options,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Trello HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (typeof data === 'string') {
            msg = data;
        } else if (data && typeof data === 'object' && 'message' in data) {
            msg = (data as { message: string }).message;
        }
        throw { code: -32603, message: `Trello API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Boards (5 tools) ────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify Trello credentials by fetching the authenticated member profile. Returns member id, username, and fullName.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_board',
        description: 'Get board details by ID — returns name, description, URL, lists, and labels.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Trello board ID (e.g. 5e9f8f8f8f8f8f8f8f8f8f8f)',
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_boards',
        description: 'List all boards accessible to the authenticated member. Returns id, name, desc, url, and closed status.',
        inputSchema: {
            type: 'object',
            properties: {
                filter: {
                    type: 'string',
                    description: 'Filter boards by status: all, open, closed, members, organization, public, starred (default: open)',
                    enum: ['all', 'open', 'closed', 'members', 'organization', 'public', 'starred'],
                },
            },
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_board',
        description: 'Create a new Trello board. Name is required. Optionally set description and whether to create default lists.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Board name (required)',
                },
                desc: {
                    type: 'string',
                    description: 'Board description',
                },
                defaultLists: {
                    type: 'boolean',
                    description: 'Whether to create default lists (To Do, Doing, Done). Default: true',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_board',
        description: 'Update a board\'s name, description, or closed status.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Trello board ID',
                },
                name: {
                    type: 'string',
                    description: 'New board name',
                },
                desc: {
                    type: 'string',
                    description: 'New board description',
                },
                closed: {
                    type: 'boolean',
                    description: 'Set to true to archive the board, false to unarchive',
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_board_members',
        description: 'Get all members of a board. Returns id, username, fullName, and role for each member.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Trello board ID',
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Lists (4 tools) ─────────────────────────────────────────────

    {
        name: 'get_lists',
        description: 'Get all lists on a board. Returns id, name, pos, and closed status for each list.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Trello board ID',
                },
                filter: {
                    type: 'string',
                    description: 'Filter lists: all, open, closed (default: open)',
                    enum: ['all', 'open', 'closed'],
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_list',
        description: 'Create a new list on a board. Name and board_id are required. Position can be top or bottom.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Trello board ID to add the list to',
                },
                name: {
                    type: 'string',
                    description: 'List name (required)',
                },
                pos: {
                    type: 'string',
                    description: 'Position for the new list: top or bottom (default: bottom)',
                    enum: ['top', 'bottom'],
                },
            },
            required: ['board_id', 'name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_list',
        description: 'Update a list\'s name or archived status.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Trello list ID',
                },
                name: {
                    type: 'string',
                    description: 'New list name',
                },
                closed: {
                    type: 'boolean',
                    description: 'Set to true to archive the list, false to unarchive',
                },
            },
            required: ['list_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'move_list',
        description: 'Move a list to a different board.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Trello list ID to move',
                },
                board_id: {
                    type: 'string',
                    description: 'Target board ID to move the list to',
                },
            },
            required: ['list_id', 'board_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 3 — Cards (7 tools) ─────────────────────────────────────────────

    {
        name: 'get_card',
        description: 'Get full card details — name, description, due date, labels, members, checklists, list, and board.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: {
                    type: 'string',
                    description: 'Trello card ID',
                },
            },
            required: ['card_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_cards',
        description: 'List cards in a list. Filter by status: all, open, or closed (archived).',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Trello list ID',
                },
                filter: {
                    type: 'string',
                    description: 'Card filter: all, open, or closed (default: open)',
                    enum: ['all', 'open', 'closed'],
                },
            },
            required: ['list_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_card',
        description: 'Create a new card in a list. idList is required. Optionally set name, description, due date, labels, and members.',
        inputSchema: {
            type: 'object',
            properties: {
                idList: {
                    type: 'string',
                    description: 'ID of the list to add the card to (required)',
                },
                name: {
                    type: 'string',
                    description: 'Card name/title',
                },
                desc: {
                    type: 'string',
                    description: 'Card description (markdown supported)',
                },
                due: {
                    type: 'string',
                    description: 'Due date in ISO 8601 format (e.g. 2026-06-30T12:00:00Z)',
                },
                idLabels: {
                    type: 'string',
                    description: 'Comma-separated list of label IDs to assign to the card',
                },
                idMembers: {
                    type: 'string',
                    description: 'Comma-separated list of member IDs to assign to the card',
                },
            },
            required: ['idList'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_card',
        description: 'Update card fields: name, description, due date, position, or closed status.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: {
                    type: 'string',
                    description: 'Trello card ID',
                },
                name: {
                    type: 'string',
                    description: 'New card name',
                },
                desc: {
                    type: 'string',
                    description: 'New card description',
                },
                due: {
                    type: 'string',
                    description: 'New due date in ISO 8601 format, or null to remove',
                },
                pos: {
                    type: 'string',
                    description: 'New position: top, bottom, or a positive float',
                },
                closed: {
                    type: 'boolean',
                    description: 'Set to true to archive the card',
                },
            },
            required: ['card_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'move_card',
        description: 'Move a card to a different list, optionally setting its position in the new list.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: {
                    type: 'string',
                    description: 'Trello card ID to move',
                },
                idList: {
                    type: 'string',
                    description: 'Target list ID (required)',
                },
                pos: {
                    type: 'string',
                    description: 'Position in the new list: top, bottom, or a positive float (default: bottom)',
                },
            },
            required: ['card_id', 'idList'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'archive_card',
        description: 'Archive (close) a card. The card is hidden from the board but not permanently deleted.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: {
                    type: 'string',
                    description: 'Trello card ID to archive',
                },
            },
            required: ['card_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_card',
        description: 'Permanently delete a card. This action cannot be undone.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: {
                    type: 'string',
                    description: 'Trello card ID to permanently delete',
                },
            },
            required: ['card_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 4 — Checklists & Labels (4 tools) ───────────────────────────────

    {
        name: 'get_card_checklists',
        description: 'Get all checklists on a card, including their items and completion status.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: {
                    type: 'string',
                    description: 'Trello card ID',
                },
            },
            required: ['card_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_checklist',
        description: 'Create a checklist on a card.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: {
                    type: 'string',
                    description: 'Trello card ID to add the checklist to (required)',
                },
                name: {
                    type: 'string',
                    description: 'Checklist name (required)',
                },
            },
            required: ['card_id', 'name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_checklist_item',
        description: 'Add an item to an existing checklist on a card.',
        inputSchema: {
            type: 'object',
            properties: {
                checklist_id: {
                    type: 'string',
                    description: 'Trello checklist ID to add the item to (required)',
                },
                name: {
                    type: 'string',
                    description: 'Item name/text (required)',
                },
                checked: {
                    type: 'boolean',
                    description: 'Whether the item starts as checked (default: false)',
                },
            },
            required: ['checklist_id', 'name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_checklist_item',
        description: 'Mark a checklist item as complete or incomplete.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: {
                    type: 'string',
                    description: 'Trello card ID that contains the checklist item (required)',
                },
                checklist_item_id: {
                    type: 'string',
                    description: 'Trello checklist item ID (required)',
                },
                state: {
                    type: 'string',
                    description: 'New state for the checklist item: complete or incomplete (required)',
                    enum: ['complete', 'incomplete'],
                },
            },
            required: ['card_id', 'checklist_item_id', 'state'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
    token: string,
): Promise<unknown> {
    switch (name) {
        // ── _ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            return trelloFetch('/members/me', apiKey, token);
        }

        // ── Boards ───────────────────────────────────────────────────────────────

        case 'get_board': {
            validateRequired(args, ['board_id']);
            return trelloFetch(`/boards/${args.board_id}?fields=name,desc,url,shortUrl,closed&lists=open&labels=all`, apiKey, token);
        }

        case 'list_boards': {
            const filter = (args.filter as string) || 'open';
            return trelloFetch(`/members/me/boards?filter=${filter}&fields=id,name,desc,url,closed`, apiKey, token);
        }

        case 'create_board': {
            validateRequired(args, ['name']);
            const params = new URLSearchParams({ name: args.name as string });
            if (args.desc !== undefined) params.set('desc', args.desc as string);
            params.set('defaultLists', args.defaultLists !== false ? 'true' : 'false');
            return trelloFetch(`/boards?${params.toString()}`, apiKey, token, { method: 'POST' });
        }

        case 'update_board': {
            validateRequired(args, ['board_id']);
            const params = new URLSearchParams();
            if (args.name !== undefined) params.set('name', args.name as string);
            if (args.desc !== undefined) params.set('desc', args.desc as string);
            if (args.closed !== undefined) params.set('closed', String(args.closed));
            return trelloFetch(`/boards/${args.board_id}?${params.toString()}`, apiKey, token, { method: 'PUT' });
        }

        case 'get_board_members': {
            validateRequired(args, ['board_id']);
            return trelloFetch(`/boards/${args.board_id}/members`, apiKey, token);
        }

        // ── Lists ────────────────────────────────────────────────────────────────

        case 'get_lists': {
            validateRequired(args, ['board_id']);
            const filter = (args.filter as string) || 'open';
            return trelloFetch(`/boards/${args.board_id}/lists?filter=${filter}`, apiKey, token);
        }

        case 'create_list': {
            validateRequired(args, ['board_id', 'name']);
            const params = new URLSearchParams({
                name: args.name as string,
                idBoard: args.board_id as string,
                pos: (args.pos as string) || 'bottom',
            });
            return trelloFetch(`/lists?${params.toString()}`, apiKey, token, { method: 'POST' });
        }

        case 'update_list': {
            validateRequired(args, ['list_id']);
            const params = new URLSearchParams();
            if (args.name !== undefined) params.set('name', args.name as string);
            if (args.closed !== undefined) params.set('closed', String(args.closed));
            return trelloFetch(`/lists/${args.list_id}?${params.toString()}`, apiKey, token, { method: 'PUT' });
        }

        case 'move_list': {
            validateRequired(args, ['list_id', 'board_id']);
            const params = new URLSearchParams({ value: args.board_id as string });
            return trelloFetch(`/lists/${args.list_id}/idBoard?${params.toString()}`, apiKey, token, { method: 'PUT' });
        }

        // ── Cards ────────────────────────────────────────────────────────────────

        case 'get_card': {
            validateRequired(args, ['card_id']);
            return trelloFetch(`/cards/${args.card_id}?fields=all&checklists=all&members=true&labels=true`, apiKey, token);
        }

        case 'list_cards': {
            validateRequired(args, ['list_id']);
            const filter = (args.filter as string) || 'open';
            return trelloFetch(`/lists/${args.list_id}/cards?filter=${filter}`, apiKey, token);
        }

        case 'create_card': {
            validateRequired(args, ['idList']);
            const params = new URLSearchParams({ idList: args.idList as string });
            if (args.name !== undefined) params.set('name', args.name as string);
            if (args.desc !== undefined) params.set('desc', args.desc as string);
            if (args.due !== undefined) params.set('due', args.due as string);
            if (args.idLabels !== undefined) params.set('idLabels', args.idLabels as string);
            if (args.idMembers !== undefined) params.set('idMembers', args.idMembers as string);
            return trelloFetch(`/cards?${params.toString()}`, apiKey, token, { method: 'POST' });
        }

        case 'update_card': {
            validateRequired(args, ['card_id']);
            const params = new URLSearchParams();
            if (args.name !== undefined) params.set('name', args.name as string);
            if (args.desc !== undefined) params.set('desc', args.desc as string);
            if (args.due !== undefined) params.set('due', args.due as string);
            if (args.pos !== undefined) params.set('pos', args.pos as string);
            if (args.closed !== undefined) params.set('closed', String(args.closed));
            return trelloFetch(`/cards/${args.card_id}?${params.toString()}`, apiKey, token, { method: 'PUT' });
        }

        case 'move_card': {
            validateRequired(args, ['card_id', 'idList']);
            const params = new URLSearchParams({ idList: args.idList as string });
            if (args.pos !== undefined) params.set('pos', args.pos as string);
            return trelloFetch(`/cards/${args.card_id}?${params.toString()}`, apiKey, token, { method: 'PUT' });
        }

        case 'archive_card': {
            validateRequired(args, ['card_id']);
            return trelloFetch(`/cards/${args.card_id}?closed=true`, apiKey, token, { method: 'PUT' });
        }

        case 'delete_card': {
            validateRequired(args, ['card_id']);
            return trelloFetch(`/cards/${args.card_id}`, apiKey, token, { method: 'DELETE' });
        }

        // ── Checklists & Labels ──────────────────────────────────────────────────

        case 'get_card_checklists': {
            validateRequired(args, ['card_id']);
            return trelloFetch(`/cards/${args.card_id}/checklists`, apiKey, token);
        }

        case 'create_checklist': {
            validateRequired(args, ['card_id', 'name']);
            const params = new URLSearchParams({
                idCard: args.card_id as string,
                name: args.name as string,
            });
            return trelloFetch(`/checklists?${params.toString()}`, apiKey, token, { method: 'POST' });
        }

        case 'create_checklist_item': {
            validateRequired(args, ['checklist_id', 'name']);
            const params = new URLSearchParams({ name: args.name as string });
            if (args.checked !== undefined) params.set('checked', String(args.checked));
            return trelloFetch(`/checklists/${args.checklist_id}/checkItems?${params.toString()}`, apiKey, token, { method: 'POST' });
        }

        case 'update_checklist_item': {
            validateRequired(args, ['card_id', 'checklist_item_id', 'state']);
            const params = new URLSearchParams({ state: args.state as string });
            return trelloFetch(`/cards/${args.card_id}/checkItem/${args.checklist_item_id}?${params.toString()}`, apiKey, token, { method: 'PUT' });
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
                JSON.stringify({ status: 'ok', server: 'mcp-trello', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-trello', version: '1.0.0' },
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
            const { apiKey, token } = getSecrets(request);
            if (!apiKey || !token) {
                const missing = [];
                if (!apiKey) missing.push('TRELLO_API_KEY (header: X-Mcp-Secret-TRELLO-API-KEY)');
                if (!token) missing.push('TRELLO_TOKEN (header: X-Mcp-Secret-TRELLO-TOKEN)');
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                const result = await callTool(toolName, args, apiKey, token);
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
