import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_TOKEN = 'pk_test_clickup_api_token_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockUser = {
    user: {
        id: 12345,
        username: 'janesmith',
        email: 'jane@example.com',
        color: '#7B68EE',
    },
};

const mockWorkspace = {
    id: 'team123',
    name: 'Acme Engineering',
    color: '#FF5733',
    members: [{ user: { id: 12345, username: 'janesmith' } }],
};

const mockSpace = {
    id: 'space123',
    name: 'Backend Team',
    private: false,
    features: { due_dates: { enabled: true } },
};

const mockFolder = {
    id: 'folder123',
    name: 'Sprint 1',
    task_count: '5',
    hidden: false,
};

const mockList = {
    id: 'list123',
    name: 'Backlog',
    task_count: 12,
    status: null,
    permission_level: 'create',
};

const mockTask = {
    id: 'task123abc',
    name: 'Fix auth bug',
    description: 'Users cannot log in with SSO',
    status: { status: 'in progress', color: '#4169e1' },
    priority: { id: '2', priority: 'high', color: '#FF8C00' },
    due_date: '1751241600000',
    assignees: [{ id: 12345, username: 'janesmith' }],
    tags: [{ name: 'bug' }],
    list: { id: 'list123', name: 'Backlog' },
    folder: { id: 'folder123', name: 'Sprint 1' },
    space: { id: 'space123' },
};

const mockComment = {
    id: 'comment123',
    comment: [{ text: 'Investigating now' }],
    comment_text: 'Investigating now',
    user: { id: 12345, username: 'janesmith' },
    date: '1711536000000',
};

const mockTimeEntry = {
    id: 'timer123',
    task: { id: 'task123abc', name: 'Fix auth bug' },
    user: { id: 12345, username: 'janesmith' },
    start: '1711536000000',
    end: null,
    duration: null,
    description: '',
    billable: false,
};

const mockMember = {
    user: {
        id: 12345,
        username: 'janesmith',
        email: 'jane@example.com',
        color: '#7B68EE',
        role: 4,
    },
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

function apiErr(errData: unknown, status = 400) {
    return Promise.resolve(new Response(JSON.stringify(errData), {
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
    if (!missingSecrets.includes('apiToken')) {
        headers['X-Mcp-Secret-CLICKUP-API-TOKEN'] = API_TOKEN;
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
    it('GET / returns status ok with server mcp-clickup and tools 22', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-clickup');
        expect(body.tools).toBe(23);
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
        expect(body.result.serverInfo.name).toBe('mcp-clickup');
    });

    it('tools/list returns exactly 22 tools with name, description, inputSchema', async () => {
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
    it('missing token returns -32001 with CLICKUP_API_TOKEN in message', async () => {
        const body = await callTool('get_workspaces', {}, ['apiToken']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('CLICKUP_API_TOKEN');
    });

    it('Authorization header uses raw token without Bearer prefix', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ teams: [mockWorkspace] }));
        await callTool('get_workspaces', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(API_TOKEN);
        expect(headers['Authorization']).not.toContain('Bearer');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns user profile with id, username, email', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUser));
        const result = await getToolResult('_ping', {});
        expect(result.user.id).toBe(12345);
        expect(result.user.username).toBe('janesmith');
        expect(result.user.email).toBe('jane@example.com');
    });

    it('calls GET /api/v2/user', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUser));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/user');
    });

    it('returns -32603 on invalid token', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ err: 'Token invalid.', ECODE: 'OAUTH_025' }, 401));
        const body = await callTool('_ping', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });
});

// ── Workspaces & Spaces ───────────────────────────────────────────────────────

describe('get_workspaces', () => {
    it('returns workspaces array', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ teams: [mockWorkspace] }));
        const result = await getToolResult('get_workspaces', {});
        expect(result.teams).toBeDefined();
        expect(result.teams[0].id).toBe('team123');
    });

    it('calls GET /api/v2/team', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ teams: [mockWorkspace] }));
        await callTool('get_workspaces', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/team');
    });
});

