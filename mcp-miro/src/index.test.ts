import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'test_miro_access_token_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockBoard = {
    id: 'uXjVOaabbcc=',
    name: 'Product Roadmap Q1',
    description: 'Planning board for Q1 initiatives',
    viewLink: 'https://miro.com/app/board/uXjVOaabbcc=/',
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-03-01T00:00:00Z',
    type: 'board',
};

const mockBoard2 = {
    id: 'uXjVOddeexx=',
    name: 'Design Sprint',
    description: 'Design sprint board',
    viewLink: 'https://miro.com/app/board/uXjVOddeexx=/',
    createdAt: '2026-02-01T00:00:00Z',
    modifiedAt: '2026-03-15T00:00:00Z',
    type: 'board',
};

const mockCard = {
    id: 'item_card_001',
    type: 'card',
    data: { title: 'Launch Feature X', description: 'Details about feature X' },
    style: { fillColor: '#ffffff', textColor: '#000000' },
    position: { x: 100, y: 200, origin: 'center' },
    geometry: { width: 200, height: 60 },
};

const mockStickyNote = {
    id: 'item_sticky_001',
    type: 'sticky_note',
    data: { content: 'Retrospective note', shape: 'square' },
    style: { fillColor: '#ffd700', textColor: '#000000' },
    position: { x: 300, y: 400, origin: 'center' },
};

const mockTextItem = {
    id: 'item_text_001',
    type: 'text',
    data: { content: 'Sprint Goal' },
    style: { fontSize: 24, textAlign: 'center', color: '#000000' },
    position: { x: 0, y: 0, origin: 'center' },
};

const mockShape = {
    id: 'item_shape_001',
    type: 'shape',
    data: { shape: 'rectangle', content: 'Process Step' },
    style: { fillColor: '#e6f3ff', borderColor: '#0052cc' },
    position: { x: 500, y: 300, origin: 'center' },
    geometry: { width: 150, height: 80 },
};

const mockFrame = {
    id: 'item_frame_001',
    type: 'frame',
    data: { title: 'Sprint 1', type: 'freeform' },
    style: { fillColor: '#f5f5f5' },
    position: { x: 0, y: 0, origin: 'center' },
    geometry: { width: 800, height: 600 },
};

const mockConnector = {
    id: 'item_connector_001',
    type: 'connector',
    startItem: { id: 'item_shape_001' },
    endItem: { id: 'item_card_001' },
    style: { strokeColor: '#333333', strokeWidth: 2 },
};

const mockMember = {
    id: 'member_001',
    role: 'editor',
    user: { id: 'user_001', name: 'Jane Smith', email: 'jane@acme.com' },
};

const mockTeam = {
    id: 'team_001',
    name: 'Engineering',
    description: 'Engineering team boards',
};

const mockTokenContext = {
    id: 'token_abc123',
    userId: 'user_001',
    scopes: ['boards:read', 'boards:write', 'identity:read'],
    team: { id: 'team_001', name: 'Engineering' },
};

const mockItemsList = {
    data: [mockCard, mockStickyNote],
    cursor: null,
    total: 2,
    limit: 50,
    offset: 0,
    type: 'list',
};

const mockBoardsList = {
    data: [mockBoard, mockBoard2],
    cursor: null,
    total: 2,
    limit: 20,
    offset: 0,
    type: 'list',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function apiErr(message: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ status, message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('token')) {
        headers['X-Mcp-Secret-MIRO-ACCESS-TOKEN'] = ACCESS_TOKEN;
    }
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingSecrets);
}

async function callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    const req = makeToolReq(toolName, args, missingSecrets);
    const res = await worker.fetch(req);
    return res.json() as Promise<{
        jsonrpc: string;
        id: number;
        result?: { content: [{ type: string; text: string }] };
        error?: { code: number; message: string };
    }>;
}

