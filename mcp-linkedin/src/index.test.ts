import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'test_linkedin_access_token_AQVz123abc';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockMeResponse = {
    id: 'AbCdEfGhIj',
    localizedFirstName: 'Ada',
    localizedLastName: 'Lovelace',
    localizedHeadline: 'Senior Engineer at Aerostack',
    vanityName: 'ada-lovelace-eng',
};

const mockProfileResponse = {
    id: 'XyZ123abc',
    localizedFirstName: 'Grace',
    localizedLastName: 'Hopper',
    localizedHeadline: 'Computer Science Pioneer',
};

const mockConnectionsResponse = {
    elements: [
        {
            to: {
                id: 'person1',
                localizedFirstName: 'Bob',
                localizedLastName: 'Smith',
                localizedHeadline: 'Engineer at Cloudflare',
            },
        },
        {
            to: {
                id: 'person2',
                localizedFirstName: 'Carol',
                localizedLastName: 'Jones',
                localizedHeadline: 'Developer Advocate',
            },
        },
    ],
    paging: { start: 0, count: 50, total: 2 },
};

const mockProfileViews = {
    elements: [
        {
            whoViewed: {
                firstName: 'Dave',
                lastName: 'Williams',
                headline: 'Startup Founder',
            },
            viewedAt: 1711670400000,
        },
    ],
    paging: { total: 1 },
};

const mockPostUrn = 'urn:li:ugcPost:7123456789012345678';

const mockCreatedPost = {
    id: mockPostUrn,
};

const mockPostResponse = {
    id: mockPostUrn,
    author: 'urn:li:person:AbCdEfGhIj',
    lifecycleState: 'PUBLISHED',
    specificContent: {
        'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: 'Hello LinkedIn from Aerostack!' },
            shareMediaCategory: 'NONE',
        },
    },
};

const mockCompanyResponse = {
    id: 1234567,
    localizedName: 'Aerostack Inc.',
    localizedDescription: 'AI-native backend infrastructure on Cloudflare.',
    websiteUrl: 'https://aerostack.dev',
    staffCount: 15,
    vanityName: 'aerostack',
};

const mockCompanyPostsResponse = {
    elements: [mockPostResponse],
    paging: { start: 0, count: 10, total: 1 },
};

const mockFollowerStats = {
    elements: [
        {
            organizationalEntity: 'urn:li:organization:1234567',
            totalFollowerCounts: { organicFollowerCount: 3200 },
        },
    ],
};

const mockSearchCompanies = {
    elements: [
        { id: 1234567, localizedName: 'Aerostack Inc.', vanityName: 'aerostack' },
        { id: 9876543, localizedName: 'Aerospace Tech', vanityName: 'aerospace-tech' },
    ],
    paging: { total: 2 },
};

const mockJobSearchResponse = {
    elements: [
        {
            trackingUrn: 'urn:li:jobPosting:3987654321',
            id: '3987654321',
            title: 'Senior Backend Engineer',
            formattedLocation: 'Remote',
        },
    ],
    paging: { start: 0, count: 10, total: 1 },
};

const mockJobResponse = {
    id: '3987654321',
    title: 'Senior Backend Engineer',
    description: { text: 'Build the future of AI backends.' },
    formattedLocation: 'Remote, USA',
    listedAt: 1711670400000,
};

const mockSendMessageResponse = {
    id: 'msgThread123',
};

const mockConversationsResponse = {
    elements: [
        {
            id: 'conv_abc123',
            lastActivityAt: 1711670400000,
            participants: ['urn:li:person:AbCdEfGhIj', 'urn:li:person:person1'],
        },
    ],
    paging: { start: 0, count: 10, total: 1 },
};

const mockConversationMessagesResponse = {
    elements: [
        {
            id: 'msg_001',
            createdAt: 1711670400000,
            from: { identity: 'urn:li:person:AbCdEfGhIj' },
            eventContent: {
                'com.linkedin.voyager.messaging.event.MessageEvent': {
                    body: 'Hello, great to connect!',
                },
            },
        },
    ],
    paging: { total: 1 },
};

const mockLikeResponse = {
    id: 'urn:li:like:person_AbCdEfGhIj_ugcPost_7123456789012345678',
};

const mockCommentResponse = {
    id: 'urn:li:comment:(urn:li:ugcPost:7123456789012345678,comment_001)',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiErr(data: unknown, status = 400) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function makeReq(
    method: string,
    params?: unknown,
    missingToken = false,
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingToken) {
        headers['X-Mcp-Secret-LINKEDIN-ACCESS-TOKEN'] = ACCESS_TOKEN;
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
    missingToken = false,
) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingToken);
}

