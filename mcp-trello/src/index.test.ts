import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_KEY = 'test_trello_api_key_abc123';
const TOKEN = 'test_trello_token_xyz789';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockMember = {
    id: 'member123',
    username: 'janesmith',
    fullName: 'Jane Smith',
    email: 'jane@example.com',
};

const mockBoard = {
    id: 'board123',
    name: 'My Project Board',
    desc: 'Main project board for Q1',
    url: 'https://trello.com/b/board123',
    shortUrl: 'https://trello.com/b/abc',
    closed: false,
    lists: [],
    labels: [],
};

const mockList = {
    id: 'list123',
    name: 'To Do',
    pos: 65536,
    closed: false,
    idBoard: 'board123',
};

const mockCard = {
    id: 'card123',
    name: 'Fix login bug',
    desc: 'Users cannot log in with SSO',
    due: '2026-06-30T12:00:00.000Z',
    closed: false,
    idList: 'list123',
    idBoard: 'board123',
    labels: [],
    idMembers: [],
    checklists: [],
};

const mockChecklist = {
    id: 'checklist123',
    name: 'Acceptance Criteria',
    idCard: 'card123',
    checkItems: [
        { id: 'item1', name: 'Reproduce the bug', state: 'complete', pos: 16384 },
        { id: 'item2', name: 'Write fix', state: 'incomplete', pos: 32768 },
    ],
};

const mockChecklistItem = {
    id: 'item3',
    name: 'Write tests',
    state: 'incomplete',
    pos: 49152,
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
    return Promise.resolve(new Response(message, {
        status,
        headers: { 'Content-Type': 'text/plain' },
    }));
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('apiKey')) {
        headers['X-Mcp-Secret-TRELLO-API-KEY'] = API_KEY;
    }
    if (!missingSecrets.includes('token')) {
        headers['X-Mcp-Secret-TRELLO-TOKEN'] = TOKEN;
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
    it('GET / returns status ok with server mcp-trello and tools 20', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-trello');
        expect(body.tools).toBe(21);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
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
        expect(body.result.serverInfo.name).toBe('mcp-trello');
    });

    it('tools/list returns exactly 20 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools).toHaveLength(21);
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
    it('missing apiKey returns -32001 with TRELLO_API_KEY in message', async () => {
        const body = await callTool('list_boards', {}, ['apiKey']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('TRELLO_API_KEY');
    });

    it('missing token returns -32001 with TRELLO_TOKEN in message', async () => {
        const body = await callTool('list_boards', {}, ['token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('TRELLO_TOKEN');
    });

    it('missing both secrets returns -32001', async () => {
        const body = await callTool('list_boards', {}, ['apiKey', 'token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('key and token are appended as query params to every request', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockBoard]));
        await callTool('list_boards', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`key=${API_KEY}`);
        expect(url).toContain(`token=${TOKEN}`);
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns member profile with id, username, fullName', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMember));
        const result = await getToolResult('_ping', {});
        expect(result.id).toBe('member123');
        expect(result.username).toBe('janesmith');
        expect(result.fullName).toBe('Jane Smith');
    });

    it('calls GET /members/me', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMember));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/members/me');
    });

    it('returns error on API failure', async () => {
        mockFetch.mockReturnValueOnce(apiErr('invalid token', 401));
        const body = await callTool('_ping', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });
});

// ── Boards ────────────────────────────────────────────────────────────────────

describe('get_board', () => {
    it('returns board details with name, desc, url', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoard));
        const result = await getToolResult('get_board', { board_id: 'board123' });
        expect(result.id).toBe('board123');
        expect(result.name).toBe('My Project Board');
        expect(result.desc).toBe('Main project board for Q1');
    });

    it('calls correct board URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoard));
        await callTool('get_board', { board_id: 'board123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/boards/board123');
    });

    it('missing board_id returns validation error', async () => {
        const body = await callTool('get_board', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('board_id');
    });
});

describe('list_boards', () => {
    it('returns array of boards', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockBoard]));
        const result = await getToolResult('list_boards', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe('board123');
    });

    it('uses default filter open when not specified', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockBoard]));
        await callTool('list_boards', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('filter=open');
    });

    it('respects filter=all', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockBoard]));
        await callTool('list_boards', { filter: 'all' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('filter=all');
    });
});