describe('get_spaces', () => {
    it('returns spaces for a workspace', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ spaces: [mockSpace] }));
        const result = await getToolResult('get_spaces', { workspace_id: 'team123' });
        expect(result.spaces[0].id).toBe('space123');
    });

    it('calls /team/:id/space with archived param', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ spaces: [] }));
        await callTool('get_spaces', { workspace_id: 'team123', archived: true });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/team/team123/space');
        expect(url).toContain('archived=true');
    });

    it('missing workspace_id returns validation error', async () => {
        const body = await callTool('get_spaces', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('workspace_id');
    });
});

describe('create_space', () => {
    it('returns created space with id and name', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSpace));
        const result = await getToolResult('create_space', { workspace_id: 'team123', name: 'Frontend' });
        expect(result.id).toBe('space123');
        expect(result.name).toBe('Backend Team');
    });

    it('sends POST to /team/:id/space', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSpace));
        await callTool('create_space', { workspace_id: 'team123', name: 'Frontend' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/team/team123/space');
        expect(call[1].method).toBe('POST');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_space', { workspace_id: 'team123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('get_space', () => {
    it('returns space details', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSpace));
        const result = await getToolResult('get_space', { space_id: 'space123' });
        expect(result.id).toBe('space123');
    });

    it('missing space_id returns validation error', async () => {
        const body = await callTool('get_space', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('space_id');
    });
});

// ── Folders & Lists ───────────────────────────────────────────────────────────

describe('get_folders', () => {
    it('returns folders for a space', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ folders: [mockFolder] }));
        const result = await getToolResult('get_folders', { space_id: 'space123' });
        expect(result.folders[0].id).toBe('folder123');
    });

    it('calls /space/:id/folder', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ folders: [] }));
        await callTool('get_folders', { space_id: 'space123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/space/space123/folder');
    });

    it('missing space_id returns validation error', async () => {
        const body = await callTool('get_folders', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('space_id');
    });
});

describe('create_folder', () => {
    it('returns created folder', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockFolder));
        const result = await getToolResult('create_folder', { space_id: 'space123', name: 'Sprint 2' });
        expect(result.id).toBe('folder123');
    });

    it('sends POST to /space/:id/folder', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockFolder));
        await callTool('create_folder', { space_id: 'space123', name: 'Sprint 2' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/space/space123/folder');
        expect(call[1].method).toBe('POST');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_folder', { space_id: 'space123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('get_lists', () => {
    it('returns lists for a folder when folder_id provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ lists: [mockList] }));
        const result = await getToolResult('get_lists', { folder_id: 'folder123' });
        expect(result.lists[0].id).toBe('list123');
    });

    it('calls /folder/:id/list when folder_id provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ lists: [] }));
        await callTool('get_lists', { folder_id: 'folder123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/folder/folder123/list');
    });

    it('calls /space/:id/list when space_id provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ lists: [] }));
        await callTool('get_lists', { space_id: 'space123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/space/space123/list');
    });

    it('returns error when neither folder_id nor space_id provided', async () => {
        const body = await callTool('get_lists', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('folder_id');
    });
});

describe('create_list', () => {
    it('creates list in folder when folder_id provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockList));
        const result = await getToolResult('create_list', { folder_id: 'folder123', name: 'Sprint Tasks' });
        expect(result.id).toBe('list123');
    });

    it('sends POST to /folder/:id/list', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockList));
        await callTool('create_list', { folder_id: 'folder123', name: 'Tasks' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/folder/folder123/list');
        expect(call[1].method).toBe('POST');
    });

    it('creates folderless list in space when space_id provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockList));
        await callTool('create_list', { space_id: 'space123', name: 'Standalone' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/space/space123/list');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_list', { folder_id: 'folder123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('get_list', () => {
    it('returns list details', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockList));
        const result = await getToolResult('get_list', { list_id: 'list123' });
        expect(result.id).toBe('list123');
        expect(result.name).toBe('Backlog');
    });

    it('missing list_id returns validation error', async () => {
        const body = await callTool('get_list', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('list_id');
    });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

describe('get_task', () => {
    it('returns full task details', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        const result = await getToolResult('get_task', { task_id: 'task123abc' });
        expect(result.id).toBe('task123abc');
        expect(result.name).toBe('Fix auth bug');
        expect(result.status.status).toBe('in progress');
    });

    it('calls /task/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        await callTool('get_task', { task_id: 'task123abc' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/task/task123abc');
    });

    it('adds include_subtasks param when true', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        await callTool('get_task', { task_id: 'task123abc', include_subtasks: true });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('include_subtasks=true');
    });

    it('missing task_id returns validation error', async () => {
        const body = await callTool('get_task', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('task_id');
    });
});

describe('list_tasks', () => {
    it('returns tasks array for a list', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ tasks: [mockTask] }));
        const result = await getToolResult('list_tasks', { list_id: 'list123' });
        expect(result.tasks[0].id).toBe('task123abc');
    });

    it('calls /list/:id/task', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ tasks: [] }));
        await callTool('list_tasks', { list_id: 'list123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/list/list123/task');
    });

    it('includes include_closed param when true', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ tasks: [] }));
        await callTool('list_tasks', { list_id: 'list123', include_closed: true });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('include_closed=true');
    });

    it('missing list_id returns validation error', async () => {
        const body = await callTool('list_tasks', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('list_id');
    });
});