async function callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    missingToken = false,
) {
    const req = makeToolReq(toolName, args, missingToken);
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
    it('GET / returns status ok with server mcp-linkedin and tools 21', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-linkedin');
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
        expect(body.result.serverInfo.name).toBe('mcp-linkedin');
    });

    it('tools/list returns exactly 21 tools with name, description, inputSchema', async () => {
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
    it('missing token returns -32001 with LINKEDIN_ACCESS_TOKEN in message', async () => {
        const body = await callTool('get_my_profile', {}, true);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('LINKEDIN_ACCESS_TOKEN');
    });

    it('Authorization header uses Bearer token format', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMeResponse));
        await callTool('get_my_profile', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it('sends X-Restli-Protocol-Version: 2.0.0 on every request', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMeResponse));
        await callTool('get_my_profile', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['X-Restli-Protocol-Version']).toBe('2.0.0');
    });

    it('sends LinkedIn-Version header on every request', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMeResponse));
        await callTool('get_my_profile', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['LinkedIn-Version']).toBe('202310');
    });
});

// ── Group 1: Profile ──────────────────────────────────────────────────────────

describe('get_my_profile', () => {
    it('returns authenticated user profile', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMeResponse));
        const result = await getToolResult('get_my_profile', {});
        expect(result.id).toBe('AbCdEfGhIj');
        expect(result.localizedFirstName).toBe('Ada');
        expect(result.localizedHeadline).toBe('Senior Engineer at Aerostack');
    });

    it('calls /v2/me endpoint with projection', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMeResponse));
        await callTool('get_my_profile', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/me');
        expect(url).toContain('projection');
    });

    it('API error propagates with status code', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ message: 'Unauthorized', status: 401 }, 401));
        const body = await callTool('get_my_profile', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('401');
    });
});

describe('get_profile_by_id', () => {
    it('returns profile for given person ID', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProfileResponse));
        const result = await getToolResult('get_profile_by_id', { person_id: 'XyZ123abc' });
        expect(result.id).toBe('XyZ123abc');
        expect(result.localizedFirstName).toBe('Grace');
    });

    it('missing person_id returns validation error', async () => {
        const body = await callTool('get_profile_by_id', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('person_id');
    });

    it('auto-prefixes urn:li:person: if missing', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProfileResponse));
        await callTool('get_profile_by_id', { person_id: 'XyZ123abc' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('urn%3Ali%3Aperson%3AXyZ123abc');
    });

    it('does not double-prefix urn:li:person: if already present', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProfileResponse));
        await callTool('get_profile_by_id', { person_id: 'urn:li:person:XyZ123abc' });
        const url = mockFetch.mock.calls[0][0] as string;
        // Should not contain double urn:li:person:
        expect(url).not.toContain('urn%3Ali%3Aperson%3Aurn%3Ali%3Aperson%3A');
    });
});

describe('get_connections', () => {
    it('returns list of connections', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConnectionsResponse));
        const result = await getToolResult('get_connections', {});
        expect(result.elements).toHaveLength(2);
        expect(result.elements[0].to.localizedFirstName).toBe('Bob');
    });

    it('calls /v2/connections with q=viewer', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConnectionsResponse));
        await callTool('get_connections', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/connections');
        expect(url).toContain('q=viewer');
    });

    it('respects count parameter up to 500', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConnectionsResponse));
        await callTool('get_connections', { count: 200 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('count=200');
    });

    it('caps count at 500', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConnectionsResponse));
        await callTool('get_connections', { count: 999 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('count=500');
    });
});

describe('get_profile_views', () => {
    it('returns profile view data', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProfileViews));
        const result = await getToolResult('get_profile_views', {});
        expect(result.elements).toHaveLength(1);
        expect(result.elements[0].whoViewed.firstName).toBe('Dave');
    });

    it('calls correct endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProfileViews));
        await callTool('get_profile_views', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/me/profileViews');
    });
});

// ── Group 2: Posts & Content ──────────────────────────────────────────────────

