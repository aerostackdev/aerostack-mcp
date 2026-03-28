/**
 * ActiveCampaign MCP Worker
 * Implements MCP protocol over HTTP for ActiveCampaign CRM & marketing automation operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   ACTIVECAMPAIGN_API_URL  → X-Mcp-Secret-ACTIVECAMPAIGN-API-URL  (e.g. https://youracccount.api-us1.com)
 *   ACTIVECAMPAIGN_API_KEY  → X-Mcp-Secret-ACTIVECAMPAIGN-API-KEY  (found in AC Settings → Developer)
 *
 * Auth format: Api-Token: {API_KEY} header on all requests
 * Base URL: {ACTIVECAMPAIGN_API_URL}/api/3
 *
 * Covers: Contacts (7), Lists & Tags (4), Campaigns & Automations (5), Deals & CRM (6) = 22 tools total
 */

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

function getSecrets(request: Request): { apiUrl: string | null; apiKey: string | null } {
    return {
        apiUrl: request.headers.get('X-Mcp-Secret-ACTIVECAMPAIGN-API-URL'),
        apiKey: request.headers.get('X-Mcp-Secret-ACTIVECAMPAIGN-API-KEY'),
    };
}

const AC_ALLOWED_HOST_PATTERN = /^https:\/\/[a-zA-Z0-9-]+\.(api-us1\.com|activehosted\.com|activecampaign\.com)$/;

function validateAcApiUrl(apiUrl: string): void {
    if (!AC_ALLOWED_HOST_PATTERN.test(apiUrl.replace(/\/$/, ''))) {
        throw { code: -32600, message: 'ACTIVECAMPAIGN_API_URL must be a valid ActiveCampaign host (e.g. https://youracccount.api-us1.com)' };
    }
}

function acApiBase(apiUrl: string): string {
    return `${apiUrl.replace(/\/$/, '')}/api/3`;
}