describe('create_board', () => {
    it('returns created board with id and name', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockBoard, id: 'newboard1' }));
        const result = await getToolResult('create_board', { name: 'Sprint 1' });
        expect(result.id).toBe('newboard1');
    });

    it('sends POST to /boards', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBoard));
        await callTool('create_board', { name: 'Sprint 1', desc: 'Sprint board' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/boards');
        expect(call[1].method).toBe('POST');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_board', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('update_board', () => {
    it('sends PUT to /boards/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockBoard, name: 'Renamed Board' }));
        await callTool('update_board', { board_id: 'board123', name: 'Renamed Board' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/boards/board123');
        expect(call[1].method).toBe('PUT');
    });

    it('missing board_id returns validation error', async () => {
        const body = await callTool('update_board', { name: 'New Name' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('board_id');
    });
});

describe('get_board_members', () => {
    it('returns array of members', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockMember]));
        const result = await getToolResult('get_board_members', { board_id: 'board123' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe('member123');
    });

    it('calls /boards/:id/members', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockMember]));
        await callTool('get_board_members', { board_id: 'board123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/boards/board123/members');
    });

    it('missing board_id returns validation error', async () => {
        const body = await callTool('get_board_members', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('board_id');
    });
});

// ── Lists ─────────────────────────────────────────────────────────────────────

describe('get_lists', () => {
    it('returns array of lists for a board', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockList]));
        const result = await getToolResult('get_lists', { board_id: 'board123' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe('list123');
        expect(result[0].name).toBe('To Do');
    });

    it('calls /boards/:id/lists with filter', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockList]));
        await callTool('get_lists', { board_id: 'board123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/boards/board123/lists');
        expect(url).toContain('filter=open');
    });

    it('missing board_id returns validation error', async () => {
        const body = await callTool('get_lists', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('board_id');
    });
});

describe('create_list', () => {
    it('returns created list with id and name', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockList, id: 'newlist1' }));
        const result = await getToolResult('create_list', { board_id: 'board123', name: 'In Review' });
        expect(result.id).toBe('newlist1');
    });

    it('sends POST to /lists', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockList));
        await callTool('create_list', { board_id: 'board123', name: 'Done' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/lists');
        expect(call[1].method).toBe('POST');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_list', { board_id: 'board123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('update_list', () => {
    it('sends PUT to /lists/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockList, name: 'Done' }));
        await callTool('update_list', { list_id: 'list123', name: 'Done' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/lists/list123');
        expect(call[1].method).toBe('PUT');
    });

    it('can archive list with closed=true', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockList, closed: true }));
        await callTool('update_list', { list_id: 'list123', closed: true });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('closed=true');
    });

    it('missing list_id returns validation error', async () => {
        const body = await callTool('update_list', { name: 'New Name' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('list_id');
    });
});

describe('move_list', () => {
    it('sends PUT to /lists/:id/idBoard', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: 'board456' }));
        await callTool('move_list', { list_id: 'list123', board_id: 'board456' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/lists/list123/idBoard');
        expect(call[1].method).toBe('PUT');
    });

    it('missing board_id returns validation error', async () => {
        const body = await callTool('move_list', { list_id: 'list123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('board_id');
    });
});

// ── Cards ─────────────────────────────────────────────────────────────────────

describe('get_card', () => {
    it('returns full card details', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCard));
        const result = await getToolResult('get_card', { card_id: 'card123' });
        expect(result.id).toBe('card123');
        expect(result.name).toBe('Fix login bug');
        expect(result.desc).toBe('Users cannot log in with SSO');
    });

    it('calls /cards/:id with fields=all', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCard));
        await callTool('get_card', { card_id: 'card123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/cards/card123');
        expect(url).toContain('fields=all');
    });

    it('missing card_id returns validation error', async () => {
        const body = await callTool('get_card', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('card_id');
    });
});

describe('list_cards', () => {
    it('returns array of cards in a list', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockCard]));
        const result = await getToolResult('list_cards', { list_id: 'list123' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe('card123');
    });

    it('calls /lists/:id/cards with filter', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockCard]));
        await callTool('list_cards', { list_id: 'list123', filter: 'all' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/lists/list123/cards');
        expect(url).toContain('filter=all');
    });

    it('missing list_id returns validation error', async () => {
        const body = await callTool('list_cards', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('list_id');
    });
});