async function getToolResult(toolName: string, args: Record<string, unknown> = {}) {
    const body = await callTool(toolName, args);
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    return JSON.parse(body.result!.content[0].text);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-miro and tools count', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-miro');
        expect(body.tools).toBe(23); // 22 tools + _ping
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'PUT' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json{{{',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { protocolVersion: string; serverInfo: { name: string } }
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-miro');
    });

    it('tools/list returns 23 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools).toHaveLength(23);
        for (const tool of body.result.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
        }
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq('unknown/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing token returns -32001 with MIRO_ACCESS_TOKEN in message', async () => {
        const body = await callTool('list_boards', {}, ['token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('MIRO_ACCESS_TOKEN');
    });

    it('Authorization header uses Bearer token format', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoardsList));
        await callTool('list_boards', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it('API error surfaces message from response body', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Token expired', 401));
        const body = await callTool('list_boards', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('401');
    });
});

// ── Boards ────────────────────────────────────────────────────────────────────

describe('list_boards', () => {
    it('returns list of boards with data array', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoardsList));
        const result = await getToolResult('list_boards', {});
        expect(result.data).toHaveLength(2);
        expect(result.data[0].id).toBe('uXjVOaabbcc=');
    });

    it('passes query search param', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoardsList));
        await callTool('list_boards', { query: 'roadmap' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('query=roadmap');
    });

    it('passes teamId as team_id param', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoardsList));
        await callTool('list_boards', { teamId: 'team_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('team_id=team_001');
    });

    it('caps limit at 50', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoardsList));
        await callTool('list_boards', { limit: 200 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('limit=50');
    });

    it('passes cursor for pagination', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoardsList));
        await callTool('list_boards', { cursor: 'next_cursor_abc' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('cursor=next_cursor_abc');
    });
});

describe('get_board', () => {
    it('returns board details by id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoard));
        const result = await getToolResult('get_board', { board_id: 'uXjVOaabbcc=' });
        expect(result.id).toBe('uXjVOaabbcc=');
        expect(result.name).toBe('Product Roadmap Q1');
    });

    it('builds correct URL with board_id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoard));
        await callTool('get_board', { board_id: 'uXjVOaabbcc=' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/boards/uXjVOaabbcc=');
    });

    it('missing board_id returns validation error', async () => {
        const body = await callTool('get_board', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('board_id');
    });
});

describe('create_board', () => {
    it('creates board with name', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoard));
        const result = await getToolResult('create_board', { name: 'Product Roadmap Q1' });
        expect(result.name).toBe('Product Roadmap Q1');
    });

    it('sends POST to /boards', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoard));
        await callTool('create_board', { name: 'New Board' });
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/boards');
        expect(options.method).toBe('POST');
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.name).toBe('New Board');
    });

    it('includes description and sharingPolicy when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoard));
        await callTool('create_board', {
            name: 'New Board',
            description: 'A description',
            sharingPolicy: { access: 'view' },
        });
        const options = mockFetch.mock.calls[0][1];
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.description).toBe('A description');
        expect(reqBody.sharingPolicy.access).toBe('view');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_board', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('update_board', () => {
    it('sends PATCH to correct board URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoard));
        await callTool('update_board', { board_id: 'uXjVOaabbcc=', name: 'Updated Name' });
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/boards/uXjVOaabbcc=');
        expect(options.method).toBe('PATCH');
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.name).toBe('Updated Name');
    });

    it('missing board_id returns validation error', async () => {
        const body = await callTool('update_board', { name: 'test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('board_id');
    });
});

describe('delete_board', () => {
    it('sends DELETE to correct board URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await callTool('delete_board', { board_id: 'uXjVOaabbcc=' });
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/boards/uXjVOaabbcc=');
        expect(options.method).toBe('DELETE');
    });

    it('missing board_id returns validation error', async () => {
        const body = await callTool('delete_board', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('board_id');
    });
});

// ── Items ─────────────────────────────────────────────────────────────────────

