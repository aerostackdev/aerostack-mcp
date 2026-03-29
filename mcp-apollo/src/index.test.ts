import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_KEY = 'test_apollo_api_key_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockPerson = {
    id: 'person_001',
    first_name: 'Jane',
    last_name: 'Smith',
    name: 'Jane Smith',
    email: 'jane.smith@acme.com',
    title: 'VP of Engineering',
    linkedin_url: 'https://linkedin.com/in/janesmith',
    organization: {
        id: 'org_001',
        name: 'Acme Corp',
        website_url: 'https://acme.com',
    },
    phone_numbers: [{ raw_number: '+15550001234', type: 'work' }],
};

const mockContact = {
    id: 'contact_001',
    first_name: 'Bob',
    last_name: 'Jones',
    email: 'bob.jones@example.com',
    phone: '+15559876543',
    title: 'Director of Sales',
    stage: 'open',
    account_id: 'account_001',
};

const mockAccount = {
    id: 'account_001',
    name: 'Acme Corp',
    domain: 'acme.com',
    industry: 'Software',
    phone: '+15551112222',
    website_url: 'https://acme.com',
    estimated_num_employees: 150,
};

const mockSequence = {
    id: 'seq_001',
    name: 'Cold Outreach Q1',
    status: 'active',
    num_steps: 5,
    num_active_contacts: 42,
};

const mockUsage = {
    requests_today: 150,
    monthly_limit: 10000,
    remaining: 9850,
};

const mockLabel = {
    id: 'label_001',
    name: 'hot-lead',
    team_id: 'team_001',
};

const mockPing = {
    is_logged_in: true,
    user: { id: 'user_001', email: 'admin@acme.com' },
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

function apiOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
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
    if (!missingSecrets.includes('apiKey')) {
        headers['X-Mcp-Secret-APOLLO-API-KEY'] = API_KEY;
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
    it('GET / returns status ok with server mcp-apollo and tools count', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-apollo');
        expect(body.tools).toBe(22);
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
        expect(body.result.serverInfo.name).toBe('mcp-apollo');
    });

    it('tools/list returns 22 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
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
    it('missing API key returns -32001 with APOLLO_API_KEY in message', async () => {
        const body = await callTool('list_people', {}, ['apiKey']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('APOLLO_API_KEY');
    });

    it('X-Api-Key header is sent with every request', async () => {
        mockFetch.mockReturnValueOnce(
            apiOk({ people: [mockPerson], pagination: { total_entries: 1 } }),
        );
        await callTool('search_people', { q_keywords: 'engineer' });
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['X-Api-Key']).toBe(API_KEY);
    });

    it('unknown tool returns -32601', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
    });
});

// ── People Search & Enrichment ────────────────────────────────────────────────

describe('search_people', () => {
    it('returns list of people from search', async () => {
        mockFetch.mockReturnValueOnce(
            apiOk({ people: [mockPerson], pagination: { total_entries: 1 } }),
        );
        const result = await getToolResult('search_people', { q_keywords: 'VP Engineering' });
        expect(result.people).toHaveLength(1);
        expect(result.people[0].name).toBe('Jane Smith');
    });

    it('sends POST to /people/search with keywords', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ people: [] }));
        await callTool('search_people', {
            q_keywords: 'CTO',
            person_titles: ['CTO', 'VP Engineering'],
            person_locations: ['San Francisco, CA'],
            q_organization_domains: ['acme.com'],
            page: 2,
            per_page: 50,
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/people/search');
        const body = JSON.parse(call[1].body as string);
        expect(body.q_keywords).toBe('CTO');
        expect(body.person_titles).toEqual(['CTO', 'VP Engineering']);
        expect(body.person_locations).toEqual(['San Francisco, CA']);
        expect(body.q_organization_domains).toEqual(['acme.com']);
        expect(body.page).toBe(2);
        expect(body.per_page).toBe(50);
    });

    it('uses defaults page=1 per_page=25 when not provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ people: [] }));
        await callTool('search_people', {});
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(body.page).toBe(1);
        expect(body.per_page).toBe(25);
    });
});

describe('get_person', () => {
    it('returns full person record by ID', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ person: mockPerson }));
        const result = await getToolResult('get_person', { person_id: 'person_001' });
        expect(result.person.id).toBe('person_001');
        expect(result.person.email).toBe('jane.smith@acme.com');
    });

    it('calls GET /people/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ person: mockPerson }));
        await callTool('get_person', { person_id: 'person_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/people/person_001');
    });

    it('missing person_id returns validation error', async () => {
        const body = await callTool('get_person', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('person_id');
    });
});