describe('create_card', () => {
    it('returns created card with id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockCard, id: 'newcard1' }));
        const result = await getToolResult('create_card', { idList: 'list123', name: 'New bug' });
        expect(result.id).toBe('newcard1');
    });

    it('sends POST to /cards with idList', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCard));
        await callTool('create_card', { idList: 'list123', name: 'Task', desc: 'Do it' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/cards');
        expect(call[0]).toContain('idList=list123');
        expect(call[1].method).toBe('POST');
    });

    it('includes optional fields when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCard));
        await callTool('create_card', {
            idList: 'list123',
            name: 'My card',
            due: '2026-06-30T00:00:00Z',
            idLabels: 'label1,label2',
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('due=');
        expect(url).toContain('idLabels=');
    });

    it('missing idList returns validation error', async () => {
        const body = await callTool('create_card', { name: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('idList');
    });
});

describe('update_card', () => {
    it('sends PUT to /cards/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockCard, name: 'Updated name' }));
        await callTool('update_card', { card_id: 'card123', name: 'Updated name' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/cards/card123');
        expect(call[1].method).toBe('PUT');
    });

    it('missing card_id returns validation error', async () => {
        const body = await callTool('update_card', { name: 'No id' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('card_id');
    });
});

describe('move_card', () => {
    it('sends PUT to /cards/:id with idList param', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockCard, idList: 'list456' }));
        await callTool('move_card', { card_id: 'card123', idList: 'list456' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/cards/card123');
        expect(call[0]).toContain('idList=list456');
        expect(call[1].method).toBe('PUT');
    });

    it('missing idList returns validation error', async () => {
        const body = await callTool('move_card', { card_id: 'card123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('idList');
    });
});

describe('archive_card', () => {
    it('sends PUT to /cards/:id with closed=true', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockCard, closed: true }));
        await callTool('archive_card', { card_id: 'card123' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/cards/card123');
        expect(call[0]).toContain('closed=true');
        expect(call[1].method).toBe('PUT');
    });

    it('missing card_id returns validation error', async () => {
        const body = await callTool('archive_card', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('card_id');
    });
});

describe('delete_card', () => {
    it('sends DELETE to /cards/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await callTool('delete_card', { card_id: 'card123' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/cards/card123');
        expect(call[1].method).toBe('DELETE');
    });

    it('missing card_id returns validation error', async () => {
        const body = await callTool('delete_card', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('card_id');
    });
});

// ── Checklists & Labels ───────────────────────────────────────────────────────

describe('get_card_checklists', () => {
    it('returns array of checklists with items', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockChecklist]));
        const result = await getToolResult('get_card_checklists', { card_id: 'card123' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe('checklist123');
        expect(result[0].checkItems).toHaveLength(2);
    });

    it('calls /cards/:id/checklists', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockChecklist]));
        await callTool('get_card_checklists', { card_id: 'card123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/cards/card123/checklists');
    });

    it('missing card_id returns validation error', async () => {
        const body = await callTool('get_card_checklists', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('card_id');
    });
});

describe('create_checklist', () => {
    it('returns created checklist with id and name', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockChecklist));
        const result = await getToolResult('create_checklist', { card_id: 'card123', name: 'Acceptance Criteria' });
        expect(result.id).toBe('checklist123');
        expect(result.name).toBe('Acceptance Criteria');
    });

    it('sends POST to /checklists', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockChecklist));
        await callTool('create_checklist', { card_id: 'card123', name: 'Steps' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/checklists');
        expect(call[0]).toContain('idCard=card123');
        expect(call[1].method).toBe('POST');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_checklist', { card_id: 'card123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('create_checklist_item', () => {
    it('returns created checklist item', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockChecklistItem));
        const result = await getToolResult('create_checklist_item', {
            checklist_id: 'checklist123',
            name: 'Write tests',
        });
        expect(result.id).toBe('item3');
        expect(result.name).toBe('Write tests');
        expect(result.state).toBe('incomplete');
    });

    it('sends POST to /checklists/:id/checkItems', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockChecklistItem));
        await callTool('create_checklist_item', { checklist_id: 'checklist123', name: 'Step 1' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/checklists/checklist123/checkItems');
        expect(call[1].method).toBe('POST');
    });

    it('includes checked param when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockChecklistItem, state: 'complete' }));
        await callTool('create_checklist_item', {
            checklist_id: 'checklist123',
            name: 'Pre-done step',
            checked: true,
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('checked=true');
    });

    it('missing checklist_id returns validation error', async () => {
        const body = await callTool('create_checklist_item', { name: 'Item' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('checklist_id');
    });
});

describe('update_checklist_item', () => {
    it('sends PUT to /cards/:cardId/checkItem/:itemId', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockChecklistItem, state: 'complete' }));
        await callTool('update_checklist_item', {
            card_id: 'card123',
            checklist_item_id: 'item2',
            state: 'complete',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/cards/card123/checkItem/item2');
        expect(call[0]).toContain('state=complete');
        expect(call[1].method).toBe('PUT');
    });

    it('missing state returns validation error', async () => {
        const body = await callTool('update_checklist_item', {
            card_id: 'card123',
            checklist_item_id: 'item2',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('state');
    });

    it('missing card_id returns validation error', async () => {
        const body = await callTool('update_checklist_item', {
            checklist_item_id: 'item2',
            state: 'complete',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('card_id');
    });
});

// ── API errors ────────────────────────────────────────────────────────────────

describe('API error handling', () => {
    it('returns -32603 on Trello 401 unauthorized', async () => {
        mockFetch.mockReturnValueOnce(apiErr('unauthorized', 401));
        const body = await callTool('get_board', { board_id: 'board123' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('401');
    });

    it('returns -32603 on Trello 404 not found', async () => {
        mockFetch.mockReturnValueOnce(apiErr('The requested resource was not found.', 404));
        const body = await callTool('get_card', { card_id: 'nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('404');
    });

    it('returns -32601 for unknown tool name', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
        expect(body.error!.message).toContain('Unknown tool');
    });
});
