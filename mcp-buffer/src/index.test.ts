import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'test_buffer_token_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockUser = {
    id: 'user_001',
    name: 'Alice Buffer',
    email: 'alice@example.com',
    plan: 'pro',
};

const mockProfile = {
    id: 'profile_001',
    service: 'twitter',
    service_username: 'alice_example',
    formatted_service: 'Twitter',
    statistics: {
        followers: 1200,
        following: 340,
        statuses: 890,
    },
};

const mockUpdate = {
    id: 'update_001',
    text: 'Check out our new product launch!',
    profile_ids: ['profile_001'],
    status: 'buffer',
    scheduled_at: 1750000000,
    service_update_id: null,
    statistics: { clicks: 0, retweets: 0, favorites: 0, reach: 0 },
};

const mockSentUpdate = {
    id: 'update_sent_001',
    text: 'Last week post',
    profile_ids: ['profile_001'],
    status: 'sent',
    sent_at: 1749000000,
    statistics: { clicks: 42, retweets: 5, favorites: 12, reach: 980 },
};

const mockSchedule = [
    { days: ['mon', 'wed', 'fri'], times: ['09:00', '17:00'] },
];

const mockConfig = {
    media: { picture_upload_limit: 10 },
    supported_services: ['twitter', 'facebook', 'linkedin', 'instagram'],
};

const mockInteractions = {
    interactions: [{ id: 'click_001', url: 'https://example.com', user: { name: 'Bob' } }],
    total: 42,
};

const mockLinkShares = {
    shares: 150,
    url: 'https://example.com/article',
};

const mockAnalyticsSummary = {
    total_clicks: 300,
    total_retweets: 25,
    total_favorites: 80,
    total_reach: 5000,
};

const mockQueueReorder = {
    success: true,
    updates: [mockUpdate],
};

const mockQueueShuffle = {
    success: true,
    updates: [mockUpdate],
};

// ── Test helpers ──────────────────────────────────────────────────────────────

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
}

function apiErr(body: unknown, status = 400) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
}

function makeReq(method: string, params?: unknown, missingSecrets: string[] = []) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('token')) {
        headers['X-Mcp-Secret-BUFFER-ACCESS-TOKEN'] = ACCESS_TOKEN;
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

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-buffer and tools 18', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-buffer');
        expect(body.tools).toBe(18);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(
            new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'not json{{{',
            }),
        );
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { protocolVersion: string; serverInfo: { name: string } };
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-buffer');
    });

    it('tools/list returns 18 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
        };
        expect(body.result.tools).toHaveLength(18);
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
    it('missing token returns -32001 with BUFFER_ACCESS_TOKEN in message', async () => {
        const body = await callTool('get_user', {}, ['token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('BUFFER_ACCESS_TOKEN');
    });

    it('Authorization header uses Bearer token format', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUser));
        await callTool('get_user', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it('unknown tool returns -32601', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
    });
});

// ── User & Profiles ───────────────────────────────────────────────────────────

describe('get_user', () => {
    it('returns authenticated user info', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUser));
        const result = await getToolResult('get_user', {});
        expect(result.id).toBe('user_001');
        expect(result.name).toBe('Alice Buffer');
        expect(result.plan).toBe('pro');
    });

    it('calls GET /user.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUser));
        await callTool('get_user', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/user.json');
    });
});

describe('list_profiles', () => {
    it('returns all connected social profiles', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockProfile]));
        const result = await getToolResult('list_profiles', {});
        expect(result).toHaveLength(1);
        expect(result[0].service).toBe('twitter');
        expect(result[0].id).toBe('profile_001');
    });

    it('calls GET /profiles.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk([]));
        await callTool('list_profiles', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/profiles.json');
    });
});

describe('get_profile', () => {
    it('returns profile by ID with statistics', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProfile));
        const result = await getToolResult('get_profile', { profile_id: 'profile_001' });
        expect(result.service_username).toBe('alice_example');
        expect(result.statistics.followers).toBe(1200);
    });

    it('calls GET /profiles/:id.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProfile));
        await callTool('get_profile', { profile_id: 'profile_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/profiles/profile_001.json');
    });

    it('missing profile_id returns validation error', async () => {
        const body = await callTool('get_profile', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('profile_id');
    });
});

