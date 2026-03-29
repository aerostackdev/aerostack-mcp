/**
 * Miro MCP Worker
 * Implements MCP protocol over HTTP for Miro visual collaboration operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   MIRO_ACCESS_TOKEN  → X-Mcp-Secret-MIRO-ACCESS-TOKEN  (OAuth Bearer token)
 *
 * Auth format: Authorization: Bearer {ACCESS_TOKEN}
 * Rate limit: 100,000 credits/min (most calls cost 100-500 credits)
 * Pagination: cursor-based (limit + cursor params; response has cursor field)
 *
 * Covers: Boards (5), Items (7), Frames & Connectors (4),
 *         Members (3), Org & Auth (3) = 22 tools total + _ping
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const MIRO_BASE = 'https://api.miro.com/v2';

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
        token: request.headers.get('X-Mcp-Secret-MIRO-ACCESS-TOKEN'),
    };
}

async function miroFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${MIRO_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
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
        throw { code: -32603, message: `Miro HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'message' in data) {
            msg = (data as { message: string }).message || msg;
        } else if (data && typeof data === 'object' && 'status' in data && 'message' in data) {
            msg = (data as { message: string }).message || msg;
        }
        throw { code: -32603, message: `Miro API error ${res.status}: ${msg}` };
    }

    return data;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
            parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
        }
    }
    return parts.length ? `?${parts.join('&')}` : '';
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Boards (5 tools) ────────────────────────────────────────────

    {
        name: 'list_boards',
        description: 'List Miro boards accessible to the token. Supports query search, teamId filter, limit (max 50), and cursor-based pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search term to filter boards by name',
                },
                teamId: {
                    type: 'string',
                    description: 'Filter boards by team ID',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of boards to return (default 20, max 50)',
                },
                cursor: {
                    type: 'string',
                    description: 'Pagination cursor from a previous response to get the next page',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_board',
        description: 'Get details of a specific Miro board by ID including name, description, team, viewLink, and timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID (e.g. uXjVOxxxxxxxxx)',
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_board',
        description: 'Create a new Miro board. Name is required. Optionally set description, teamId, and sharing policy.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Board name (required)',
                },
                description: {
                    type: 'string',
                    description: 'Board description',
                },
                teamId: {
                    type: 'string',
                    description: 'Team ID to create the board in',
                },
                sharingPolicy: {
                    type: 'object',
                    description: 'Sharing policy for the board',
                    properties: {
                        access: {
                            type: 'string',
                            enum: ['private', 'view', 'comment', 'edit'],
                            description: 'Board access level (private, view, comment, or edit)',
                        },
                    },
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_board',
        description: 'Update a board\'s name, description, or sharing policy.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                name: {
                    type: 'string',
                    description: 'New board name',
                },
                description: {
                    type: 'string',
                    description: 'New board description',
                },
                sharingPolicy: {
                    type: 'object',
                    description: 'Updated sharing policy',
                    properties: {
                        access: {
                            type: 'string',
                            enum: ['private', 'view', 'comment', 'edit'],
                            description: 'Board access level',
                        },
                    },
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_board',
        description: 'Permanently delete a Miro board. This action cannot be undone.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID to delete',
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 2 — Items (7 tools) ─────────────────────────────────────────────

    {
        name: 'list_items',
        description: 'List all items on a Miro board. Optionally filter by item type. Supports limit and cursor pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                type: {
                    type: 'string',
                    description: 'Filter by item type (e.g. card, sticky_note, text, shape, frame, connector)',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of items to return (default 20, max 50)',
                },
                cursor: {
                    type: 'string',
                    description: 'Pagination cursor from a previous response',
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_card',
        description: 'Create a card item on a Miro board. Cards support a title, description, color styling, and position.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                title: {
                    type: 'string',
                    description: 'Card title text',
                },
                description: {
                    type: 'string',
                    description: 'Card description body text',
                },
                style: {
                    type: 'object',
                    description: 'Card styling',
                    properties: {
                        fillColor: { type: 'string', description: 'Background fill color (hex, e.g. #ff0000)' },
                        textColor: { type: 'string', description: 'Text color (hex)' },
                    },
                },
                position: {
                    type: 'object',
                    description: 'Card position on the board',
                    properties: {
                        x: { type: 'number', description: 'X coordinate' },
                        y: { type: 'number', description: 'Y coordinate' },
                    },
                },
                geometry: {
                    type: 'object',
                    description: 'Card dimensions',
                    properties: {
                        width: { type: 'number', description: 'Width in pixels' },
                        height: { type: 'number', description: 'Height in pixels' },
                    },
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_sticky_note',
        description: 'Create a sticky note on a Miro board. Sticky notes support content, fill color, shape (square or rectangle), and position.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                content: {
                    type: 'string',
                    description: 'Sticky note text content',
                },
                style: {
                    type: 'object',
                    description: 'Sticky note styling',
                    properties: {
                        fillColor: {
                            type: 'string',
                            description: 'Background fill color (hex, e.g. #ffd700 for yellow)',
                        },
                        textColor: { type: 'string', description: 'Text color (hex)' },
                    },
                },
                shape: {
                    type: 'string',
                    enum: ['square', 'rectangle'],
                    description: 'Sticky note shape (square or rectangle)',
                },
                position: {
                    type: 'object',
                    description: 'Position on the board',
                    properties: {
                        x: { type: 'number', description: 'X coordinate' },
                        y: { type: 'number', description: 'Y coordinate' },
                    },
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_text',
        description: 'Create a text item on a Miro board. Supports font size, text alignment, color, and position.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                content: {
                    type: 'string',
                    description: 'Text content (HTML-safe)',
                },
                style: {
                    type: 'object',
                    description: 'Text styling',
                    properties: {
                        fontSize: { type: 'number', description: 'Font size in points (e.g. 14)' },
                        textAlign: {
                            type: 'string',
                            enum: ['left', 'center', 'right'],
                            description: 'Text alignment',
                        },
                        color: { type: 'string', description: 'Text color (hex)' },
                    },
                },
                position: {
                    type: 'object',
                    description: 'Text item position on the board',
                    properties: {
                        x: { type: 'number', description: 'X coordinate' },
                        y: { type: 'number', description: 'Y coordinate' },
                    },
                },
            },
            required: ['board_id', 'content'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_shape',
        description: 'Create a shape item on a Miro board. Supports rectangle, circle, triangle, and other shapes with optional text content and styling.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                shape: {
                    type: 'string',
                    description: 'Shape type (e.g. rectangle, circle, triangle, rhombus, pentagon, hexagon)',
                },
                content: {
                    type: 'string',
                    description: 'Optional text content inside the shape',
                },
                style: {
                    type: 'object',
                    description: 'Shape styling',
                    properties: {
                        fillColor: { type: 'string', description: 'Fill color (hex)' },
                        borderColor: { type: 'string', description: 'Border color (hex)' },
                        borderWidth: { type: 'number', description: 'Border width in pixels' },
                    },
                },
                position: {
                    type: 'object',
                    description: 'Shape position on the board',
                    properties: {
                        x: { type: 'number', description: 'X coordinate' },
                        y: { type: 'number', description: 'Y coordinate' },
                    },
                },
                geometry: {
                    type: 'object',
                    description: 'Shape dimensions',
                    properties: {
                        width: { type: 'number', description: 'Width in pixels' },
                        height: { type: 'number', description: 'Height in pixels' },
                    },
                },
            },
            required: ['board_id', 'shape'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_item',
        description: 'Get a specific item by ID from a Miro board.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                item_id: {
                    type: 'string',
                    description: 'Item ID to retrieve',
                },
            },
            required: ['board_id', 'item_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_item',
        description: 'Update an existing item\'s content, style, or position on a Miro board.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                item_id: {
                    type: 'string',
                    description: 'Item ID to update',
                },
                item_type: {
                    type: 'string',
                    description: 'Item type (e.g. card, sticky_note, text, shape) — required to build the correct API URL',
                },
                data: {
                    type: 'object',
                    description: 'Content fields to update (e.g. title, content, description)',
                },
                style: {
                    type: 'object',
                    description: 'Style fields to update (e.g. fillColor, textColor)',
                },
                position: {
                    type: 'object',
                    description: 'New position (x, y)',
                    properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                    },
                },
            },
            required: ['board_id', 'item_id', 'item_type'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 3 — Frames & Connectors (4 tools) ───────────────────────────────

    {
        name: 'create_frame',
        description: 'Create a frame container on a Miro board to group and organize items. Supports title, fill color, position, and dimensions.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                title: {
                    type: 'string',
                    description: 'Frame title label',
                },
                style: {
                    type: 'object',
                    description: 'Frame styling',
                    properties: {
                        fillColor: { type: 'string', description: 'Frame background fill color (hex)' },
                    },
                },
                position: {
                    type: 'object',
                    description: 'Frame position on the board',
                    properties: {
                        x: { type: 'number', description: 'X coordinate' },
                        y: { type: 'number', description: 'Y coordinate' },
                    },
                },
                geometry: {
                    type: 'object',
                    description: 'Frame dimensions',
                    properties: {
                        width: { type: 'number', description: 'Frame width in pixels' },
                        height: { type: 'number', description: 'Frame height in pixels' },
                    },
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_frames',
        description: 'List all frames on a Miro board.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_connector',
        description: 'Create a connector (line/arrow) between two items on a Miro board.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                startItem: {
                    type: 'object',
                    description: 'Starting item for the connector',
                    properties: {
                        id: { type: 'string', description: 'Item ID for the start point' },
                    },
                    required: ['id'],
                },
                endItem: {
                    type: 'object',
                    description: 'Ending item for the connector',
                    properties: {
                        id: { type: 'string', description: 'Item ID for the end point' },
                    },
                    required: ['id'],
                },
                style: {
                    type: 'object',
                    description: 'Connector styling',
                    properties: {
                        strokeColor: { type: 'string', description: 'Connector stroke color (hex)' },
                        strokeWidth: { type: 'number', description: 'Connector line width' },
                        strokeStyle: {
                            type: 'string',
                            enum: ['normal', 'dashed', 'dotted'],
                            description: 'Line style',
                        },
                    },
                },
            },
            required: ['board_id', 'startItem', 'endItem'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_item',
        description: 'Delete an item from a Miro board by its item ID. This permanently removes the item.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                item_id: {
                    type: 'string',
                    description: 'Item ID to delete',
                },
            },
            required: ['board_id', 'item_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 4 — Members (3 tools) ───────────────────────────────────────────

    {
        name: 'list_board_members',
        description: 'List all members of a Miro board with their roles. Supports limit and cursor pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of members to return (default 20)',
                },
                cursor: {
                    type: 'string',
                    description: 'Pagination cursor from a previous response',
                },
            },
            required: ['board_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_board_member',
        description: 'Get details of a specific member on a Miro board including their role and user information.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                member_id: {
                    type: 'string',
                    description: 'Member ID to retrieve',
                },
            },
            required: ['board_id', 'member_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'invite_board_member',
        description: 'Invite one or more users to a Miro board by email address with a specified role.',
        inputSchema: {
            type: 'object',
            properties: {
                board_id: {
                    type: 'string',
                    description: 'Miro board ID',
                },
                emails: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of email addresses to invite',
                },
                role: {
                    type: 'string',
                    enum: ['viewer', 'commenter', 'editor'],
                    description: 'Role to assign to the invited members (viewer, commenter, or editor)',
                },
            },
            required: ['board_id', 'emails', 'role'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 5 — Org & Auth (3 tools) ───────────────────────────────────────

    {
        name: 'list_teams',
        description: 'List all teams accessible to the current token within the organisation.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_team',
        description: 'Get details of a specific team by ID including name, description, and member count.',
        inputSchema: {
            type: 'object',
            properties: {
                team_id: {
                    type: 'string',
                    description: 'Miro team ID',
                },
            },
            required: ['team_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_token_context',
        description: 'Get information about the current access token: authenticated user ID, granted scopes, and team context.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Ping ──────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Check connectivity and authentication by listing boards. Returns confirmation that the token is valid.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Item type → API path map ──────────────────────────────────────────────────

function itemTypePath(itemType: string): string {
    const map: Record<string, string> = {
        card: 'cards',
        sticky_note: 'sticky_notes',
        text: 'texts',
        shape: 'shapes',
        frame: 'frames',
        connector: 'connectors',
        image: 'images',
        document: 'documents',
        embed: 'embeds',
        preview: 'previews',
        mindmap_node: 'mindmap_nodes',
    };
    return map[itemType] ?? 'items';
}

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        // ── Boards ──────────────────────────────────────────────────────────────

        case 'list_boards': {
            const params: Record<string, string | number | undefined> = {
                limit: Math.min((args.limit as number) || 20, 50),
            };
            if (args.query) params.query = args.query as string;
            if (args.teamId) params.team_id = args.teamId as string;
            if (args.cursor) params.cursor = args.cursor as string;
            return miroFetch(`/boards${buildQuery(params)}`, token);
        }

        case 'get_board': {
            validateRequired(args, ['board_id']);
            return miroFetch(`/boards/${args.board_id}`, token);
        }

        case 'create_board': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.description !== undefined) body.description = args.description;
            if (args.teamId !== undefined) body.teamId = args.teamId;
            if (args.sharingPolicy !== undefined) body.sharingPolicy = args.sharingPolicy;
            return miroFetch('/boards', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_board': {
            validateRequired(args, ['board_id']);
            const { board_id, ...rest } = args;
            const body: Record<string, unknown> = {};
            if (rest.name !== undefined) body.name = rest.name;
            if (rest.description !== undefined) body.description = rest.description;
            if (rest.sharingPolicy !== undefined) body.sharingPolicy = rest.sharingPolicy;
            return miroFetch(`/boards/${board_id}`, token, {
                method: 'PATCH',
                body: JSON.stringify(body),
            });
        }

        case 'delete_board': {
            validateRequired(args, ['board_id']);
            return miroFetch(`/boards/${args.board_id}`, token, { method: 'DELETE' });
        }

        // ── Items ───────────────────────────────────────────────────────────────

        case 'list_items': {
            validateRequired(args, ['board_id']);
            const params: Record<string, string | number | undefined> = {
                limit: Math.min((args.limit as number) || 20, 50),
            };
            if (args.type) params.type = args.type as string;
            if (args.cursor) params.cursor = args.cursor as string;
            return miroFetch(`/boards/${args.board_id}/items${buildQuery(params)}`, token);
        }

        case 'create_card': {
            validateRequired(args, ['board_id']);
            const body: Record<string, unknown> = {};
            const data: Record<string, unknown> = {};
            if (args.title !== undefined) data.title = args.title;
            if (args.description !== undefined) data.description = args.description;
            if (Object.keys(data).length) body.data = data;
            if (args.style !== undefined) body.style = args.style;
            if (args.position !== undefined) body.position = args.position;
            if (args.geometry !== undefined) body.geometry = args.geometry;
            return miroFetch(`/boards/${args.board_id}/cards`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'create_sticky_note': {
            validateRequired(args, ['board_id']);
            const body: Record<string, unknown> = {};
            const data: Record<string, unknown> = {};
            if (args.content !== undefined) data.content = args.content;
            if (args.shape !== undefined) data.shape = args.shape;
            if (Object.keys(data).length) body.data = data;
            if (args.style !== undefined) body.style = args.style;
            if (args.position !== undefined) body.position = args.position;
            return miroFetch(`/boards/${args.board_id}/sticky_notes`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'create_text': {
            validateRequired(args, ['board_id', 'content']);
            const body: Record<string, unknown> = {
                data: { content: args.content },
            };
            if (args.style !== undefined) body.style = args.style;
            if (args.position !== undefined) body.position = args.position;
            return miroFetch(`/boards/${args.board_id}/texts`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'create_shape': {
            validateRequired(args, ['board_id', 'shape']);
            const body: Record<string, unknown> = {
                data: { shape: args.shape },
            };
            const shapeData = body.data as Record<string, unknown>;
            if (args.content !== undefined) shapeData.content = args.content;
            if (args.style !== undefined) body.style = args.style;
            if (args.position !== undefined) body.position = args.position;
            if (args.geometry !== undefined) body.geometry = args.geometry;
            return miroFetch(`/boards/${args.board_id}/shapes`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_item': {
            validateRequired(args, ['board_id', 'item_id']);
            return miroFetch(`/boards/${args.board_id}/items/${args.item_id}`, token);
        }

        case 'update_item': {
            validateRequired(args, ['board_id', 'item_id', 'item_type']);
            const { board_id, item_id, item_type, ...rest } = args;
            const pathSegment = itemTypePath(item_type as string);
            const body: Record<string, unknown> = {};
            if (rest.data !== undefined) body.data = rest.data;
            if (rest.style !== undefined) body.style = rest.style;
            if (rest.position !== undefined) body.position = rest.position;
            return miroFetch(`/boards/${board_id}/${pathSegment}/${item_id}`, token, {
                method: 'PATCH',
                body: JSON.stringify(body),
            });
        }

        // ── Frames & Connectors ─────────────────────────────────────────────────

        case 'create_frame': {
            validateRequired(args, ['board_id']);
            const body: Record<string, unknown> = {
                data: { type: 'freeform' },
            };
            const frameData = body.data as Record<string, unknown>;
            if (args.title !== undefined) frameData.title = args.title;
            if (args.style !== undefined) body.style = args.style;
            if (args.position !== undefined) body.position = args.position;
            if (args.geometry !== undefined) body.geometry = args.geometry;
            return miroFetch(`/boards/${args.board_id}/frames`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_frames': {
            validateRequired(args, ['board_id']);
            return miroFetch(`/boards/${args.board_id}/frames`, token);
        }

        case 'create_connector': {
            validateRequired(args, ['board_id', 'startItem', 'endItem']);
            const body: Record<string, unknown> = {
                startItem: args.startItem,
                endItem: args.endItem,
            };
            if (args.style !== undefined) body.style = args.style;
            return miroFetch(`/boards/${args.board_id}/connectors`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'delete_item': {
            validateRequired(args, ['board_id', 'item_id']);
            return miroFetch(`/boards/${args.board_id}/items/${args.item_id}`, token, {
                method: 'DELETE',
            });
        }

        // ── Members ─────────────────────────────────────────────────────────────

        case 'list_board_members': {
            validateRequired(args, ['board_id']);
            const params: Record<string, string | number | undefined> = {
                limit: (args.limit as number) || 20,
            };
            if (args.cursor) params.cursor = args.cursor as string;
            return miroFetch(`/boards/${args.board_id}/members${buildQuery(params)}`, token);
        }

        case 'get_board_member': {
            validateRequired(args, ['board_id', 'member_id']);
            return miroFetch(`/boards/${args.board_id}/members/${args.member_id}`, token);
        }

        case 'invite_board_member': {
            validateRequired(args, ['board_id', 'emails', 'role']);
            const emails = args.emails as string[];
            const body = {
                emails,
                role: args.role,
            };
            return miroFetch(`/boards/${args.board_id}/members`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        // ── Org & Auth ──────────────────────────────────────────────────────────

        case 'list_teams': {
            return miroFetch('/teams', token);
        }

        case 'get_team': {
            validateRequired(args, ['team_id']);
            return miroFetch(`/teams/${args.team_id}`, token);
        }

        case 'get_token_context': {
            return miroFetch('/oauth-token', token);
        }

        // ── Ping ─────────────────────────────────────────────────────────────────

        case '_ping': {
            return miroFetch('/boards?limit=1', token);
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
                JSON.stringify({ status: 'ok', server: 'mcp-miro', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-miro', version: '1.0.0' },
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
                return rpcErr(id, -32001, 'Missing required secret: MIRO_ACCESS_TOKEN (header: X-Mcp-Secret-MIRO-ACCESS-TOKEN)');
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