describe('create_post', () => {
    it('creates a post and returns the created post URN', async () => {
        // First fetch is /v2/me for author URN, second is POST to /v2/ugcPosts
        mockFetch
            .mockReturnValueOnce(apiOk(mockMeResponse))
            .mockReturnValueOnce(apiOk(mockCreatedPost));
        const result = await getToolResult('create_post', { text: 'Hello LinkedIn from Aerostack!' });
        expect(result.id).toBe(mockPostUrn);
    });

    it('missing text returns validation error', async () => {
        const body = await callTool('create_post', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('text');
    });

    it('POSTs to /v2/ugcPosts with correct structure', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockMeResponse))
            .mockReturnValueOnce(apiOk(mockCreatedPost));
        await callTool('create_post', { text: 'Test post', visibility: 'CONNECTIONS' });
        const postCall = mockFetch.mock.calls[1];
        expect(postCall[0]).toContain('/v2/ugcPosts');
        expect(postCall[1].method).toBe('POST');
        const reqBody = JSON.parse(postCall[1].body as string);
        expect(reqBody.lifecycleState).toBe('PUBLISHED');
        expect(reqBody.specificContent['com.linkedin.ugc.ShareContent'].shareCommentary.text).toBe('Test post');
        expect(reqBody.visibility['com.linkedin.ugc.MemberNetworkVisibility']).toBe('CONNECTIONS');
    });

    it('defaults to PUBLIC visibility', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockMeResponse))
            .mockReturnValueOnce(apiOk(mockCreatedPost));
        await callTool('create_post', { text: 'Public test' });
        const reqBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
        expect(reqBody.visibility['com.linkedin.ugc.MemberNetworkVisibility']).toBe('PUBLIC');
    });
});

describe('create_post_with_image', () => {
    it('creates a post with an image URL', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockMeResponse))
            .mockReturnValueOnce(apiOk(mockCreatedPost));
        const result = await getToolResult('create_post_with_image', {
            text: 'Check out our new dashboard!',
            image_url: 'https://aerostack.dev/images/dashboard.png',
        });
        expect(result.id).toBe(mockPostUrn);
    });

    it('missing text returns validation error', async () => {
        const body = await callTool('create_post_with_image', { image_url: 'https://example.com/img.png' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('text');
    });

    it('missing image_url returns validation error', async () => {
        const body = await callTool('create_post_with_image', { text: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('image_url');
    });

    it('includes IMAGE shareMediaCategory and media array', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockMeResponse))
            .mockReturnValueOnce(apiOk(mockCreatedPost));
        await callTool('create_post_with_image', {
            text: 'Post with image',
            image_url: 'https://example.com/image.jpg',
            image_title: 'My Image',
        });
        const reqBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
        const shareContent = reqBody.specificContent['com.linkedin.ugc.ShareContent'];
        expect(shareContent.shareMediaCategory).toBe('IMAGE');
        expect(shareContent.media[0].originalUrl).toBe('https://example.com/image.jpg');
        expect(shareContent.media[0].title.text).toBe('My Image');
    });
});

describe('delete_post', () => {
    it('returns success on deletion', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        const body = await callTool('delete_post', { post_urn: mockPostUrn });
        expect(body.error).toBeUndefined();
    });

    it('missing post_urn returns validation error', async () => {
        const body = await callTool('delete_post', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('post_urn');
    });

    it('sends DELETE to correct URL with encoded URN', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await callTool('delete_post', { post_urn: mockPostUrn });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/v2/ugcPosts/');
        expect(call[0]).toContain('urn%3Ali%3AugcPost%3A');
        expect(call[1].method).toBe('DELETE');
    });
});

describe('get_post', () => {
    it('returns post details', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockPostResponse));
        const result = await getToolResult('get_post', { post_urn: mockPostUrn });
        expect(result.id).toBe(mockPostUrn);
        expect(result.lifecycleState).toBe('PUBLISHED');
    });

    it('missing post_urn returns validation error', async () => {
        const body = await callTool('get_post', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('post_urn');
    });

    it('calls GET /v2/ugcPosts/{encoded_urn}', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockPostResponse));
        await callTool('get_post', { post_urn: mockPostUrn });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/ugcPosts/urn%3Ali%3AugcPost%3A');
    });
});

describe('like_post', () => {
    it('returns like confirmation', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockMeResponse))
            .mockReturnValueOnce(apiOk(mockLikeResponse));
        const result = await getToolResult('like_post', { post_urn: mockPostUrn });
        expect(result.id).toContain('urn:li:like:');
    });

    it('missing post_urn returns validation error', async () => {
        const body = await callTool('like_post', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('post_urn');
    });

    it('POSTs to /v2/likes with actor and object', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockMeResponse))
            .mockReturnValueOnce(apiOk(mockLikeResponse));
        await callTool('like_post', { post_urn: mockPostUrn });
        const postCall = mockFetch.mock.calls[1];
        expect(postCall[0]).toContain('/v2/likes');
        expect(postCall[1].method).toBe('POST');
        const reqBody = JSON.parse(postCall[1].body as string);
        expect(reqBody.object).toBe(mockPostUrn);
        expect(reqBody.actor).toContain('urn:li:person:');
    });
});

