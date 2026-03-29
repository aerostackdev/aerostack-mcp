import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_TOKEN = 'test_todoist_token_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockTask = {
    id: '2995104339',
    content: 'Buy groceries',
    description: 'Milk, eggs, bread',
    project_id: '2203306141',
    section_id: '7025',
    parent_id: null,
    labels: ['shopping'],
    priority: 2,
    due: { date: '2026-04-01', string: 'tomorrow' },
    url: 'https://todoist.com/showTask?id=2995104339',
    is_completed: false,
    created_at: '2026-03-01T00:00:00Z',
};

const mockProject = {
    id: '2203306141',
    name: 'Work',
    color: 'blue',
    comment_count: 3,
    order: 1,
    is_favorite: false,
    is_inbox_project: false,
    is_team_inbox: false,
    parent_id: null,
    url: 'https://todoist.com/project/2203306141',
    view_style: 'list',
};

const mockSection = {
    id: '7025',
    project_id: '2203306141',
    order: 1,
    name: 'Backlog',
};

const mockComment = {
    id: '2992679862',
    task_id: '2995104339',
    content: 'Need to check the list again.',
    posted_at: '2026-03-20T09:00:00Z',
};

const mockLabel = {
    id: '2156154810',
    name: 'shopping',
    color: 'charcoal',
    order: 1,
    is_favorite: false,
};

const mockUser = {
    email: 'user@example.com',
    full_name: 'Test User',
    id: '1855589',
    premium_status: 'active',
    timezone: 'UTC',
    start_day: 1,
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
    return Promise.resolve(new Response(JSON.stringify({ error: message }), {
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
        headers['X-Mcp-Secret-TODOIST-API-TOKEN'] = API_TOKEN;
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
    it('GET / returns status ok with server mcp-todoist and tools 22', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-todoist');
        expect(body.tools).toBe(22);
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
        expect(body.result.serverInfo.name).toBe('mcp-todoist');
    });

    it('tools/list returns exactly 22 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools).toHaveLength(22);
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
    it('missing token returns -32001 with TODOIST_API_TOKEN in message', async () => {
        const body = await callTool('list_tasks', {}, ['token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('TODOIST_API_TOKEN');
    });

    it('uses Bearer auth header for API calls', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockTask]));
        await callTool('list_tasks', {});
        const fetchArgs = mockFetch.mock.calls[0];
        expect(fetchArgs[1].headers['Authorization']).toBe(`Bearer ${API_TOKEN}`);
    });

    it('Todoist API 401 error is surfaced as -32603', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Forbidden', 401));
        const body = await callTool('list_tasks', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('_ping calls GET /user and returns user data', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUser));
        const result = await getToolResult('get_user', {});
        expect(result.email).toBe(mockUser.email);
        expect(result.full_name).toBe(mockUser.full_name);
    });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

describe('Tasks', () => {
    it('list_tasks with no filters returns all active tasks', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockTask]));
        const result = await getToolResult('list_tasks', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(mockTask.id);

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain('/tasks');
    });

    it('list_tasks with project_id filter passes correct query param', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockTask]));
        await getToolResult('list_tasks', { project_id: '2203306141' });
        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain('project_id=2203306141');
    });

    it('list_tasks with filter string passes filter param', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockTask]));
        await getToolResult('list_tasks', { filter: 'today' });
        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain('filter=today');
    });

    it('list_tasks with ids array passes ids as comma-separated', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockTask]));
        await getToolResult('list_tasks', { ids: ['111', '222'] });
        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain('ids=111%2C222');
    });

    it('get_task returns task by ID', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        const result = await getToolResult('get_task', { task_id: mockTask.id });
        expect(result.id).toBe(mockTask.id);
        expect(result.content).toBe(mockTask.content);

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain(`/tasks/${mockTask.id}`);
    });

    it('get_task missing task_id returns validation error', async () => {
        const body = await callTool('get_task', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('task_id');
    });

    it('create_task sends correct payload with all optional fields', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        const result = await getToolResult('create_task', {
            content: 'Buy groceries',
            description: 'Milk, eggs',
            project_id: '2203306141',
            priority: 2,
            due_string: 'tomorrow',
            labels: ['shopping'],
        });
        expect(result.id).toBe(mockTask.id);

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].method).toBe('POST');
        const sentBody = JSON.parse(fetchCall[1].body as string);
        expect(sentBody.content).toBe('Buy groceries');
        expect(sentBody.priority).toBe(2);
        expect(sentBody.labels).toEqual(['shopping']);
    });

    it('create_task missing content returns validation error', async () => {
        const body = await callTool('create_task', { project_id: '123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('content');
    });

    it('update_task sends PATCH-style POST to /tasks/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        await getToolResult('update_task', { task_id: mockTask.id, priority: 4 });

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain(`/tasks/${mockTask.id}`);
        expect(fetchCall[1].method).toBe('POST');
        const sentBody = JSON.parse(fetchCall[1].body as string);
        expect(sentBody.priority).toBe(4);
        expect(sentBody.task_id).toBeUndefined();
    });

    it('close_task calls POST /tasks/:id/close', async () => {
        mockFetch.mockReturnValueOnce(new Response(null, { status: 204 }));
        const result = await getToolResult('close_task', { task_id: mockTask.id });
        expect(result.success).toBe(true);

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain(`/tasks/${mockTask.id}/close`);
        expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });

    it('delete_task calls DELETE /tasks/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        const result = await getToolResult('delete_task', { task_id: mockTask.id });
        expect(result.success).toBe(true);

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain(`/tasks/${mockTask.id}`);
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
});