describe('create_task', () => {
    it('returns created task with id and name', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        const result = await getToolResult('create_task', { list_id: 'list123', name: 'Fix auth bug' });
        expect(result.id).toBe('task123abc');
        expect(result.name).toBe('Fix auth bug');
    });

    it('sends POST to /list/:id/task', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        await callTool('create_task', { list_id: 'list123', name: 'New task' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/list/list123/task');
        expect(call[1].method).toBe('POST');
    });

    it('includes priority and due_date in body when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        await callTool('create_task', {
            list_id: 'list123',
            name: 'Urgent task',
            priority: 1,
            due_date: 1751241600000,
        });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string);
        expect(body.priority).toBe(1);
        expect(body.due_date).toBe(1751241600000);
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_task', { list_id: 'list123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('update_task', () => {
    it('sends PUT to /task/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockTask, name: 'Fixed auth bug' }));
        await callTool('update_task', { task_id: 'task123abc', name: 'Fixed auth bug' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/task/task123abc');
        expect(call[1].method).toBe('PUT');
    });

    it('only sends provided fields in body', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        await callTool('update_task', { task_id: 'task123abc', status: 'done' });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string);
        expect(body.status).toBe('done');
        expect(body.name).toBeUndefined();
    });

    it('missing task_id returns validation error', async () => {
        const body = await callTool('update_task', { name: 'Updated' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('task_id');
    });
});

describe('delete_task', () => {
    it('sends DELETE to /task/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await callTool('delete_task', { task_id: 'task123abc' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/task/task123abc');
        expect(call[1].method).toBe('DELETE');
    });

    it('missing task_id returns validation error', async () => {
        const body = await callTool('delete_task', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('task_id');
    });
});

describe('add_task_comment', () => {
    it('returns created comment', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockComment));
        const result = await getToolResult('add_task_comment', {
            task_id: 'task123abc',
            comment_text: 'Investigating now',
        });
        expect(result.id).toBe('comment123');
    });

    it('sends POST to /task/:id/comment', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockComment));
        await callTool('add_task_comment', { task_id: 'task123abc', comment_text: 'Hello' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/task/task123abc/comment');
        expect(call[1].method).toBe('POST');
    });

    it('missing comment_text returns validation error', async () => {
        const body = await callTool('add_task_comment', { task_id: 'task123abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('comment_text');
    });
});

describe('get_task_comments', () => {
    it('returns array of comments', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ comments: [mockComment] }));
        const result = await getToolResult('get_task_comments', { task_id: 'task123abc' });
        expect(result.comments[0].id).toBe('comment123');
    });

    it('calls GET /task/:id/comment', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ comments: [] }));
        await callTool('get_task_comments', { task_id: 'task123abc' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/task/task123abc/comment');
    });

    it('missing task_id returns validation error', async () => {
        const body = await callTool('get_task_comments', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('task_id');
    });
});