describe('enrich_person', () => {
    it('enriches person by email', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ person: mockPerson }));
        const result = await getToolResult('enrich_person', { email: 'jane.smith@acme.com' });
        expect(result.person.email).toBe('jane.smith@acme.com');
    });

    it('sends POST to /people/match with email and reveal_personal_emails', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ person: mockPerson }));
        await callTool('enrich_person', { email: 'jane.smith@acme.com' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/people/match');
        const body = JSON.parse(call[1].body as string);
        expect(body.email).toBe('jane.smith@acme.com');
        expect(body.reveal_personal_emails).toBe(true);
    });

    it('missing email returns validation error', async () => {
        const body = await callTool('enrich_person', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('email');
    });
});

describe('list_people', () => {
    it('returns contacts list', async () => {
        mockFetch.mockReturnValueOnce(
            apiOk({ contacts: [mockContact], pagination: { total_entries: 1 } }),
        );
        const result = await getToolResult('list_people', {});
        expect(result.contacts).toHaveLength(1);
        expect(result.contacts[0].id).toBe('contact_001');
    });

    it('calls GET /contacts with pagination params', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ contacts: [] }));
        await callTool('list_people', { page: 3, per_page: 10 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/contacts');
        expect(url).toContain('page=3');
        expect(url).toContain('per_page=10');
    });

    it('defaults to page=1 per_page=25', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ contacts: [] }));
        await callTool('list_people', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('page=1');
        expect(url).toContain('per_page=25');
    });
});

describe('create_person', () => {
    it('returns created contact', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ contact: mockContact }));
        const result = await getToolResult('create_person', {
            first_name: 'Bob',
            last_name: 'Jones',
            email: 'bob.jones@example.com',
            title: 'Director of Sales',
        });
        expect(result.contact.id).toBe('contact_001');
    });

    it('sends POST to /contacts with provided fields', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ contact: mockContact }));
        await callTool('create_person', {
            first_name: 'Bob',
            last_name: 'Jones',
            email: 'bob.jones@example.com',
            organization_name: 'Example Corp',
            phone: '+15559876543',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/contacts');
        const body = JSON.parse(call[1].body as string);
        expect(body.first_name).toBe('Bob');
        expect(body.last_name).toBe('Jones');
        expect(body.email).toBe('bob.jones@example.com');
    });

    it('missing last_name returns validation error', async () => {
        const body = await callTool('create_person', { first_name: 'Bob' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('last_name');
    });
});

describe('update_person', () => {
    it('sends PUT to /contacts/:id with updated fields', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ contact: mockContact }));
        await callTool('update_person', {
            person_id: 'contact_001',
            title: 'Senior Director',
            email: 'bob.new@example.com',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('PUT');
        expect(call[0]).toContain('/contacts/contact_001');
        const body = JSON.parse(call[1].body as string);
        expect(body.title).toBe('Senior Director');
        expect(body.email).toBe('bob.new@example.com');
    });

    it('missing person_id returns validation error', async () => {
        const body = await callTool('update_person', { title: 'Manager' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('person_id');
    });
});

// ── Accounts/Organizations ────────────────────────────────────────────────────

describe('search_accounts', () => {
    it('returns matching accounts', async () => {
        mockFetch.mockReturnValueOnce(
            apiOk({ accounts: [mockAccount], pagination: { total_entries: 1 } }),
        );
        const result = await getToolResult('search_accounts', {
            q_organization_name: 'Acme',
        });
        expect(result.accounts).toHaveLength(1);
        expect(result.accounts[0].name).toBe('Acme Corp');
    });

    it('sends POST to /accounts/search with filters', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ accounts: [] }));
        await callTool('search_accounts', {
            q_organization_name: 'Acme',
            q_organization_keyword_tags: ['saas', 'fintech'],
            page: 1,
            per_page: 50,
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/accounts/search');
        const body = JSON.parse(call[1].body as string);
        expect(body.q_organization_name).toBe('Acme');
        expect(body.q_organization_keyword_tags).toEqual(['saas', 'fintech']);
    });
});

describe('get_account', () => {
    it('returns account by ID', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ account: mockAccount }));
        const result = await getToolResult('get_account', { account_id: 'account_001' });
        expect(result.account.domain).toBe('acme.com');
        expect(result.account.industry).toBe('Software');
    });

    it('calls GET /accounts/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ account: mockAccount }));
        await callTool('get_account', { account_id: 'account_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/accounts/account_001');
    });

    it('missing account_id returns validation error', async () => {
        const body = await callTool('get_account', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('account_id');
    });
});

