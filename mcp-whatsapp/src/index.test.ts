import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ────────────────────────────────────────────────────────────────

const TOKEN = 'test_access_token';
const PHONE_ID = '123456789';
const WABA_ID = 'waba_987654';

// ── Helpers ──────────────────────────────────────────────────────────────────

function metaOk(data: unknown) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function metaErr(code: number, subcode?: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({
        error: { code, error_subcode: subcode, message, type: 'OAuthException', fbtrace_id: 'test' },
    }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, opts: { token?: string | null; phoneId?: string | null; wabaId?: string } = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.token !== null) headers['X-Mcp-Secret-WHATSAPP-ACCESS-TOKEN'] = opts.token ?? TOKEN;
    if (opts.phoneId !== null) headers['X-Mcp-Secret-WHATSAPP-PHONE-NUMBER-ID'] = opts.phoneId ?? PHONE_ID;
    if (opts.wabaId) headers['X-Mcp-Secret-WHATSAPP-BUSINESS-ACCOUNT-ID'] = opts.wabaId;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(toolName: string, args: Record<string, unknown> = {}, opts: { token?: string | null; phoneId?: string | null; wabaId?: string } = {}) {
    return makeReq('tools/call', { name: toolName, arguments: args }, opts);
}

async function callTool(toolName: string, args: Record<string, unknown> = {}, opts: { token?: string | null; phoneId?: string | null; wabaId?: string } = {}) {
    const req = makeToolReq(toolName, args, opts);
    const res = await worker.fetch(req);
    return res.json() as Promise<{
        jsonrpc: string;
        id: number;
        result?: { content: [{ type: string; text: string }] };
        error?: { code: number; message: string };
    }>;
}

async function getToolResult(toolName: string, args: Record<string, unknown> = {}, opts: { token?: string | null; phoneId?: string | null; wabaId?: string } = {}) {
    const body = await callTool(toolName, args, opts);
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    return JSON.parse(body.result!.content[0].text);
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with tools: 24', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-whatsapp');
        expect(body.tools).toBe(24);
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
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-whatsapp');
    });

    it('tools/list returns exactly 24 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(24);
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
    it('missing both secrets returns -32001 with helpful message', async () => {
        const body = await callTool('send_text', { to: '15551234567', text: 'hello' }, { token: null, phoneId: null });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('WHATSAPP_ACCESS_TOKEN');
    });

    it('missing phone number ID returns -32001', async () => {
        const body = await callTool('send_text', { to: '15551234567', text: 'hello' }, { phoneId: null });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('Meta error code 190 maps to access token expired message', async () => {
        mockFetch.mockReturnValueOnce(metaErr(190, undefined, 'Invalid OAuth access token'));
        const body = await callTool('send_text', { to: '15551234567', text: 'hello' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Access token expired');
    });

    it('Meta error code 80007 maps to rate limit message', async () => {
        mockFetch.mockReturnValueOnce(metaErr(80007, undefined, 'Rate limit hit'));
        const body = await callTool('send_text', { to: '15551234567', text: 'hello' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Rate limit');
    });
});

// ── Group 1 — Account & Profile ───────────────────────────────────────────────

describe('get_business_profile', () => {
    it('returns shaped profile response', async () => {
        mockFetch.mockReturnValueOnce(metaOk({
            messaging_product: 'whatsapp',
            description: 'The best business',
            address: '123 Main St',
            email: 'contact@business.com',
            websites: ['https://business.com'],
            vertical: 'RETAIL',
            profile_picture_url: 'https://example.com/pic.jpg',
        }));
        const result = await getToolResult('get_business_profile');
        expect(result.description).toBe('The best business');
        expect(result.address).toBe('123 Main St');
        expect(result.email).toBe('contact@business.com');
        expect(result.websites).toEqual(['https://business.com']);
        expect(result.category).toBe('RETAIL');
        expect(result.profile_picture_url).toBe('https://example.com/pic.jpg');
    });
});

describe('update_business_profile', () => {
    it('returns success with updated_fields', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ success: true }));
        const result = await getToolResult('update_business_profile', {
            description: 'Updated description',
            email: 'new@business.com',
        });
        expect(result.success).toBe(true);
        expect(result.updated_fields).toContain('description');
        expect(result.updated_fields).toContain('email');
    });
});

describe('get_phone_number_info', () => {
    it('returns phone info with quality_rating', async () => {
        mockFetch.mockReturnValueOnce(metaOk({
            id: PHONE_ID,
            display_phone_number: '+1 555 123 4567',
            verified_name: 'Test Business',
            quality_rating: 'GREEN',
            platform_type: 'CLOUD_API',
            throughput: { level: 'STANDARD' },
        }));
        const result = await getToolResult('get_phone_number_info');
        expect(result.id).toBe(PHONE_ID);
        expect(result.display_phone_number).toBe('+1 555 123 4567');
        expect(result.verified_name).toBe('Test Business');
        expect(result.quality_rating).toBe('GREEN');
        expect(result.throughput_level).toBe('STANDARD');
    });
});

describe('get_account_info', () => {
    it('missing wabaId returns -32002 error', async () => {
        const body = await callTool('get_account_info', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32002);
        expect(body.error!.message).toContain('WHATSAPP_BUSINESS_ACCOUNT_ID');
    });

    it('with wabaId returns shaped account info', async () => {
        mockFetch.mockReturnValueOnce(metaOk({
            id: WABA_ID,
            name: 'Test WABA',
            currency: 'USD',
            timezone_id: '1',
            message_template_namespace: 'ns_123',
        }));
        const result = await getToolResult('get_account_info', {}, { wabaId: WABA_ID });
        expect(result.id).toBe(WABA_ID);
        expect(result.name).toBe('Test WABA');
        expect(result.currency).toBe('USD');
        expect(result.template_namespace).toBe('ns_123');
    });
});

// ── Group 2 — Session Messages ────────────────────────────────────────────────

describe('send_text', () => {
    it('returns message_id on success', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_1' }] }));
        const result = await getToolResult('send_text', { to: '15551234567', text: 'Hello!' });
        expect(result.message_id).toBe('msg_1');
        expect(result.to).toBe('15551234567');
        expect(result.status).toBe('sent');
    });

    it('missing to returns validation error', async () => {
        const body = await callTool('send_text', { text: 'Hello' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('to');
    });

    it('missing text returns validation error', async () => {
        const body = await callTool('send_text', { to: '15551234567' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('text');
    });
});

describe('send_image', () => {
    it('with image_url sends link field', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_img_1' }] }));
        const result = await getToolResult('send_image', {
            to: '15551234567',
            image_url: 'https://example.com/image.jpg',
            caption: 'Nice image',
        });
        expect(result.message_id).toBe('msg_img_1');
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { image: { link: string } };
        expect(body.image.link).toBe('https://example.com/image.jpg');
    });

    it('with media_id sends id field', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_img_2' }] }));
        await getToolResult('send_image', { to: '15551234567', media_id: 'media_123' });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { image: { id: string } };
        expect(body.image.id).toBe('media_123');
    });

    it('missing both image_url and media_id returns error', async () => {
        const body = await callTool('send_image', { to: '15551234567' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('image_url');
    });
});

describe('send_document', () => {
    it('happy path with document_url', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_doc_1' }] }));
        const result = await getToolResult('send_document', {
            to: '15551234567',
            document_url: 'https://example.com/report.pdf',
            filename: 'report.pdf',
        });
        expect(result.message_id).toBe('msg_doc_1');
        expect(result.status).toBe('sent');
    });

    it('missing both document_url and media_id returns error', async () => {
        const body = await callTool('send_document', { to: '15551234567' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('document_url');
    });
});

describe('send_video', () => {
    it('happy path with video_url', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_vid_1' }] }));
        const result = await getToolResult('send_video', {
            to: '15551234567',
            video_url: 'https://example.com/video.mp4',
        });
        expect(result.message_id).toBe('msg_vid_1');
    });

    it('missing both video_url and media_id returns error', async () => {
        const body = await callTool('send_video', { to: '15551234567' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('video_url');
    });
});

describe('send_audio', () => {
    it('happy path with audio_url', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_aud_1' }] }));
        const result = await getToolResult('send_audio', {
            to: '15551234567',
            audio_url: 'https://example.com/voice.mp3',
        });
        expect(result.message_id).toBe('msg_aud_1');
    });

    it('missing both audio_url and media_id returns error', async () => {
        const body = await callTool('send_audio', { to: '15551234567' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('audio_url');
    });
});

describe('send_location', () => {
    it('sends latitude and longitude in body', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_loc_1' }] }));
        await getToolResult('send_location', {
            to: '15551234567',
            latitude: 37.7749,
            longitude: -122.4194,
            name: 'SF HQ',
            address: '123 Market St',
        });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { location: { latitude: number; longitude: number } };
        expect(body.location.latitude).toBe(37.7749);
        expect(body.location.longitude).toBe(-122.4194);
    });
});

describe('send_reaction', () => {
    it('sends reaction with emoji in body', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_react_1' }] }));
        const result = await getToolResult('send_reaction', {
            to: '15551234567',
            message_id: 'wamid.orig_msg_123',
            emoji: '👍',
        });
        expect(result.reacted_to_message_id).toBe('wamid.orig_msg_123');
        expect(result.emoji).toBe('👍');
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { reaction: { message_id: string; emoji: string } };
        expect(body.reaction.emoji).toBe('👍');
    });
});

// ── Group 3 — Interactive Messages ────────────────────────────────────────────

describe('send_buttons', () => {
    it('sends interactive button message with 3 buttons', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_btn_1' }] }));
        const result = await getToolResult('send_buttons', {
            to: '15551234567',
            body: 'How was your experience?',
            buttons: [
                { id: 'btn_great', title: 'Great!' },
                { id: 'btn_ok', title: 'OK' },
                { id: 'btn_bad', title: 'Bad' },
            ],
        });
        expect(result.message_id).toBe('msg_btn_1');
        expect(result.button_count).toBe(3);
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { interactive: { type: string; action: { buttons: unknown[] } } };
        expect(body.interactive.type).toBe('button');
        expect(body.interactive.action.buttons).toHaveLength(3);
    });

    it('4 buttons returns validation error', async () => {
        const body = await callTool('send_buttons', {
            to: '15551234567',
            body: 'Too many buttons',
            buttons: [
                { id: 'b1', title: 'One' },
                { id: 'b2', title: 'Two' },
                { id: 'b3', title: 'Three' },
                { id: 'b4', title: 'Four' },
            ],
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('1-3');
    });
});

describe('send_list', () => {
    it('sends interactive list message with sections', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_list_1' }] }));
        const result = await getToolResult('send_list', {
            to: '15551234567',
            body: 'Choose a shipping option',
            button_label: 'View Options',
            sections: [
                {
                    title: 'Standard',
                    rows: [
                        { id: 'std_3d', title: '3-Day Shipping', description: 'Free' },
                        { id: 'std_5d', title: '5-Day Shipping', description: 'Free' },
                    ],
                },
                {
                    title: 'Express',
                    rows: [
                        { id: 'exp_1d', title: 'Next Day', description: '$9.99' },
                    ],
                },
            ],
        });
        expect(result.message_id).toBe('msg_list_1');
        expect(result.total_rows).toBe(3);
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { interactive: { type: string } };
        expect(body.interactive.type).toBe('list');
    });

    it('11 rows total returns validation error', async () => {
        const rows = Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` }));
        const body = await callTool('send_list', {
            to: '15551234567',
            body: 'Pick one',
            button_label: 'Open',
            sections: [{ rows }],
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('max 10 rows');
    });
});

describe('send_cta_url', () => {
    it('sends CTA URL interactive message', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_cta_1' }] }));
        const result = await getToolResult('send_cta_url', {
            to: '15551234567',
            body: 'Track your order',
            button_text: 'Track Order',
            url: 'https://tracking.example.com/order/123',
        });
        expect(result.message_id).toBe('msg_cta_1');
        expect(result.url).toBe('https://tracking.example.com/order/123');
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { interactive: { type: string; action: { parameters: { url: string } } } };
        expect(body.interactive.type).toBe('cta_url');
        expect(body.interactive.action.parameters.url).toBe('https://tracking.example.com/order/123');
    });
});

// ── Group 4 — Template Messages ───────────────────────────────────────────────

describe('list_templates', () => {
    it('returns array of templates', async () => {
        mockFetch.mockReturnValueOnce(metaOk({
            data: [
                { id: 't1', name: 'order_confirmation', status: 'APPROVED', category: 'UTILITY', language: 'en_US', components: [{ type: 'BODY' }] },
                { id: 't2', name: 'promo_spring', status: 'PENDING', category: 'MARKETING', language: 'en_US', components: [{ type: 'HEADER' }, { type: 'BODY' }] },
            ],
        }));
        const result = await getToolResult('list_templates', {}, { wabaId: WABA_ID });
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('order_confirmation');
        expect(result[0].status).toBe('APPROVED');
    });

    it('without wabaId returns -32002 error', async () => {
        const body = await callTool('list_templates', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32002);
    });

    it('with status filter includes status param in fetch URL', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ data: [] }));
        await getToolResult('list_templates', { status: 'APPROVED' }, { wabaId: WABA_ID });
        const call = mockFetch.mock.calls[0];
        const url = call[0] as string;
        expect(url).toContain('status=APPROVED');
    });
});

describe('get_template', () => {
    it('returns template with components', async () => {
        mockFetch.mockReturnValueOnce(metaOk({
            id: 'tmpl_123',
            name: 'order_confirmation',
            status: 'APPROVED',
            category: 'UTILITY',
            language: 'en_US',
            components: [
                { type: 'BODY', text: 'Your order {{1}} has been confirmed.' },
            ],
            rejected_reason: null,
            quality_score: { score: 'HIGH' },
        }));
        const result = await getToolResult('get_template', { template_id: 'tmpl_123' });
        expect(result.id).toBe('tmpl_123');
        expect(result.status).toBe('APPROVED');
        expect(Array.isArray(result.components)).toBe(true);
        expect(result.components).toHaveLength(1);
    });
});

describe('send_template', () => {
    it('sends template with name and language code', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_tmpl_1' }] }));
        const result = await getToolResult('send_template', {
            to: '15551234567',
            template_name: 'order_confirmation',
            language_code: 'en_US',
        });
        expect(result.message_id).toBe('msg_tmpl_1');
        expect(result.template_name).toBe('order_confirmation');
        expect(result.language_code).toBe('en_US');
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { template: { name: string; language: { code: string } } };
        expect(body.template.name).toBe('order_confirmation');
        expect(body.template.language.code).toBe('en_US');
    });

    it('with body_variables includes body component with parameters', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_tmpl_2' }] }));
        await getToolResult('send_template', {
            to: '15551234567',
            template_name: 'order_shipped',
            language_code: 'en_US',
            body_variables: ['ORD-12345', '2026-03-15'],
        });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as {
            template: { components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }> };
        };
        const bodyComponent = body.template.components.find(c => c.type === 'body');
        expect(bodyComponent).toBeDefined();
        expect(bodyComponent!.parameters).toHaveLength(2);
        expect(bodyComponent!.parameters[0].text).toBe('ORD-12345');
    });

    it('with header_media_url includes header component with image', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ messages: [{ id: 'msg_tmpl_3' }] }));
        await getToolResult('send_template', {
            to: '15551234567',
            template_name: 'promo_with_image',
            language_code: 'en_US',
            header_media_url: 'https://example.com/promo.jpg',
        });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as {
            template: { components: Array<{ type: string; parameters: Array<{ type: string; image: { link: string } }> }> };
        };
        const headerComponent = body.template.components.find(c => c.type === 'header');
        expect(headerComponent).toBeDefined();
        expect(headerComponent!.parameters[0].type).toBe('image');
        expect(headerComponent!.parameters[0].image.link).toBe('https://example.com/promo.jpg');
    });
});

describe('create_template', () => {
    it('creates template and returns PENDING status', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ id: 'new_tmpl_123', status: 'PENDING' }));
        const result = await getToolResult('create_template', {
            name: 'shipping_notification',
            category: 'UTILITY',
            language: 'en_US',
            body: 'Your order {{1}} has shipped! Track it at {{2}}',
        }, { wabaId: WABA_ID });
        expect(result.status).toBe('PENDING');
        expect(result.name).toBe('shipping_notification');
        expect(result.message).toContain('review');
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { name: string; category: string; components: unknown[] };
        expect(reqBody.name).toBe('shipping_notification');
        expect(reqBody.category).toBe('UTILITY');
        expect(Array.isArray(reqBody.components)).toBe(true);
    });

    it('without wabaId returns -32002 error', async () => {
        const body = await callTool('create_template', {
            name: 'test_tmpl',
            category: 'UTILITY',
            language: 'en_US',
            body: 'Hello {{1}}',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32002);
    });
});

describe('delete_template', () => {
    it('calls DELETE and returns success', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ success: true }));
        const result = await getToolResult('delete_template', { template_name: 'old_promo' }, { wabaId: WABA_ID });
        expect(result.success).toBe(true);
        expect(result.deleted_template).toBe('old_promo');
        const call = mockFetch.mock.calls[0];
        expect(call[0] as string).toContain('name=old_promo');
        expect((call[1] as { method: string }).method).toBe('DELETE');
    });

    it('without wabaId returns -32002 error', async () => {
        const body = await callTool('delete_template', { template_name: 'old_promo' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32002);
    });
});

// ── Group 5 — Message Management ──────────────────────────────────────────────

describe('mark_as_read', () => {
    it('sends status read with message_id', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ success: true }));
        const result = await getToolResult('mark_as_read', { message_id: 'wamid.recv_123' });
        expect(result.success).toBe(true);
        expect(result.message_id).toBe('wamid.recv_123');
        expect(result.status).toBe('read');
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { status: string; message_id: string };
        expect(body.status).toBe('read');
        expect(body.message_id).toBe('wamid.recv_123');
    });
});

describe('delete_message', () => {
    it('calls DELETE and returns success', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ success: true }));
        const result = await getToolResult('delete_message', { message_id: 'wamid.sent_456' });
        expect(result.success).toBe(true);
        expect(result.deleted_message_id).toBe('wamid.sent_456');
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('DELETE');
    });
});

describe('get_message_status', () => {
    it('returns documentation note without calling fetch', async () => {
        const result = await getToolResult('get_message_status');
        expect(result.note).toContain('webhook');
        expect(result.note).toContain('sent');
        expect(result.note).toContain('delivered');
        expect(result.note).toContain('read');
        // fetch should NOT have been called
        expect(mockFetch).not.toHaveBeenCalled();
    });
});

// ── Group 6 — Media ───────────────────────────────────────────────────────────

describe('get_media_url', () => {
    it('returns url with expiry note', async () => {
        mockFetch.mockReturnValueOnce(metaOk({
            id: 'media_123',
            url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=media_123',
            mime_type: 'image/jpeg',
            sha256: 'abc123hash',
            file_size: 52000,
        }));
        const result = await getToolResult('get_media_url', { media_id: 'media_123' });
        expect(result.url).toContain('https://');
        expect(result.note).toContain('5 minutes');
        expect(result.mime_type).toBe('image/jpeg');
    });
});

describe('delete_media', () => {
    it('calls DELETE on media_id and returns success', async () => {
        mockFetch.mockReturnValueOnce(metaOk({ deleted: true }));
        const result = await getToolResult('delete_media', { media_id: 'media_to_delete' });
        expect(result.success).toBe(true);
        expect(result.deleted_media_id).toBe('media_to_delete');
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('DELETE');
        expect(call[0] as string).toContain('media_to_delete');
    });
});

// ── Error mapping ─────────────────────────────────────────────────────────────

describe('Error mapping', () => {
    it('code 131047 → message contains "24-hour window"', async () => {
        mockFetch.mockReturnValueOnce(metaErr(131047, undefined, 'Re-engagement message'));
        const body = await callTool('send_text', { to: '15551234567', text: 'hi' });
        expect(body.error!.message).toContain('24-hour window');
    });

    it('code 131030 → message contains "allowlist"', async () => {
        mockFetch.mockReturnValueOnce(metaErr(131030, undefined, 'Number not allowed'));
        const body = await callTool('send_text', { to: '15551234567', text: 'hi' });
        expect(body.error!.message).toContain('allowlist');
    });

    it('code 132000 → message contains "not found or not yet approved"', async () => {
        mockFetch.mockReturnValueOnce(metaErr(132000, undefined, 'Template not found'));
        const body = await callTool('send_template', { to: '15551234567', template_name: 'x', language_code: 'en_US' });
        expect(body.error!.message).toContain('not found or not yet approved');
    });

    it('code 132007 → message contains "variable count mismatch"', async () => {
        mockFetch.mockReturnValueOnce(metaErr(132007, undefined, 'Param count wrong'));
        const body = await callTool('send_template', { to: '15551234567', template_name: 'x', language_code: 'en_US' });
        expect(body.error!.message).toContain('variable count mismatch');
    });

    it('code 200 → message contains "Permission denied"', async () => {
        mockFetch.mockReturnValueOnce(metaErr(200, undefined, 'Permission denied'));
        const body = await callTool('send_text', { to: '15551234567', text: 'hi' });
        expect(body.error!.message).toContain('Permission denied');
    });

    it('code 133004 → message contains "deregistered"', async () => {
        mockFetch.mockReturnValueOnce(metaErr(133004, undefined, 'Number deregistered'));
        const body = await callTool('send_text', { to: '15551234567', text: 'hi' });
        expect(body.error!.message).toContain('deregistered');
    });

    it('code 131026 → message contains "undeliverable"', async () => {
        mockFetch.mockReturnValueOnce(metaErr(131026, undefined, 'Undeliverable'));
        const body = await callTool('send_text', { to: '15551234567', text: 'hi' });
        expect(body.error!.message).toContain('undeliverable');
    });

    it('unknown code → generic message with code number', async () => {
        mockFetch.mockReturnValueOnce(metaErr(999, undefined, 'Unknown error occurred'));
        const body = await callTool('send_text', { to: '15551234567', text: 'hi' });
        expect(body.error!.message).toContain('999');
    });
});

// ── E2E tests (skipped unless env vars set) ───────────────────────────────────

describe.skipIf(!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID)(
    'E2E — real Meta API',
    () => {
        const e2eToken = process.env.WHATSAPP_ACCESS_TOKEN!;
        const e2ePhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
        const e2eWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '';

        function makeE2EReq(toolName: string, args: Record<string, unknown>) {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-WHATSAPP-ACCESS-TOKEN': e2eToken,
                'X-Mcp-Secret-WHATSAPP-PHONE-NUMBER-ID': e2ePhoneId,
            };
            if (e2eWabaId) headers['X-Mcp-Secret-WHATSAPP-BUSINESS-ACCOUNT-ID'] = e2eWabaId;
            return new Request('http://localhost/', {
                method: 'POST',
                headers,
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: toolName, arguments: args } }),
            });
        }

        it('get_phone_number_info works with real token', async () => {
            vi.restoreAllMocks();
            const req = makeE2EReq('get_phone_number_info', {});
            const res = await worker.fetch(req);
            const body = await res.json() as { result?: { content: [{ text: string }] } };
            expect(body.result).toBeDefined();
            const result = JSON.parse(body.result!.content[0].text) as { display_phone_number: string };
            expect(result.display_phone_number).toBeTruthy();
        });

        it('get_business_profile works', async () => {
            vi.restoreAllMocks();
            const req = makeE2EReq('get_business_profile', {});
            const res = await worker.fetch(req);
            const body = await res.json() as { result?: { content: [{ text: string }] } };
            expect(body.result).toBeDefined();
        });

        it('list_templates works', async () => {
            if (!e2eWabaId) return;
            vi.restoreAllMocks();
            const req = makeE2EReq('list_templates', {});
            const res = await worker.fetch(req);
            const body = await res.json() as { result?: { content: [{ text: string }] } };
            expect(body.result).toBeDefined();
            const result = JSON.parse(body.result!.content[0].text);
            expect(Array.isArray(result)).toBe(true);
        });
    },
);