describe('comment_on_post', () => {
    it('returns comment confirmation', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockMeResponse))
            .mockReturnValueOnce(apiOk(mockCommentResponse));
        const result = await getToolResult('comment_on_post', {
            post_urn: mockPostUrn,
            text: 'Great post!',
        });
        expect(result.id).toContain('urn:li:comment:');
    });

    it('missing post_urn returns validation error', async () => {
        const body = await callTool('comment_on_post', { text: 'Hello' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('post_urn');
    });

    it('missing text returns validation error', async () => {
        const body = await callTool('comment_on_post', { post_urn: mockPostUrn });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('text');
    });

    it('POSTs to /v2/comments with correct structure', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockMeResponse))
            .mockReturnValueOnce(apiOk(mockCommentResponse));
        await callTool('comment_on_post', { post_urn: mockPostUrn, text: 'Great post!' });
        const postCall = mockFetch.mock.calls[1];
        expect(postCall[0]).toContain('/v2/comments');
        expect(postCall[1].method).toBe('POST');
        const reqBody = JSON.parse(postCall[1].body as string);
        expect(reqBody.message.text).toBe('Great post!');
        expect(reqBody.object).toBe(mockPostUrn);
    });
});

// ── Group 3: Company/Organization ────────────────────────────────────────────

describe('get_company', () => {
    it('returns company details', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCompanyResponse));
        const result = await getToolResult('get_company', { company_id: '1234567' });
        expect(result.localizedName).toBe('Aerostack Inc.');
        expect(result.websiteUrl).toBe('https://aerostack.dev');
    });

    it('missing company_id returns validation error', async () => {
        const body = await callTool('get_company', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('company_id');
    });

    it('calls /v2/organizations/{company_id}', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCompanyResponse));
        await callTool('get_company', { company_id: '1234567' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/organizations/1234567');
    });
});

describe('get_company_posts', () => {
    it('returns list of company posts', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCompanyPostsResponse));
        const result = await getToolResult('get_company_posts', { company_id: '1234567' });
        expect(result.elements).toHaveLength(1);
        expect(result.elements[0].lifecycleState).toBe('PUBLISHED');
    });

    it('missing company_id returns validation error', async () => {
        const body = await callTool('get_company_posts', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('company_id');
    });

    it('calls /v2/ugcPosts with q=authors', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCompanyPostsResponse));
        await callTool('get_company_posts', { company_id: '1234567', count: 5 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/ugcPosts');
        expect(url).toContain('q=authors');
    });
});

describe('create_company_post', () => {
    it('creates a company page post', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCreatedPost));
        const result = await getToolResult('create_company_post', {
            company_id: '1234567',
            text: 'Company announcement!',
        });
        expect(result.id).toBe(mockPostUrn);
    });

    it('missing company_id returns validation error', async () => {
        const body = await callTool('create_company_post', { text: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('company_id');
    });

    it('missing text returns validation error', async () => {
        const body = await callTool('create_company_post', { company_id: '1234567' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('text');
    });

    it('sets author to organization URN', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCreatedPost));
        await callTool('create_company_post', { company_id: '1234567', text: 'Test' });
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.author).toBe('urn:li:organization:1234567');
    });
});

describe('get_company_followers', () => {
    it('returns follower statistics', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockFollowerStats));
        const result = await getToolResult('get_company_followers', { company_id: '1234567' });
        expect(result.elements[0].totalFollowerCounts.organicFollowerCount).toBe(3200);
    });

    it('missing company_id returns validation error', async () => {
        const body = await callTool('get_company_followers', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('company_id');
    });

    it('calls correct endpoint with organizationalEntity param', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockFollowerStats));
        await callTool('get_company_followers', { company_id: '1234567' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/organizationalEntityFollowerStatistics');
        expect(url).toContain('organizationalEntity');
        expect(url).toContain('1234567');
    });
});

describe('search_companies', () => {
    it('returns list of matching companies', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSearchCompanies));
        const result = await getToolResult('search_companies', { keywords: 'aerostack' });
        expect(result.elements).toHaveLength(2);
        expect(result.elements[0].localizedName).toBe('Aerostack Inc.');
    });

    it('missing keywords returns validation error', async () => {
        const body = await callTool('search_companies', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('keywords');
    });

    it('calls /v2/organizations with search query', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSearchCompanies));
        await callTool('search_companies', { keywords: 'cloud infrastructure' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/organizations');
        expect(url).toContain('q=search');
    });
});