describe('create_account', () => {
    it('returns created account', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ account: mockAccount }));
        const result = await getToolResult('create_account', {
            name: 'Acme Corp',
            domain: 'acme.com',
            industry: 'Software',
        });
        expect(result.account.id).toBe('account_001');
    });

    it('sends POST to /accounts with required name and optional fields', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ account: mockAccount }));
        await callTool('create_account', {
            name: 'Acme Corp',
            domain: 'acme.com',
            phone: '+15551112222',
            industry: 'Software',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/accounts');
        const body = JSON.parse(call[1].body as string);
        expect(body.name).toBe('Acme Corp');
        expect(body.domain).toBe('acme.com');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_account', { domain: 'acme.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('update_account', () => {
    it('sends PUT to /accounts/:id with updated fields', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ account: mockAccount }));
        await callTool('update_account', {
            account_id: 'account_001',
            industry: 'FinTech',
            phone: '+15553334444',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('PUT');
        expect(call[0]).toContain('/accounts/account_001');
        const body = JSON.parse(call[1].body as string);
        expect(body.industry).toBe('FinTech');
        expect(body.phone).toBe('+15553334444');
    });

    it('missing account_id returns validation error', async () => {
        const body = await callTool('update_account', { name: 'New Name' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('account_id');
    });
});

describe('list_accounts', () => {
    it('returns list of accounts', async () => {
        mockFetch.mockReturnValueOnce(
            apiOk({ accounts: [mockAccount], pagination: { total_entries: 1 } }),
        );
        const result = await getToolResult('list_accounts', {});
        expect(result.accounts).toHaveLength(1);
        expect(result.accounts[0].name).toBe('Acme Corp');
    });

    it('calls GET /accounts with pagination', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ accounts: [] }));
        await callTool('list_accounts', { page: 2, per_page: 10 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/accounts');
        expect(url).toContain('page=2');
        expect(url).toContain('per_page=10');
    });
});

// ── Sequences ─────────────────────────────────────────────────────────────────

describe('list_sequences', () => {
    it('returns all sequences', async () => {
        mockFetch.mockReturnValueOnce(
            apiOk({ emailer_campaigns: [mockSequence] }),
        );
        const result = await getToolResult('list_sequences', {});
        expect(result.emailer_campaigns).toHaveLength(1);
        expect(result.emailer_campaigns[0].name).toBe('Cold Outreach Q1');
    });

    it('appends status filter when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ emailer_campaigns: [] }));
        await callTool('list_sequences', { status: 'active' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/emailer_campaigns');
        expect(url).toContain('status=active');
    });

    it('calls /emailer_campaigns without params when no status given', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ emailer_campaigns: [] }));
        await callTool('list_sequences', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/emailer_campaigns');
        expect(url).not.toContain('status=');
    });
});

describe('get_sequence', () => {
    it('returns sequence by ID', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ emailer_campaign: mockSequence }));
        const result = await getToolResult('get_sequence', { sequence_id: 'seq_001' });
        expect(result.emailer_campaign.num_steps).toBe(5);
    });

    it('calls GET /emailer_campaigns/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ emailer_campaign: mockSequence }));
        await callTool('get_sequence', { sequence_id: 'seq_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/emailer_campaigns/seq_001');
    });

    it('missing sequence_id returns validation error', async () => {
        const body = await callTool('get_sequence', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('sequence_id');
    });
});