describe('list_items', () => {
    it('returns items on board', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockItemsList));
        const result = await getToolResult('list_items', { board_id: 'uXjVOaabbcc=' });
        expect(result.data).toHaveLength(2);
        expect(result.data[0].type).toBe('card');
    });

    it('passes type filter in query', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [mockCard], total: 1 }));
        await callTool('list_items', { board_id: 'uXjVOaabbcc=', type: 'card' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('type=card');
    });

    it('caps limit at 50', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockItemsList));
        await callTool('list_items', { board_id: 'uXjVOaabbcc=', limit: 100 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('limit=50');
    });

    it('missing board_id returns validation error', async () => {
        const body = await callTool('list_items', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('board_id');
    });
});

describe('create_card', () => {
    it('creates card with title and description', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCard));
        const result = await getToolResult('create_card', {
            board_id: 'uXjVOaabbcc=',
            title: 'Launch Feature X',
            description: 'Details',
        });
        expect(result.type).toBe('card');
        expect(result.data.title).toBe('Launch Feature X');
    });

    it('sends POST to /boards/{id}/cards', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCard));
        await callTool('create_card', { board_id: 'uXjVOaabbcc=', title: 'Test' });
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/boards/uXjVOaabbcc=/cards');
        expect(options.method).toBe('POST');
    });

    it('includes style and position in request body', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCard));
        await callTool('create_card', {
            board_id: 'uXjVOaabbcc=',
            title: 'Test',
            style: { fillColor: '#ff0000' },
            position: { x: 100, y: 200 },
        });
        const options = mockFetch.mock.calls[0][1];
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.style.fillColor).toBe('#ff0000');
        expect(reqBody.position.x).toBe(100);
    });

    it('missing board_id returns validation error', async () => {
        const body = await callTool('create_card', { title: 'test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('board_id');
    });
});

describe('create_sticky_note', () => {
    it('creates sticky note with content and shape', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockStickyNote));
        const result = await getToolResult('create_sticky_note', {
            board_id: 'uXjVOaabbcc=',
            content: 'Retrospective note',
            shape: 'square',
        });
        expect(result.type).toBe('sticky_note');
    });

    it('sends POST to /boards/{id}/sticky_notes', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockStickyNote));
        await callTool('create_sticky_note', { board_id: 'uXjVOaabbcc=', content: 'Hello' });
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/boards/uXjVOaabbcc=/sticky_notes');
        expect(options.method).toBe('POST');
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.data.content).toBe('Hello');
    });
});

describe('create_text', () => {
    it('creates text item with content', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTextItem));
        const result = await getToolResult('create_text', {
            board_id: 'uXjVOaabbcc=',
            content: 'Sprint Goal',
        });
        expect(result.type).toBe('text');
    });

    it('sends POST to /boards/{id}/texts with content in data', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTextItem));
        await callTool('create_text', { board_id: 'uXjVOaabbcc=', content: 'Hello' });
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/boards/uXjVOaabbcc=/texts');
        expect(options.method).toBe('POST');
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.data.content).toBe('Hello');
    });

    it('missing content returns validation error', async () => {
        const body = await callTool('create_text', { board_id: 'uXjVOaabbcc=' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('content');
    });
});

describe('create_shape', () => {
    it('creates shape with shape type', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockShape));
        const result = await getToolResult('create_shape', {
            board_id: 'uXjVOaabbcc=',
            shape: 'rectangle',
        });
        expect(result.type).toBe('shape');
    });

    it('sends POST to /boards/{id}/shapes with shape in data', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockShape));
        await callTool('create_shape', { board_id: 'uXjVOaabbcc=', shape: 'circle' });
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/boards/uXjVOaabbcc=/shapes');
        expect(options.method).toBe('POST');
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.data.shape).toBe('circle');
    });

    it('includes optional content in shape data', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockShape));
        await callTool('create_shape', { board_id: 'uXjVOaabbcc=', shape: 'rectangle', content: 'Process' });
        const options = mockFetch.mock.calls[0][1];
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.data.content).toBe('Process');
    });

    it('missing shape returns validation error', async () => {
        const body = await callTool('create_shape', { board_id: 'uXjVOaabbcc=' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('shape');
    });
});