// ── Group 4: Jobs & Messaging ─────────────────────────────────────────────────

describe('search_jobs', () => {
    it('returns list of job postings', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockJobSearchResponse));
        const result = await getToolResult('search_jobs', { keywords: 'backend engineer' });
        expect(result.elements).toHaveLength(1);
        expect(result.elements[0].title).toBe('Senior Backend Engineer');
    });

    it('missing keywords returns validation error', async () => {
        const body = await callTool('search_jobs', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('keywords');
    });

    it('calls /v2/jobSearch with keywords', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockJobSearchResponse));
        await callTool('search_jobs', { keywords: 'product manager' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/jobSearch');
        expect(url).toContain('keywords=');
    });

    it('includes location when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockJobSearchResponse));
        await callTool('search_jobs', { keywords: 'engineer', location: 'Remote' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('locationFallback=Remote');
    });
});

describe('get_job', () => {
    it('returns job details', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockJobResponse));
        const result = await getToolResult('get_job', { job_id: '3987654321' });
        expect(result.title).toBe('Senior Backend Engineer');
        expect(result.formattedLocation).toBe('Remote, USA');
    });

    it('missing job_id returns validation error', async () => {
        const body = await callTool('get_job', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('job_id');
    });

    it('calls /v2/jobs/{job_id}', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockJobResponse));
        await callTool('get_job', { job_id: '3987654321' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/jobs/3987654321');
    });
});

describe('send_message', () => {
    it('returns message thread ID', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockMeResponse))
            .mockReturnValueOnce(apiOk(mockSendMessageResponse));
        const result = await getToolResult('send_message', {
            recipient_urn: 'urn:li:person:person1',
            subject: 'Hello',
            body: 'Great to connect with you!',
        });
        expect(result.id).toBe('msgThread123');
    });

    it('missing recipient_urn returns validation error', async () => {
        const body = await callTool('send_message', { subject: 'Hi', body: 'Hello' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('recipient_urn');
    });

    it('missing subject returns validation error', async () => {
        const body = await callTool('send_message', { recipient_urn: 'urn:li:person:x', body: 'Hello' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('subject');
    });

    it('missing body returns validation error', async () => {
        const body = await callTool('send_message', { recipient_urn: 'urn:li:person:x', subject: 'Hi' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('body');
    });

    it('POSTs to /v2/messages', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockMeResponse))
            .mockReturnValueOnce(apiOk(mockSendMessageResponse));
        await callTool('send_message', {
            recipient_urn: 'urn:li:person:person1',
            subject: 'Hi',
            body: 'Hello!',
        });
        const postCall = mockFetch.mock.calls[1];
        expect(postCall[0]).toContain('/v2/messages');
        expect(postCall[1].method).toBe('POST');
        const reqBody = JSON.parse(postCall[1].body as string);
        expect(reqBody.subject).toBe('Hi');
        expect(reqBody.body).toBe('Hello!');
    });
});

describe('get_conversations', () => {
    it('returns list of conversations', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConversationsResponse));
        const result = await getToolResult('get_conversations', {});
        expect(result.elements).toHaveLength(1);
        expect(result.elements[0].id).toBe('conv_abc123');
    });

    it('calls /v2/conversations with q=participant', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConversationsResponse));
        await callTool('get_conversations', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/conversations');
        expect(url).toContain('q=participant');
    });

    it('respects count parameter', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConversationsResponse));
        await callTool('get_conversations', { count: 5 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('count=5');
    });
});

describe('get_conversation_messages', () => {
    it('returns messages in a conversation', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConversationMessagesResponse));
        const result = await getToolResult('get_conversation_messages', { conversation_id: 'conv_abc123' });
        expect(result.elements).toHaveLength(1);
        expect(result.elements[0].id).toBe('msg_001');
    });

    it('missing conversation_id returns validation error', async () => {
        const body = await callTool('get_conversation_messages', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('conversation_id');
    });

    it('calls /v2/conversations/{id}/events', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConversationMessagesResponse));
        await callTool('get_conversation_messages', { conversation_id: 'conv_abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/conversations/conv_abc123/events');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns authenticated user profile data', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMeResponse));
        const result = await getToolResult('_ping', {});
        expect(result.id).toBe('AbCdEfGhIj');
        expect(result.localizedFirstName).toBe('Ada');
    });

    it('calls /v2/me endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMeResponse));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/me');
    });

    it('returns error when no token provided', async () => {
        const body = await callTool('_ping', {}, true);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('401 from API propagates as error', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ message: 'Unauthorized' }, 401));
        const body = await callTool('_ping', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('401');
    });
});