describe('get_configurations', () => {
    it('returns supported services and configuration', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConfig));
        const result = await getToolResult('get_configurations', {});
        expect(result.supported_services).toContain('twitter');
    });

    it('calls GET /info/configuration.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConfig));
        await callTool('get_configurations', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/info/configuration.json');
    });
});

// ── Posts/Updates ─────────────────────────────────────────────────────────────

describe('list_pending_updates', () => {
    it('returns pending updates for a profile', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ updates: [mockUpdate] }));
        const result = await getToolResult('list_pending_updates', { profile_id: 'profile_001' });
        expect(result.updates).toHaveLength(1);
        expect(result.updates[0].status).toBe('buffer');
    });

    it('calls GET /profiles/:id/updates/pending.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ updates: [] }));
        await callTool('list_pending_updates', { profile_id: 'profile_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/profiles/profile_001/updates/pending.json');
    });

    it('appends page and count query params when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ updates: [] }));
        await callTool('list_pending_updates', {
            profile_id: 'profile_001',
            page: 2,
            count: 50,
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('page=2');
        expect(url).toContain('count=50');
    });

    it('missing profile_id returns validation error', async () => {
        const body = await callTool('list_pending_updates', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('profile_id');
    });
});

describe('list_sent_updates', () => {
    it('returns sent updates for a profile', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ updates: [mockSentUpdate] }));
        const result = await getToolResult('list_sent_updates', { profile_id: 'profile_001' });
        expect(result.updates[0].status).toBe('sent');
    });

    it('calls GET /profiles/:id/updates/sent.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ updates: [] }));
        await callTool('list_sent_updates', { profile_id: 'profile_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/profiles/profile_001/updates/sent.json');
    });

    it('missing profile_id returns validation error', async () => {
        const body = await callTool('list_sent_updates', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('profile_id');
    });
});

describe('get_update', () => {
    it('returns update by ID', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ update: mockUpdate }));
        const result = await getToolResult('get_update', { update_id: 'update_001' });
        expect(result.update.text).toBe('Check out our new product launch!');
    });

    it('calls GET /updates/:id.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ update: mockUpdate }));
        await callTool('get_update', { update_id: 'update_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/updates/update_001.json');
    });

    it('missing update_id returns validation error', async () => {
        const body = await callTool('get_update', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('update_id');
    });
});

describe('create_update', () => {
    it('returns created update', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ updates: [mockUpdate], buffer_count: 1 }));
        const result = await getToolResult('create_update', {
            text: 'Check out our new product launch!',
            profile_ids: ['profile_001'],
        });
        expect(result.updates).toHaveLength(1);
        expect(result.updates[0].text).toBe('Check out our new product launch!');
    });

    it('sends POST to /updates/create.json with form-encoded body', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ updates: [mockUpdate] }));
        await callTool('create_update', {
            text: 'Hello world',
            profile_ids: ['profile_001'],
            scheduled_at: 1750000000,
            shorten: true,
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/updates/create.json');
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
        const body = call[1].body as string;
        expect(decodeURIComponent(body)).toContain('text=Hello world');
        expect(body).toContain('scheduled_at=1750000000');
    });

    it('sends media fields when media is provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ updates: [mockUpdate] }));
        await callTool('create_update', {
            text: 'Photo post',
            profile_ids: ['profile_001'],
            media: { photo: 'https://example.com/photo.jpg', link: 'https://example.com' },
        });
        const body = mockFetch.mock.calls[0][1].body as string;
        expect(body).toContain('media');
        expect(decodeURIComponent(body)).toContain('photo.jpg');
    });

    it('missing text returns validation error', async () => {
        const body = await callTool('create_update', { profile_ids: ['profile_001'] });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('text');
    });

    it('missing profile_ids returns validation error', async () => {
        const body = await callTool('create_update', { text: 'Hello' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('profile_ids');
    });

    it('empty profile_ids array returns error', async () => {
        const body = await callTool('create_update', { text: 'Hello', profile_ids: [] });
        expect(body.error).toBeDefined();
    });
});