// ── Projects ──────────────────────────────────────────────────────────────────

describe('Projects', () => {
    it('list_projects returns all projects', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockProject]));
        const result = await getToolResult('list_projects', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(mockProject.id);
    });

    it('get_project returns project by ID', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProject));
        const result = await getToolResult('get_project', { project_id: mockProject.id });
        expect(result.name).toBe(mockProject.name);
        expect(result.color).toBe(mockProject.color);
    });

    it('get_project missing project_id returns validation error', async () => {
        const body = await callTool('get_project', {});
        expect(body.error!.message).toContain('project_id');
    });

    it('create_project sends correct payload', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProject));
        const result = await getToolResult('create_project', {
            name: 'Work',
            color: 'blue',
            is_favorite: false,
            view_style: 'list',
        });
        expect(result.id).toBe(mockProject.id);

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].method).toBe('POST');
        const sentBody = JSON.parse(fetchCall[1].body as string);
        expect(sentBody.name).toBe('Work');
        expect(sentBody.color).toBe('blue');
    });

    it('create_project missing name returns validation error', async () => {
        const body = await callTool('create_project', { color: 'blue' });
        expect(body.error!.message).toContain('name');
    });

    it('update_project sends only changed fields', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProject));
        await getToolResult('update_project', { project_id: mockProject.id, name: 'Work Updated' });

        const fetchCall = mockFetch.mock.calls[0];
        const sentBody = JSON.parse(fetchCall[1].body as string);
        expect(sentBody.name).toBe('Work Updated');
        expect(sentBody.project_id).toBeUndefined();
    });

    it('delete_project calls DELETE /projects/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await getToolResult('delete_project', { project_id: mockProject.id });
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
});

// ── Sections ──────────────────────────────────────────────────────────────────

describe('Sections', () => {
    it('list_sections returns sections for project', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockSection]));
        const result = await getToolResult('list_sections', { project_id: mockProject.id });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].name).toBe(mockSection.name);

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain(`project_id=${mockProject.id}`);
    });

    it('list_sections missing project_id returns validation error', async () => {
        const body = await callTool('list_sections', {});
        expect(body.error!.message).toContain('project_id');
    });

    it('get_section returns section by ID', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSection));
        const result = await getToolResult('get_section', { section_id: mockSection.id });
        expect(result.name).toBe(mockSection.name);
    });

    it('create_section sends correct payload', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSection));
        const result = await getToolResult('create_section', {
            name: 'Backlog',
            project_id: mockProject.id,
            order: 1,
        });
        expect(result.id).toBe(mockSection.id);

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.name).toBe('Backlog');
        expect(sentBody.project_id).toBe(mockProject.id);
        expect(sentBody.order).toBe(1);
    });

    it('create_section missing required fields returns error', async () => {
        const body = await callTool('create_section', { name: 'Backlog' });
        expect(body.error!.message).toContain('project_id');
    });

    it('delete_section calls DELETE /sections/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await getToolResult('delete_section', { section_id: mockSection.id });
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
});