describe('add_to_sequence', () => {
    it('sends POST to /emailer_campaigns/add_contact_ids', async () => {
        mockFetch.mockReturnValueOnce(
            apiOk({ contacts: [mockContact] }),
        );
        await callTool('add_to_sequence', {
            contact_id: 'contact_001',
            sequence_id: 'seq_001',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/emailer_campaigns/add_contact_ids');
        const body = JSON.parse(call[1].body as string);
        expect(body.contact_ids).toEqual(['contact_001']);
        expect(body.emailer_campaign_id).toBe('seq_001');
    });

    it('includes send_email_from_email_account_id when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ contacts: [] }));
        await callTool('add_to_sequence', {
            contact_id: 'contact_001',
            sequence_id: 'seq_001',
            send_email_from_email_account_id: 'email_acct_001',
        });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(body.send_email_from_email_account_id).toBe('email_acct_001');
    });

    it('missing contact_id returns validation error', async () => {
        const body = await callTool('add_to_sequence', { sequence_id: 'seq_001' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('contact_id');
    });

    it('missing sequence_id returns validation error', async () => {
        const body = await callTool('add_to_sequence', { contact_id: 'contact_001' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('sequence_id');
    });
});

describe('remove_from_sequence', () => {
    it('sends POST to /emailer_campaigns/remove_contact_ids', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ contacts: [] }));
        await callTool('remove_from_sequence', {
            contact_id: 'contact_001',
            sequence_id: 'seq_001',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/emailer_campaigns/remove_contact_ids');
        const body = JSON.parse(call[1].body as string);
        expect(body.contact_ids).toEqual(['contact_001']);
        expect(body.emailer_campaign_id).toBe('seq_001');
    });

    it('missing contact_id returns validation error', async () => {
        const body = await callTool('remove_from_sequence', { sequence_id: 'seq_001' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('contact_id');
    });
});

// ── Contacts Management ───────────────────────────────────────────────────────

describe('list_contacts', () => {
    it('returns contacts list with pagination', async () => {
        mockFetch.mockReturnValueOnce(
            apiOk({ contacts: [mockContact], pagination: { total_entries: 1 } }),
        );
        const result = await getToolResult('list_contacts', {});
        expect(result.contacts).toHaveLength(1);
        expect(result.contacts[0].email).toBe('bob.jones@example.com');
    });

    it('appends account_id filter when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ contacts: [] }));
        await callTool('list_contacts', { account_id: 'account_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('account_id=account_001');
    });

    it('appends label_names[] params when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ contacts: [] }));
        await callTool('list_contacts', { label_names: ['hot-lead', 'trial'] });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('label_names%5B%5D=hot-lead');
        expect(url).toContain('label_names%5B%5D=trial');
    });
});

describe('get_contact', () => {
    it('returns contact by ID', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ contact: mockContact }));
        const result = await getToolResult('get_contact', { contact_id: 'contact_001' });
        expect(result.contact.stage).toBe('open');
    });

    it('calls GET /contacts/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ contact: mockContact }));
        await callTool('get_contact', { contact_id: 'contact_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/contacts/contact_001');
    });

    it('missing contact_id returns validation error', async () => {
        const body = await callTool('get_contact', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('contact_id');
    });
});

describe('update_contact', () => {
    it('sends PUT to /contacts/:id with updated fields', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ contact: mockContact }));
        await callTool('update_contact', {
            contact_id: 'contact_001',
            stage: 'in-progress',
            title: 'VP of Sales',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('PUT');
        expect(call[0]).toContain('/contacts/contact_001');
        const body = JSON.parse(call[1].body as string);
        expect(body.stage).toBe('in-progress');
        expect(body.title).toBe('VP of Sales');
    });

    it('missing contact_id returns validation error', async () => {
        const body = await callTool('update_contact', { stage: 'open' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('contact_id');
    });
});

describe('delete_contact', () => {
    it('sends DELETE to /contacts/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        const result = await getToolResult('delete_contact', { contact_id: 'contact_001' });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('DELETE');
        expect(call[0]).toContain('/contacts/contact_001');
    });

    it('missing contact_id returns validation error', async () => {
        const body = await callTool('delete_contact', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('contact_id');
    });
});

// ── Usage & Labels ────────────────────────────────────────────────────────────

describe('get_api_usage', () => {
    it('returns API usage stats', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUsage));
        const result = await getToolResult('get_api_usage', {});
        expect(result.requests_today).toBe(150);
        expect(result.monthly_limit).toBe(10000);
        expect(result.remaining).toBe(9850);
    });

    it('calls GET /usage', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUsage));
        await callTool('get_api_usage', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/usage');
    });
});

describe('list_labels', () => {
    it('returns list of labels', async () => {
        mockFetch.mockReturnValueOnce(
            apiOk({ labels: [mockLabel] }),
        );
        const result = await getToolResult('list_labels', {});
        expect(result.labels).toHaveLength(1);
        expect(result.labels[0].name).toBe('hot-lead');
    });

    it('calls GET /labels', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ labels: [] }));
        await callTool('list_labels', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/labels');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns is_logged_in: true on valid credentials', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockPing));
        const result = await getToolResult('_ping', {});
        expect(result.is_logged_in).toBe(true);
        expect(result.user.id).toBe('user_001');
    });

    it('calls GET /auth/health', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockPing));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/auth/health');
    });

    it('returns -32603 on 401 unauthorized', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ message: 'Unauthorized' }, 401));
        const body = await callTool('_ping', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('401');
    });
});

// ── API error handling ────────────────────────────────────────────────────────

describe('API error handling', () => {
    it('propagates HTTP 404 as -32603 with status in message', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ message: 'Contact not found' }, 404));
        const body = await callTool('get_contact', { contact_id: 'nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('404');
    });

    it('propagates HTTP 429 rate limit as -32603', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ message: 'Rate limit exceeded' }, 429));
        const body = await callTool('list_people', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });

    it('extracts error array message from response', async () => {
        mockFetch.mockReturnValueOnce(
            apiErr({ errors: ['Invalid email format'] }, 422),
        );
        const body = await callTool('enrich_person', { email: 'bad-email' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('Invalid email format');
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
        const body = await callTool('list_accounts', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });

    it('handles 204 no-content response as empty object', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        const result = await getToolResult('delete_contact', { contact_id: 'contact_001' });
        expect(result).toEqual({});
    });
});