describe('update_update', () => {
    it('sends POST to /updates/:id/update.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ update: mockUpdate, success: true }));
        await callTool('update_update', {
            update_id: 'update_001',
            text: 'Updated post text',
            scheduled_at: 1750100000,
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/updates/update_001/update.json');
        const body = call[1].body as string;
        expect(decodeURIComponent(body)).toContain('Updated post text');
        expect(body).toContain('scheduled_at=1750100000');
    });

    it('missing update_id returns validation error', async () => {
        const body = await callTool('update_update', { text: 'New text' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('update_id');
    });
});

describe('delete_update', () => {
    it('sends POST to /updates/:id/destroy.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ success: true }));
        const result = await getToolResult('delete_update', { update_id: 'update_001' });
        expect(result.success).toBe(true);
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/updates/update_001/destroy.json');
    });

    it('missing update_id returns validation error', async () => {
        const body = await callTool('delete_update', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('update_id');
    });
});

// ── Scheduling ────────────────────────────────────────────────────────────────

describe('get_scheduled_times', () => {
    it('returns scheduled times for a profile', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ schedules: mockSchedule }));
        const result = await getToolResult('get_scheduled_times', { profile_id: 'profile_001' });
        expect(result.schedules[0].days).toContain('mon');
        expect(result.schedules[0].times).toContain('09:00');
    });

    it('calls GET /profiles/:id/schedules.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ schedules: mockSchedule }));
        await callTool('get_scheduled_times', { profile_id: 'profile_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/profiles/profile_001/schedules.json');
    });

    it('missing profile_id returns validation error', async () => {
        const body = await callTool('get_scheduled_times', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('profile_id');
    });
});

describe('update_scheduled_times', () => {
    it('sends POST to /profiles/:id/schedules/update.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ success: true }));
        await callTool('update_scheduled_times', {
            profile_id: 'profile_001',
            schedules: mockSchedule,
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/profiles/profile_001/schedules/update.json');
    });

    it('missing profile_id returns validation error', async () => {
        const body = await callTool('update_scheduled_times', { schedules: mockSchedule });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('profile_id');
    });

    it('missing schedules returns validation error', async () => {
        const body = await callTool('update_scheduled_times', { profile_id: 'profile_001' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('schedules');
    });
});

describe('move_to_top', () => {
    it('sends POST to /updates/:id/move_to_top.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ success: true, update: mockUpdate }));
        const result = await getToolResult('move_to_top', { update_id: 'update_001' });
        expect(result.success).toBe(true);
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/updates/update_001/move_to_top.json');
    });

    it('missing update_id returns validation error', async () => {
        const body = await callTool('move_to_top', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('update_id');
    });
});

// ── Analytics ─────────────────────────────────────────────────────────────────

describe('get_update_interactions', () => {
    it('returns interactions for a sent update', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockInteractions));
        const result = await getToolResult('get_update_interactions', {
            update_id: 'update_sent_001',
        });
        expect(result.total).toBe(42);
        expect(result.interactions).toHaveLength(1);
    });

    it('calls GET /updates/:id/interactions.json with default event=clicks', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockInteractions));
        await callTool('get_update_interactions', { update_id: 'update_sent_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/updates/update_sent_001/interactions.json');
        expect(url).toContain('event=clicks');
    });

    it('uses specified event type', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockInteractions));
        await callTool('get_update_interactions', {
            update_id: 'update_sent_001',
            event: 'retweets',
            count: 20,
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('event=retweets');
        expect(url).toContain('count=20');
    });

    it('missing update_id returns validation error', async () => {
        const body = await callTool('get_update_interactions', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('update_id');
    });
});

describe('get_link_shares', () => {
    it('returns share count for a URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockLinkShares));
        const result = await getToolResult('get_link_shares', {
            url: 'https://example.com/article',
        });
        expect(result.shares).toBe(150);
    });

    it('calls GET /links/shares.json with url param', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockLinkShares));
        await callTool('get_link_shares', { url: 'https://example.com/article' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/links/shares.json');
        expect(url).toContain('url=');
        expect(decodeURIComponent(url)).toContain('https://example.com/article');
    });

    it('missing url returns validation error', async () => {
        const body = await callTool('get_link_shares', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('url');
    });
});