// ── Comments & Labels ─────────────────────────────────────────────────────────

describe('Comments & Labels', () => {
    it('list_comments with task_id passes correct param', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockComment]));
        const result = await getToolResult('list_comments', { task_id: mockTask.id });
        expect(Array.isArray(result)).toBe(true);

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain(`task_id=${mockTask.id}`);
    });

    it('list_comments with project_id passes correct param', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockComment]));
        await getToolResult('list_comments', { project_id: mockProject.id });
        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain(`project_id=${mockProject.id}`);
    });

    it('list_comments without task_id or project_id returns error', async () => {
        const body = await callTool('list_comments', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('task_id');
    });

    it('create_comment sends comment on task', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockComment));
        const result = await getToolResult('create_comment', {
            content: 'Need to check the list again.',
            task_id: mockTask.id,
        });
        expect(result.id).toBe(mockComment.id);

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.content).toBe('Need to check the list again.');
        expect(sentBody.task_id).toBe(mockTask.id);
    });

    it('create_comment missing content returns validation error', async () => {
        const body = await callTool('create_comment', { task_id: mockTask.id });
        expect(body.error!.message).toContain('content');
    });

    it('list_labels returns all labels', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockLabel]));
        const result = await getToolResult('list_labels', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].name).toBe(mockLabel.name);
    });

    it('create_label sends correct payload', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockLabel));
        const result = await getToolResult('create_label', {
            name: 'shopping',
            color: 'charcoal',
        });
        expect(result.name).toBe(mockLabel.name);

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.name).toBe('shopping');
        expect(sentBody.color).toBe('charcoal');
    });

    it('create_label missing name returns validation error', async () => {
        const body = await callTool('create_label', { color: 'blue' });
        expect(body.error!.message).toContain('name');
    });
});

// ── User & Tasks ──────────────────────────────────────────────────────────────

describe('User & Tasks', () => {
    it('get_user returns user profile', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUser));
        const result = await getToolResult('get_user', {});
        expect(result.email).toBe(mockUser.email);
        expect(result.full_name).toBe(mockUser.full_name);

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain('/user');
    });

    it('reopen_task calls POST /tasks/:id/reopen', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        const result = await getToolResult('reopen_task', { task_id: mockTask.id });
        expect(result).toBeDefined();

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain(`/tasks/${mockTask.id}/reopen`);
        expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });

    it('reopen_task missing task_id returns error', async () => {
        const body = await callTool('reopen_task', {});
        expect(body.error!.message).toContain('task_id');
    });

    it('move_task with project_id sends project_id in body', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        await getToolResult('move_task', { task_id: mockTask.id, project_id: '999' });

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.project_id).toBe('999');
        expect(sentBody.task_id).toBeUndefined();
    });

    it('move_task with section_id sends section_id in body', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTask));
        await getToolResult('move_task', { task_id: mockTask.id, section_id: '7025' });

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.section_id).toBe('7025');
    });

    it('move_task without project_id or section_id returns error', async () => {
        const body = await callTool('move_task', { task_id: mockTask.id });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('project_id');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('API 404 returns -32603 with status in message', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Task not found', 404));
        const body = await callTool('get_task', { task_id: 'nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('404');
    });

    it('API 429 rate limit returns -32603', async () => {
        mockFetch.mockReturnValueOnce(new Response('Rate limit exceeded', { status: 429 }));
        const body = await callTool('list_tasks', {});
        expect(body.error!.code).toBe(-32603);
    });

    it('unknown tool returns -32601', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error!.code).toBe(-32601);
        expect(body.error!.message).toContain('nonexistent_tool');
    });
});