describe('get_item', () => {
    it('fetches item by id from board', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCard));
        const result = await getToolResult('get_item', { board_id: 'uXjVOaabbcc=', item_id: 'item_card_001' });
        expect(result.id).toBe('item_card_001');
    });

    it('builds correct URL with item_id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCard));
        await callTool('get_item', { board_id: 'uXjVOaabbcc=', item_id: 'item_card_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/boards/uXjVOaabbcc=/items/item_card_001');
    });

    it('missing item_id returns validation error', async () => {
        const body = await callTool('get_item', { board_id: 'uXjVOaabbcc=' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('item_id');
    });
});

describe('update_item', () => {
    it('sends PATCH to correct type-specific URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCard));
        await callTool('update_item', {
            board_id: 'uXjVOaabbcc=',
            item_id: 'item_card_001',
            item_type: 'card',
            data: { title: 'Updated Title' },
        });
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/boards/uXjVOaabbcc=/cards/item_card_001');
        expect(options.method).toBe('PATCH');
    });

    it('includes data, style, and position in body', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCard));
        await callTool('update_item', {
            board_id: 'uXjVOaabbcc=',
            item_id: 'item_card_001',
            item_type: 'card',
            data: { title: 'New Title' },
            style: { fillColor: '#ff0000' },
            position: { x: 50, y: 100 },
        });
        const options = mockFetch.mock.calls[0][1];
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.data.title).toBe('New Title');
        expect(reqBody.style.fillColor).toBe('#ff0000');
        expect(reqBody.position.x).toBe(50);
    });

    it('missing item_type returns validation error', async () => {
        const body = await callTool('update_item', {
            board_id: 'uXjVOaabbcc=',
            item_id: 'item_001',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('item_type');
    });
});

// ── Frames & Connectors ───────────────────────────────────────────────────────

describe('create_frame', () => {
    it('creates frame with title', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockFrame));
        const result = await getToolResult('create_frame', {
            board_id: 'uXjVOaabbcc=',
            title: 'Sprint 1',
        });
        expect(result.type).toBe('frame');
    });

    it('sends POST to /boards/{id}/frames with title in data', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockFrame));
        await callTool('create_frame', { board_id: 'uXjVOaabbcc=', title: 'Sprint 1' });
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/boards/uXjVOaabbcc=/frames');
        expect(options.method).toBe('POST');
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.data.title).toBe('Sprint 1');
    });

    it('includes geometry when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockFrame));
        await callTool('create_frame', {
            board_id: 'uXjVOaabbcc=',
            geometry: { width: 1000, height: 800 },
        });
        const options = mockFetch.mock.calls[0][1];
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.geometry.width).toBe(1000);
    });

    it('missing board_id returns validation error', async () => {
        const body = await callTool('create_frame', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('board_id');
    });
});

describe('list_frames', () => {
    it('returns frames from board', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [mockFrame] }));
        const result = await getToolResult('list_frames', { board_id: 'uXjVOaabbcc=' });
        expect(result.data[0].type).toBe('frame');
    });

    it('calls /boards/{id}/frames endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [] }));
        await callTool('list_frames', { board_id: 'uXjVOaabbcc=' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/boards/uXjVOaabbcc=/frames');
    });
});

describe('create_connector', () => {
    it('creates connector between two items', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConnector));
        const result = await getToolResult('create_connector', {
            board_id: 'uXjVOaabbcc=',
            startItem: { id: 'item_shape_001' },
            endItem: { id: 'item_card_001' },
        });
        expect(result.type).toBe('connector');
    });

    it('sends POST to /boards/{id}/connectors with start/end items', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConnector));
        await callTool('create_connector', {
            board_id: 'uXjVOaabbcc=',
            startItem: { id: 'item_a' },
            endItem: { id: 'item_b' },
        });
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/boards/uXjVOaabbcc=/connectors');
        expect(options.method).toBe('POST');
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.startItem.id).toBe('item_a');
        expect(reqBody.endItem.id).toBe('item_b');
    });

    it('missing endItem returns validation error', async () => {
        const body = await callTool('create_connector', {
            board_id: 'uXjVOaabbcc=',
            startItem: { id: 'item_a' },
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('endItem');
    });
});