describe('get_analytics_summary', () => {
    it('returns analytics summary for a profile', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockAnalyticsSummary));
        const result = await getToolResult('get_analytics_summary', {
            profile_id: 'profile_001',
        });
        expect(result.total_clicks).toBe(300);
        expect(result.total_reach).toBe(5000);
    });

    it('calls GET /profiles/:id/analytics/summary.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockAnalyticsSummary));
        await callTool('get_analytics_summary', {
            profile_id: 'profile_001',
            start_date: 1740000000,
            end_date: 1750000000,
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/profiles/profile_001/analytics/summary.json');
        expect(url).toContain('start_date=1740000000');
        expect(url).toContain('end_date=1750000000');
    });

    it('missing profile_id returns validation error', async () => {
        const body = await callTool('get_analytics_summary', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('profile_id');
    });
});

// ── Queue ─────────────────────────────────────────────────────────────────────

describe('reorder_queue', () => {
    it('sends POST to /profiles/:id/updates/reorder.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockQueueReorder));
        const result = await getToolResult('reorder_queue', {
            profile_id: 'profile_001',
            order: ['update_003', 'update_001', 'update_002'],
        });
        expect(result.success).toBe(true);
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/profiles/profile_001/updates/reorder.json');
    });

    it('missing profile_id returns validation error', async () => {
        const body = await callTool('reorder_queue', { order: ['update_001'] });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('profile_id');
    });

    it('missing order returns validation error', async () => {
        const body = await callTool('reorder_queue', { profile_id: 'profile_001' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('order');
    });

    it('empty order array returns error', async () => {
        const body = await callTool('reorder_queue', {
            profile_id: 'profile_001',
            order: [],
        });
        expect(body.error).toBeDefined();
    });
});

describe('shuffle_queue', () => {
    it('sends POST to /profiles/:id/updates/shuffle.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockQueueShuffle));
        const result = await getToolResult('shuffle_queue', { profile_id: 'profile_001' });
        expect(result.success).toBe(true);
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/profiles/profile_001/updates/shuffle.json');
    });

    it('includes count when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockQueueShuffle));
        await callTool('shuffle_queue', { profile_id: 'profile_001', count: 5 });
        const body = mockFetch.mock.calls[0][1].body as string;
        expect(body).toContain('count=5');
    });

    it('missing profile_id returns validation error', async () => {
        const body = await callTool('shuffle_queue', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('profile_id');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('calls GET /user.json and returns ok with user info', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUser));
        const result = await getToolResult('_ping', {});
        expect(result.ok).toBe(true);
        expect(result.user_id).toBe('user_001');
        expect(result.user_name).toBe('Alice Buffer');
    });

    it('sends GET to /user.json', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUser));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/user.json');
    });

    it('returns -32603 on 401 unauthorized', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ error: 'Unauthorized' }, 401));
        const body = await callTool('_ping', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('401');
    });
});

// ── API error handling ────────────────────────────────────────────────────────

describe('API error handling', () => {
    it('propagates HTTP 404 as -32603 with status in message', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ error: 'Update not found' }, 404));
        const body = await callTool('get_update', { update_id: 'nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('404');
    });

    it('propagates HTTP 401 as -32603 on invalid token', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ error: 'Token expired' }, 401));
        const body = await callTool('list_profiles', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });

    it('propagates HTTP 429 rate limit as -32603', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ message: 'Rate limit exceeded' }, 429));
        const body = await callTool('list_pending_updates', { profile_id: 'profile_001' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });

    it('handles non-JSON response body gracefully', async () => {
        mockFetch.mockReturnValueOnce(
            Promise.resolve(
                new Response('Internal Server Error', {
                    status: 500,
                    headers: { 'Content-Type': 'text/plain' },
                }),
            ),
        );
        const body = await callTool('list_profiles', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });

    it('uses message field from error response when available', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ message: 'Profile not found' }, 404));
        const body = await callTool('get_profile', { profile_id: 'bad_id' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Profile not found');
    });
});