async function acFetch(
    apiUrl: string,
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${acApiBase(apiUrl)}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Api-Token': apiKey,
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
        throw { code: -32603, message: `ActiveCampaign HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'message' in data) {
            msg = (data as { message: string }).message || msg;
        } else if (data && typeof data === 'object' && 'errors' in data) {
            const errors = (data as { errors: Array<{ title?: string; detail?: string }> }).errors;
            if (Array.isArray(errors) && errors.length > 0) {
                msg = errors.map(e => e.title || e.detail || '').filter(Boolean).join(', ') || msg;
            }
        }
        throw { code: -32603, message: `ActiveCampaign API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Contacts (7 tools) ──────────────────────────────────────────

    {
        name: 'list_contacts',
        description: 'List contacts with optional filters. Returns email, firstName, lastName, phone, tags, and list memberships.',
        inputSchema: {
            type: 'object',
            properties: {
                email: {
                    type: 'string',
                    description: 'Filter contacts by email address (exact match)',
                },
                tag: {
                    type: 'string',
                    description: 'Filter contacts by tag name',
                },
                list_id: {
                    type: 'number',
                    description: 'Filter contacts by list ID',
                },
                status: {
                    type: 'number',
                    description: 'Filter by subscription status: 1=subscribed, 2=unsubscribed, 3=bounced',
                },
                limit: {
                    type: 'number',
                    description: 'Number of contacts to return (default 20, max 100)',
                },
                offset: {
                    type: 'number',
                    description: 'Offset for pagination (default 0)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_contact',
        description: 'Get full contact details by ID including email, firstName, lastName, phone, tags, list memberships, custom fields, and deals.',
        inputSchema: {
            type: 'object',
            properties: {
                contact_id: {
                    type: 'number',
                    description: 'ActiveCampaign contact ID',
                },
            },
            required: ['contact_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_contact',
        description: 'Create a new contact in ActiveCampaign. Email is required.',
        inputSchema: {
            type: 'object',
            properties: {
                email: {
                    type: 'string',
                    description: 'Contact email address (required)',
                },
                firstName: {
                    type: 'string',
                    description: 'Contact first name',
                },
                lastName: {
                    type: 'string',
                    description: 'Contact last name',
                },
                phone: {
                    type: 'string',
                    description: 'Contact phone number',
                },
                fieldValues: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            field: { type: 'string', description: 'Custom field ID' },
                            value: { type: 'string', description: 'Custom field value' },
                        },
                    },
                    description: 'Custom field values array',
                },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_contact',
        description: 'Update fields on an existing contact. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                contact_id: {
                    type: 'number',
                    description: 'ActiveCampaign contact ID to update',
                },
                email: { type: 'string', description: 'Updated email address' },
                firstName: { type: 'string', description: 'Updated first name' },
                lastName: { type: 'string', description: 'Updated last name' },
                phone: { type: 'string', description: 'Updated phone number' },
                fieldValues: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            field: { type: 'string', description: 'Custom field ID' },
                            value: { type: 'string', description: 'Custom field value' },
                        },
                    },
                    description: 'Custom field values to update',
                },
            },
            required: ['contact_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_contact',
        description: 'Permanently delete a contact by ID. This action cannot be undone.',
        inputSchema: {
            type: 'object',
            properties: {
                contact_id: {
                    type: 'number',
                    description: 'ActiveCampaign contact ID to delete',
                },
            },
            required: ['contact_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'search_contacts',
        description: 'Search contacts by email, name, or phone. Returns matching contacts.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query — matches against email, first name, last name, or phone',
                },
                limit: {
                    type: 'number',
                    description: 'Number of results to return (default 20)',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_tag_to_contact',
        description: 'Add a tag to a contact by contact ID and tag ID.',
        inputSchema: {
            type: 'object',
            properties: {
                contact_id: {
                    type: 'number',
                    description: 'ActiveCampaign contact ID',
                },
                tag_id: {
                    type: 'number',
                    description: 'Tag ID to add to the contact',
                },
            },
            required: ['contact_id', 'tag_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 2 — Lists & Tags (4 tools) ──────────────────────────────────────

    {
        name: 'list_lists',
        description: 'List all email lists in your ActiveCampaign account with their subscriber counts.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of lists to return (default 100)',
                },
                offset: {
                    type: 'number',
                    description: 'Offset for pagination',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_list',
        description: 'Create a new email list in ActiveCampaign.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'List name (required)',
                },
                string_id: {
                    type: 'string',
                    description: 'Unique string identifier for the list (used in URLs, lowercase letters and hyphens only)',
                },
                sender_name: {
                    type: 'string',
                    description: 'Default sender name for campaigns sent to this list',
                },
                sender_addr1: {
                    type: 'string',
                    description: 'Sender physical address line 1',
                },
                sender_city: {
                    type: 'string',
                    description: 'Sender city',
                },
                sender_country: {
                    type: 'string',
                    description: 'Sender country (2-letter ISO code)',
                },
            },
            required: ['name', 'string_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'subscribe_contact_to_list',
        description: 'Subscribe a contact to a list. Status 1=subscribed, 2=unsubscribed.',
        inputSchema: {
            type: 'object',
            properties: {
                contact_id: {
                    type: 'number',
                    description: 'ActiveCampaign contact ID',
                },
                list_id: {
                    type: 'number',
                    description: 'List ID to subscribe the contact to',
                },
                status: {
                    type: 'number',
                    enum: [1, 2],
                    description: 'Subscription status: 1=subscribed, 2=unsubscribed',
                },
            },
            required: ['contact_id', 'list_id', 'status'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_tags',
        description: 'List all tags, optionally filtered by name search.',
        inputSchema: {
            type: 'object',
            properties: {
                search: {
                    type: 'string',
                    description: 'Search tags by name (partial match)',
                },
                limit: {
                    type: 'number',
                    description: 'Number of tags to return (default 100)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Campaigns & Automations (5 tools) ───────────────────────────

    {
        name: 'list_campaigns',
        description: 'List campaigns filtered by type or status. Returns name, subject, status, and delivery stats.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['single', 'recurring', 'split', 'automated', 'auto_responder'],
                    description: 'Filter by campaign type',
                },
                status: {
                    type: 'number',
                    enum: [0, 1, 2, 3, 4, 5, 6],
                    description: 'Filter by campaign status: 0=draft, 1=scheduled, 2=sending, 3=paused, 4=stopped, 5=completed, 6=split_test',
                },
                limit: {
                    type: 'number',
                    description: 'Number of campaigns to return (default 20)',
                },
                offset: {
                    type: 'number',
                    description: 'Offset for pagination',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_campaign',
        description: 'Get campaign details including name, subject, status, open rate, click rate, and total sent count.',
        inputSchema: {
            type: 'object',
            properties: {
                campaign_id: {
                    type: 'number',
                    description: 'ActiveCampaign campaign ID',
                },
            },
            required: ['campaign_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_automations',
        description: 'List all automations in your account, optionally filtered to active or inactive.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'number',
                    enum: [0, 1],
                    description: 'Filter by status: 1=active, 0=inactive',
                },
                limit: {
                    type: 'number',
                    description: 'Number of automations to return (default 20)',
                },
                offset: {
                    type: 'number',
                    description: 'Offset for pagination',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_automation',
        description: 'Get automation details including name, status, number of contacts in the automation, and steps.',
        inputSchema: {
            type: 'object',
            properties: {
                automation_id: {
                    type: 'number',
                    description: 'ActiveCampaign automation ID',
                },
            },
            required: ['automation_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_contact_to_automation',
        description: 'Add a contact to an automation to trigger it for that contact.',
        inputSchema: {
            type: 'object',
            properties: {
                contact_id: {
                    type: 'number',
                    description: 'ActiveCampaign contact ID',
                },
                automation_id: {
                    type: 'number',
                    description: 'Automation ID to add the contact to',
                },
            },
            required: ['contact_id', 'automation_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Deals & CRM (6 tools) ───────────────────────────────────────

    {
        name: 'list_deals',
        description: 'List deals with optional filters. Returns title, value, currency, stage, owner, and contact.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'number',
                    enum: [0, 1, 2],
                    description: 'Filter by deal status: 0=open, 1=won, 2=lost',
                },
                owner: {
                    type: 'number',
                    description: 'Filter by deal owner user ID',
                },
                stage: {
                    type: 'number',
                    description: 'Filter by pipeline stage ID',
                },
                limit: {
                    type: 'number',
                    description: 'Number of deals to return (default 20)',
                },
                offset: {
                    type: 'number',
                    description: 'Offset for pagination',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_deal',
        description: 'Get full deal details including title, value, currency, stage, owner, and associated contact.',
        inputSchema: {
            type: 'object',
            properties: {
                deal_id: {
                    type: 'number',
                    description: 'ActiveCampaign deal ID',
                },
            },
            required: ['deal_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_deal',
        description: 'Create a new deal in ActiveCampaign CRM. Title, value, currency, and pipeline are required.',
        inputSchema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Deal title/name (required)',
                },
                value: {
                    type: 'number',
                    description: 'Deal value in cents (e.g. 150000 = $1,500.00) (required)',
                },
                currency: {
                    type: 'string',
                    description: 'Currency code in lowercase (e.g. usd, eur, gbp) (required)',
                },
                group: {
                    type: 'string',
                    description: 'Pipeline ID to add this deal to (required)',
                },
                stage: {
                    type: 'string',
                    description: 'Pipeline stage ID',
                },
                owner: {
                    type: 'string',
                    description: 'User ID of the deal owner',
                },
                contact: {
                    type: 'number',
                    description: 'Contact ID to associate with this deal',
                },
                status: {
                    type: 'number',
                    enum: [0, 1, 2],
                    description: 'Deal status: 0=open, 1=won, 2=lost (default 0)',
                },
            },
            required: ['title', 'value', 'currency', 'group'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_deal',
        description: 'Update deal fields including stage, value, status, and notes.',
        inputSchema: {
            type: 'object',
            properties: {
                deal_id: {
                    type: 'number',
                    description: 'ActiveCampaign deal ID to update',
                },
                title: { type: 'string', description: 'Updated deal title' },
                value: { type: 'number', description: 'Updated deal value in cents' },
                currency: { type: 'string', description: 'Updated currency code' },
                stage: { type: 'string', description: 'Updated pipeline stage ID' },
                status: {
                    type: 'number',
                    enum: [0, 1, 2],
                    description: 'Updated status: 0=open, 1=won, 2=lost',
                },
                owner: { type: 'string', description: 'Updated owner user ID' },
            },
            required: ['deal_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_pipelines',
        description: 'List all CRM pipelines with their stages.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of pipelines to return (default 20)',
                },
                offset: {
                    type: 'number',
                    description: 'Offset for pagination',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_deal_note',
        description: 'Add a note to a deal.',
        inputSchema: {
            type: 'object',
            properties: {
                deal_id: {
                    type: 'number',
                    description: 'ActiveCampaign deal ID to add the note to',
                },
                note: {
                    type: 'string',
                    description: 'Note content text (required)',
                },
            },
            required: ['deal_id', 'note'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── _ping ─────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify ActiveCampaign credentials by calling a lightweight read endpoint. Returns a success message if credentials are valid.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiUrl: string,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        // ── Contacts ────────────────────────────────────────────────────────────

        case 'list_contacts': {
            const params = new URLSearchParams();
            if (args.email) params.set('email', args.email as string);
            if (args.tag) params.set('tag', args.tag as string);
            if (args.list_id) params.set('listid', String(args.list_id));
            if (args.status !== undefined) params.set('status', String(args.status));
            params.set('limit', String(args.limit ?? 20));
            if (args.offset) params.set('offset', String(args.offset));
            return acFetch(apiUrl, `/contacts?${params.toString()}`, apiKey);
        }

        case 'get_contact': {
            validateRequired(args, ['contact_id']);
            return acFetch(apiUrl, `/contacts/${args.contact_id}`, apiKey);
        }

        case 'create_contact': {
            validateRequired(args, ['email']);
            const contact: Record<string, unknown> = { email: args.email };
            if (args.firstName !== undefined) contact.firstName = args.firstName;
            if (args.lastName !== undefined) contact.lastName = args.lastName;
            if (args.phone !== undefined) contact.phone = args.phone;
            if (args.fieldValues !== undefined) contact.fieldValues = args.fieldValues;
            return acFetch(apiUrl, '/contacts', apiKey, {
                method: 'POST',
                body: JSON.stringify({ contact }),
            });
        }

        case 'update_contact': {
            validateRequired(args, ['contact_id']);
            const { contact_id, ...rest } = args;
            const contact: Record<string, unknown> = {};
            for (const key of ['email', 'firstName', 'lastName', 'phone', 'fieldValues']) {
                if (rest[key] !== undefined) contact[key] = rest[key];
            }
            return acFetch(apiUrl, `/contacts/${contact_id}`, apiKey, {
                method: 'PUT',
                body: JSON.stringify({ contact }),
            });
        }

        case 'delete_contact': {
            validateRequired(args, ['contact_id']);
            return acFetch(apiUrl, `/contacts/${args.contact_id}`, apiKey, {
                method: 'DELETE',
            });
        }

        case 'search_contacts': {
            validateRequired(args, ['query']);
            const params = new URLSearchParams();
            params.set('search', args.query as string);
            params.set('limit', String(args.limit ?? 20));
            return acFetch(apiUrl, `/contacts?${params.toString()}`, apiKey);
        }

        case 'add_tag_to_contact': {
            validateRequired(args, ['contact_id', 'tag_id']);
            return acFetch(apiUrl, '/contactTags', apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    contactTag: {
                        contact: String(args.contact_id),
                        tag: String(args.tag_id),
                    },
                }),
            });
        }

        // ── Lists & Tags ────────────────────────────────────────────────────────

        case 'list_lists': {
            const params = new URLSearchParams();
            params.set('limit', String(args.limit ?? 100));
            if (args.offset) params.set('offset', String(args.offset));
            return acFetch(apiUrl, `/lists?${params.toString()}`, apiKey);
        }

        case 'create_list': {
            validateRequired(args, ['name', 'string_id']);
            const list: Record<string, unknown> = {
                name: args.name,
                stringid: args.string_id,
            };
            if (args.sender_name !== undefined) list.sender_name = args.sender_name;
            if (args.sender_addr1 !== undefined) list.sender_addr1 = args.sender_addr1;
            if (args.sender_city !== undefined) list.sender_city = args.sender_city;
            if (args.sender_country !== undefined) list.sender_country = args.sender_country;
            return acFetch(apiUrl, '/lists', apiKey, {
                method: 'POST',
                body: JSON.stringify({ list }),
            });
        }

        case 'subscribe_contact_to_list': {
            validateRequired(args, ['contact_id', 'list_id', 'status']);
            return acFetch(apiUrl, '/contactLists', apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    contactList: {
                        list: String(args.list_id),
                        contact: String(args.contact_id),
                        status: args.status,
                    },
                }),
            });
        }

        case 'list_tags': {
            const params = new URLSearchParams();
            if (args.search) params.set('search', args.search as string);
            params.set('limit', String(args.limit ?? 100));
            const qs = params.toString();
            return acFetch(apiUrl, `/tags?${qs}`, apiKey);
        }

        // ── Campaigns & Automations ─────────────────────────────────────────────

        case 'list_campaigns': {
            const params = new URLSearchParams();
            if (args.type) params.set('type', args.type as string);
            if (args.status !== undefined) params.set('status', String(args.status));
            params.set('limit', String(args.limit ?? 20));
            if (args.offset) params.set('offset', String(args.offset));
            return acFetch(apiUrl, `/campaigns?${params.toString()}`, apiKey);
        }

        case 'get_campaign': {
            validateRequired(args, ['campaign_id']);
            return acFetch(apiUrl, `/campaigns/${args.campaign_id}`, apiKey);
        }

        case 'list_automations': {
            const params = new URLSearchParams();
            if (args.status !== undefined) params.set('status', String(args.status));
            params.set('limit', String(args.limit ?? 20));
            if (args.offset) params.set('offset', String(args.offset));
            return acFetch(apiUrl, `/automations?${params.toString()}`, apiKey);
        }

        case 'get_automation': {
            validateRequired(args, ['automation_id']);
            return acFetch(apiUrl, `/automations/${args.automation_id}`, apiKey);
        }

        case 'add_contact_to_automation': {
            validateRequired(args, ['contact_id', 'automation_id']);
            return acFetch(apiUrl, '/contactAutomations', apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    contactAutomation: {
                        contact: String(args.contact_id),
                        automation: String(args.automation_id),
                    },
                }),
            });
        }

        // ── Deals & CRM ─────────────────────────────────────────────────────────

        case 'list_deals': {
            const params = new URLSearchParams();
            if (args.status !== undefined) params.set('status', String(args.status));
            if (args.owner !== undefined) params.set('owner', String(args.owner));
            if (args.stage !== undefined) params.set('stage', String(args.stage));
            params.set('limit', String(args.limit ?? 20));
            if (args.offset) params.set('offset', String(args.offset));
            return acFetch(apiUrl, `/deals?${params.toString()}`, apiKey);
        }

        case 'get_deal': {
            validateRequired(args, ['deal_id']);
            return acFetch(apiUrl, `/deals/${args.deal_id}`, apiKey);
        }

        case 'create_deal': {
            validateRequired(args, ['title', 'value', 'currency', 'group']);
            const deal: Record<string, unknown> = {
                title: args.title,
                value: args.value,
                currency: args.currency,
                group: String(args.group),
            };
            if (args.stage !== undefined) deal.stage = String(args.stage);
            if (args.owner !== undefined) deal.owner = String(args.owner);
            if (args.contact !== undefined) deal.contact = String(args.contact);
            if (args.status !== undefined) deal.status = args.status;
            return acFetch(apiUrl, '/deals', apiKey, {
                method: 'POST',
                body: JSON.stringify({ deal }),
            });
        }

        case 'update_deal': {
            validateRequired(args, ['deal_id']);
            const { deal_id, ...rest } = args;
            const deal: Record<string, unknown> = {};
            for (const key of ['title', 'value', 'currency', 'status', 'owner']) {
                if (rest[key] !== undefined) deal[key] = rest[key];
            }
            if (rest.stage !== undefined) deal.stage = String(rest.stage);
            return acFetch(apiUrl, `/deals/${deal_id}`, apiKey, {
                method: 'PUT',
                body: JSON.stringify({ deal }),
            });
        }

        case 'list_pipelines': {
            const params = new URLSearchParams();
            params.set('limit', String(args.limit ?? 20));
            if (args.offset) params.set('offset', String(args.offset));
            return acFetch(apiUrl, `/dealGroups?${params.toString()}`, apiKey);
        }

        case 'create_deal_note': {
            validateRequired(args, ['deal_id', 'note']);
            return acFetch(apiUrl, `/deals/${args.deal_id}/notes`, apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    note: {
                        note: args.note,
                    },
                }),
            });
        }

        // ── Ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            const data = await acFetch(apiUrl, '/accounts?limit=1', apiKey);
            return { ok: true, message: 'ActiveCampaign credentials valid', sample: data };
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
                JSON.stringify({ status: 'ok', server: 'mcp-activecampaign', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-activecampaign', version: '1.0.0' },
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
            const { apiUrl, apiKey } = getSecrets(request);
            if (!apiUrl || !apiKey) {
                const missing = [];
                if (!apiUrl) missing.push('ACTIVECAMPAIGN_API_URL (header: X-Mcp-Secret-ACTIVECAMPAIGN-API-URL)');
                if (!apiKey) missing.push('ACTIVECAMPAIGN_API_KEY (header: X-Mcp-Secret-ACTIVECAMPAIGN-API-KEY)');
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                validateAcApiUrl(apiUrl);
            } catch (err: unknown) {
                const e = err as { code: number; message: string };
                return rpcErr(id, e.code, e.message);
            }

            try {
                const result = await callTool(toolName, args, apiUrl, apiKey);
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