describe('delete_item', () => {
    it('sends DELETE to /boards/{id}/items/{item_id}', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await callTool('delete_item', { board_id: 'uXjVOaabbcc=', item_id: 'item_card_001' });
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/boards/uXjVOaabbcc=/items/item_card_001');
        expect(options.method).toBe('DELETE');
    });

    it('missing item_id returns validation error', async () => {
        const body = await callTool('delete_item', { board_id: 'uXjVOaabbcc=' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('item_id');
    });
});

// ── Members ───────────────────────────────────────────────────────────────────

describe('list_board_members', () => {
    it('returns board members', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [mockMember] }));
        const result = await getToolResult('list_board_members', { board_id: 'uXjVOaabbcc=' });
        expect(result.data[0].role).toBe('editor');
    });

    it('passes cursor for pagination', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [] }));
        await callTool('list_board_members', { board_id: 'uXjVOaabbcc=', cursor: 'next_page' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('cursor=next_page');
    });

    it('missing board_id returns validation error', async () => {
        const body = await callTool('list_board_members', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('board_id');
    });
});

describe('get_board_member', () => {
    it('fetches specific member by id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMember));
        const result = await getToolResult('get_board_member', {
            board_id: 'uXjVOaabbcc=',
            member_id: 'member_001',
        });
        expect(result.id).toBe('member_001');
        expect(result.role).toBe('editor');
    });

    it('builds correct URL with member_id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMember));
        await callTool('get_board_member', { board_id: 'uXjVOaabbcc=', member_id: 'member_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/boards/uXjVOaabbcc=/members/member_001');
    });

    it('missing member_id returns validation error', async () => {
        const body = await callTool('get_board_member', { board_id: 'uXjVOaabbcc=' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('member_id');
    });
});

describe('invite_board_member', () => {
    it('sends POST with emails array and role', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ status: 200 }));
        await callTool('invite_board_member', {
            board_id: 'uXjVOaabbcc=',
            emails: ['user@example.com'],
            role: 'editor',
        });
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/boards/uXjVOaabbcc=/members');
        expect(options.method).toBe('POST');
        const reqBody = JSON.parse(options.body as string);
        expect(reqBody.emails).toEqual(['user@example.com']);
        expect(reqBody.role).toBe('editor');
    });

    it('missing role returns validation error', async () => {
        const body = await callTool('invite_board_member', {
            board_id: 'uXjVOaabbcc=',
            emails: ['user@example.com'],
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('role');
    });
});

// ── Org & Auth ────────────────────────────────────────────────────────────────

describe('list_teams', () => {
    it('returns list of teams', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockTeam]));
        const result = await getToolResult('list_teams', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].name).toBe('Engineering');
    });

    it('calls /teams endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk([]));
        await callTool('list_teams', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/teams');
    });
});

describe('get_team', () => {
    it('fetches team by id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTeam));
        const result = await getToolResult('get_team', { team_id: 'team_001' });
        expect(result.id).toBe('team_001');
        expect(result.name).toBe('Engineering');
    });

    it('builds correct URL with team_id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTeam));
        await callTool('get_team', { team_id: 'team_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/teams/team_001');
    });

    it('missing team_id returns validation error', async () => {
        const body = await callTool('get_team', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('team_id');
    });
});

describe('get_token_context', () => {
    it('returns token context with scopes', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenContext));
        const result = await getToolResult('get_token_context', {});
        expect(result.userId).toBe('user_001');
        expect(result.scopes).toContain('boards:read');
    });

    it('calls /oauth-token endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenContext));
        await callTool('get_token_context', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/oauth-token');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('calls /boards?limit=1 for ping', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoardsList));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/boards');
        expect(url).toContain('limit=1');
    });

    it('returns board list data on success', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoardsList));
        const result = await getToolResult('_ping', {});
        expect(result.data).toBeDefined();
    });
});

// ── Unknown tool ──────────────────────────────────────────────────────────────

describe('Unknown tool', () => {
    it('returns -32601 for unknown tool name', async () => {
        const body = await callTool('non_existent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
        expect(body.error!.message).toContain('non_existent_tool');
    });
});