describe('set_task_custom_field', () => {
    it('sends POST to /task/:id/field/:fieldId', async () => {
        mockFetch.mockReturnValueOnce(apiOk({}));
        await callTool('set_task_custom_field', {
            task_id: 'task123abc',
            field_id: 'field-uuid-123',
            value: 'Some value',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/task/task123abc/field/field-uuid-123');
        expect(call[1].method).toBe('POST');
    });

    it('sends value in request body', async () => {
        mockFetch.mockReturnValueOnce(apiOk({}));
        await callTool('set_task_custom_field', {
            task_id: 'task123abc',
            field_id: 'field-uuid-123',
            value: 42,
        });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(body.value).toBe(42);
    });

    it('missing field_id returns validation error', async () => {
        const body = await callTool('set_task_custom_field', { task_id: 'task123abc', value: 'x' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('field_id');
    });
});

// ── Time Tracking & Members ───────────────────────────────────────────────────

describe('start_time_entry', () => {
    it('returns started time entry', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockTimeEntry }));
        const result = await getToolResult('start_time_entry', {
            workspace_id: 'team123',
            task_id: 'task123abc',
        });
        expect(result.data.id).toBe('timer123');
    });

    it('sends POST to /team/:id/time_entries/start with task id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockTimeEntry }));
        await callTool('start_time_entry', { workspace_id: 'team123', task_id: 'task123abc' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/team/team123/time_entries/start');
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.tid).toBe('task123abc');
    });

    it('missing task_id returns validation error', async () => {
        const body = await callTool('start_time_entry', { workspace_id: 'team123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('task_id');
    });
});

describe('stop_time_entry', () => {
    it('sends POST to /team/:id/time_entries/stop', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: { ...mockTimeEntry, end: '1711539600000' } }));
        await callTool('stop_time_entry', { workspace_id: 'team123' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/team/team123/time_entries/stop');
        expect(call[1].method).toBe('POST');
    });

    it('missing workspace_id returns validation error', async () => {
        const body = await callTool('stop_time_entry', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('workspace_id');
    });
});

describe('get_time_entries', () => {
    it('returns time entries for a workspace', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [mockTimeEntry] }));
        const result = await getToolResult('get_time_entries', { workspace_id: 'team123' });
        expect(result.data[0].id).toBe('timer123');
    });

    it('adds task_id and assignee query params when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [] }));
        await callTool('get_time_entries', {
            workspace_id: 'team123',
            task_id: 'task123abc',
            assignee: 12345,
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('task_id=task123abc');
        expect(url).toContain('assignee=12345');
    });

    it('missing workspace_id returns validation error', async () => {
        const body = await callTool('get_time_entries', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('workspace_id');
    });
});

describe('get_workspace_members', () => {
    it('returns members array', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ members: [mockMember] }));
        const result = await getToolResult('get_workspace_members', { workspace_id: 'team123' });
        expect(result.members[0].user.id).toBe(12345);
    });

    it('calls /team/:id/member', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ members: [] }));
        await callTool('get_workspace_members', { workspace_id: 'team123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/team/team123/member');
    });

    it('missing workspace_id returns validation error', async () => {
        const body = await callTool('get_workspace_members', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('workspace_id');
    });
});

describe('search_tasks', () => {
    it('returns matching tasks', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ tasks: [mockTask] }));
        const result = await getToolResult('search_tasks', {
            workspace_id: 'team123',
            query: 'auth bug',
        });
        expect(result.tasks[0].id).toBe('task123abc');
    });

    it('includes query param in URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ tasks: [] }));
        await callTool('search_tasks', { workspace_id: 'team123', query: 'login' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/team/team123/task');
        expect(url).toContain('query=login');
    });

    it('missing query returns validation error', async () => {
        const body = await callTool('search_tasks', { workspace_id: 'team123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('query');
    });
});

// ── API errors ────────────────────────────────────────────────────────────────

describe('API error handling', () => {
    it('returns -32603 on ClickUp 401 unauthorized', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ err: 'Token invalid.', ECODE: 'OAUTH_025' }, 401));
        const body = await callTool('get_task', { task_id: 'task123abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('401');
    });

    it('returns -32603 on ClickUp 404 not found', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ err: 'Task not found.', ECODE: 'ITEM_001' }, 404));
        const body = await callTool('get_task', { task_id: 'doesnotexist' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });

    it('returns -32601 for unknown tool name', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
        expect(body.error!.message).toContain('Unknown tool');
    });
});
