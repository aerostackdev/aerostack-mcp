/**
 * Salesforce MCP Worker
 * Implements MCP protocol over HTTP for Salesforce CRM operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   SALESFORCE_ACCESS_TOKEN  → X-Mcp-Secret-SALESFORCE-ACCESS-TOKEN  (OAuth 2.0 access token)
 *   SALESFORCE_INSTANCE_URL  → X-Mcp-Secret-SALESFORCE-INSTANCE-URL  (e.g. https://yourorg.my.salesforce.com)
 *
 * Auth format: Authorization: Bearer {access_token}
 *
 * Covers: Leads (5), Contacts (5), Accounts (5), Opportunities (5),
 *         Tasks & Activities (3), SOQL (2) = 25 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const SF_API_VERSION = 'v59.0';

function sfApiBase(instanceUrl: string): string {
    return `${instanceUrl}/services/data/${SF_API_VERSION}`;
}

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

function getSecrets(request: Request): { token: string | null; instanceUrl: string | null } {
    return {
        token: request.headers.get('X-Mcp-Secret-SALESFORCE-ACCESS-TOKEN'),
        instanceUrl: request.headers.get('X-Mcp-Secret-SALESFORCE-INSTANCE-URL'),
    };
}

async function sfFetch(
    instanceUrl: string,
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${sfApiBase(instanceUrl)}${path}`;
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
        throw { code: -32603, message: `Salesforce HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (Array.isArray(data)) {
            msg = (data as Array<{ message?: string }>)[0]?.message || msg;
        } else if (data && typeof data === 'object') {
            msg = (data as { message?: string }).message || msg;
        }
        throw { code: -32603, message: `Salesforce API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Leads (5 tools) ─────────────────────────────────────────────

    {
        name: 'search_leads',
        description: 'Search leads by any field (e.g. Email, LastName, Company). Returns Id, FirstName, LastName, Email, Company, Status, Phone.',
        inputSchema: {
            type: 'object',
            properties: {
                field: {
                    type: 'string',
                    description: 'Field to search on (e.g. Email, LastName, Company)',
                },
                value: {
                    type: 'string',
                    description: 'Value to search for (prefix match using LIKE)',
                },
                limit: {
                    type: 'number',
                    description: 'Max number of leads to return (default 20)',
                },
            },
            required: ['field', 'value'],
        },
    },
    {
        name: 'get_lead',
        description: 'Get full details of a specific lead by Salesforce record ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Salesforce Lead record ID (18-character, e.g. 00Qxx000000XXXXX)',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'create_lead',
        description: 'Create a new lead in Salesforce. LastName and Company are required.',
        inputSchema: {
            type: 'object',
            properties: {
                LastName: { type: 'string', description: 'Lead last name (required)' },
                FirstName: { type: 'string', description: 'Lead first name' },
                Email: { type: 'string', description: 'Lead email address' },
                Company: { type: 'string', description: 'Company or organization name (required)' },
                Phone: { type: 'string', description: 'Lead phone number' },
                LeadSource: {
                    type: 'string',
                    description: 'Lead source (e.g. Web, Phone Inquiry, Partner Referral, Advertisement)',
                },
            },
            required: ['LastName', 'Company'],
        },
    },
    {
        name: 'update_lead',
        description: 'Update fields on an existing lead. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Salesforce Lead record ID' },
                FirstName: { type: 'string' },
                LastName: { type: 'string' },
                Email: { type: 'string' },
                Company: { type: 'string' },
                Phone: { type: 'string' },
                Status: {
                    type: 'string',
                    description: 'Lead status (e.g. Open - Not Contacted, Working - Contacted, Closed - Converted, Closed - Not Converted)',
                },
                LeadSource: { type: 'string' },
            },
            required: ['id'],
        },
    },
    {
        name: 'convert_lead',
        description: 'Convert a lead to a contact and optionally create an opportunity. Uses the Salesforce convertLead action.',
        inputSchema: {
            type: 'object',
            properties: {
                lead_id: { type: 'string', description: 'Salesforce Lead record ID to convert' },
                converted_status: {
                    type: 'string',
                    description: 'Converted lead status value (must match a converted status in your org, e.g. "Closed - Converted")',
                },
                create_opportunity: {
                    type: 'boolean',
                    description: 'Whether to create an opportunity on conversion (default true)',
                },
            },
            required: ['lead_id', 'converted_status'],
        },
    },

    // ── Group 2 — Contacts (5 tools) ──────────────────────────────────────────

    {
        name: 'search_contacts',
        description: 'Search contacts by any field (e.g. Email, LastName). Returns Id, FirstName, LastName, Email, Phone, AccountId.',
        inputSchema: {
            type: 'object',
            properties: {
                field: {
                    type: 'string',
                    description: 'Field to search on (e.g. Email, LastName, Phone)',
                },
                value: {
                    type: 'string',
                    description: 'Value to search for (prefix match using LIKE)',
                },
                limit: {
                    type: 'number',
                    description: 'Max number of contacts to return (default 20)',
                },
            },
            required: ['field', 'value'],
        },
    },
    {
        name: 'get_contact',
        description: 'Get full details of a specific contact by Salesforce record ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Salesforce Contact record ID (18-character)',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'create_contact',
        description: 'Create a new contact in Salesforce. LastName is required.',
        inputSchema: {
            type: 'object',
            properties: {
                LastName: { type: 'string', description: 'Contact last name (required)' },
                FirstName: { type: 'string', description: 'Contact first name' },
                Email: { type: 'string', description: 'Contact email address' },
                Phone: { type: 'string', description: 'Contact phone number' },
                AccountId: { type: 'string', description: 'Salesforce Account ID to associate the contact with' },
            },
            required: ['LastName'],
        },
    },
    {
        name: 'update_contact',
        description: 'Update fields on an existing contact. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Salesforce Contact record ID' },
                FirstName: { type: 'string' },
                LastName: { type: 'string' },
                Email: { type: 'string' },
                Phone: { type: 'string' },
                AccountId: { type: 'string' },
                Title: { type: 'string' },
                Department: { type: 'string' },
            },
            required: ['id'],
        },
    },
    {
        name: 'list_contact_activities',
        description: 'List activity history for a specific contact (tasks, events, calls, emails).',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Salesforce Contact record ID',
                },
            },
            required: ['id'],
        },
    },

    // ── Group 3 — Accounts (5 tools) ──────────────────────────────────────────

    {
        name: 'search_accounts',
        description: 'Search accounts by Name. Returns Id, Name, Industry, Website, Phone, AnnualRevenue.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Account name to search for (prefix match)',
                },
                limit: {
                    type: 'number',
                    description: 'Max number of accounts to return (default 20)',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'get_account',
        description: 'Get full details of a specific account by Salesforce record ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Salesforce Account record ID (18-character)',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'create_account',
        description: 'Create a new account in Salesforce. Name is required.',
        inputSchema: {
            type: 'object',
            properties: {
                Name: { type: 'string', description: 'Account name (required)' },
                Industry: { type: 'string', description: 'Industry type (e.g. Technology, Finance, Healthcare)' },
                Website: { type: 'string', description: 'Account website URL' },
                Phone: { type: 'string', description: 'Account phone number' },
                BillingCity: { type: 'string', description: 'Billing city' },
                BillingCountry: { type: 'string', description: 'Billing country' },
            },
            required: ['Name'],
        },
    },
    {
        name: 'update_account',
        description: 'Update fields on an existing account. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Salesforce Account record ID' },
                Name: { type: 'string' },
                Industry: { type: 'string' },
                Website: { type: 'string' },
                Phone: { type: 'string' },
                BillingCity: { type: 'string' },
                BillingCountry: { type: 'string' },
                AnnualRevenue: { type: 'number' },
            },
            required: ['id'],
        },
    },
    {
        name: 'list_account_contacts',
        description: 'List all contacts associated with a specific account.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Salesforce Account record ID',
                },
            },
            required: ['id'],
        },
    },

    // ── Group 4 — Opportunities (5 tools) ─────────────────────────────────────

    {
        name: 'list_opportunities',
        description: 'List opportunities, optionally filtered by Account. Returns Id, Name, StageName, Amount, CloseDate, AccountId.',
        inputSchema: {
            type: 'object',
            properties: {
                accountId: {
                    type: 'string',
                    description: 'Salesforce Account record ID to filter by (optional — omit to list all)',
                },
                limit: {
                    type: 'number',
                    description: 'Max number of opportunities to return (default 20)',
                },
            },
        },
    },
    {
        name: 'get_opportunity',
        description: 'Get full details of a specific opportunity by Salesforce record ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Salesforce Opportunity record ID (18-character)',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'create_opportunity',
        description: 'Create a new opportunity in Salesforce. Name, StageName, and CloseDate are required.',
        inputSchema: {
            type: 'object',
            properties: {
                Name: { type: 'string', description: 'Opportunity name (required)' },
                StageName: {
                    type: 'string',
                    description: 'Sales stage (required, e.g. Prospecting, Qualification, Proposal/Price Quote, Closed Won, Closed Lost)',
                },
                CloseDate: {
                    type: 'string',
                    description: 'Expected close date in YYYY-MM-DD format (required)',
                },
                Amount: { type: 'number', description: 'Opportunity value in account currency' },
                AccountId: { type: 'string', description: 'Salesforce Account record ID to associate this opportunity' },
            },
            required: ['Name', 'StageName', 'CloseDate'],
        },
    },
    {
        name: 'update_opportunity',
        description: 'Update fields on an existing opportunity (e.g. stage, amount, close date).',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Salesforce Opportunity record ID' },
                StageName: { type: 'string', description: 'New sales stage' },
                Amount: { type: 'number', description: 'Updated opportunity amount' },
                CloseDate: { type: 'string', description: 'Updated close date (YYYY-MM-DD)' },
                Name: { type: 'string' },
                AccountId: { type: 'string' },
            },
            required: ['id'],
        },
    },
    {
        name: 'add_opportunity_note',
        description: 'Add a completed task (note) to an opportunity. Creates a Task record linked to the opportunity via WhatId.',
        inputSchema: {
            type: 'object',
            properties: {
                opportunity_id: {
                    type: 'string',
                    description: 'Salesforce Opportunity record ID',
                },
                subject: { type: 'string', description: 'Task subject/title' },
                description: { type: 'string', description: 'Task body/note content' },
                activity_date: {
                    type: 'string',
                    description: 'Task activity date in YYYY-MM-DD format (defaults to today)',
                },
            },
            required: ['opportunity_id', 'subject'],
        },
    },

    // ── Group 5 — Tasks & Activities (3 tools) ────────────────────────────────

    {
        name: 'list_tasks',
        description: 'List tasks owned by a specific user, ordered by activity date descending.',
        inputSchema: {
            type: 'object',
            properties: {
                owner_id: {
                    type: 'string',
                    description: 'Salesforce User record ID of the task owner',
                },
                limit: {
                    type: 'number',
                    description: 'Max number of tasks to return (default 20)',
                },
            },
            required: ['owner_id'],
        },
    },
    {
        name: 'create_task',
        description: 'Create a new task in Salesforce. Subject is required.',
        inputSchema: {
            type: 'object',
            properties: {
                Subject: { type: 'string', description: 'Task subject/title (required)' },
                Status: {
                    type: 'string',
                    description: 'Task status (e.g. Not Started, In Progress, Completed, Waiting on someone else, Deferred)',
                },
                Priority: {
                    type: 'string',
                    description: 'Task priority (High, Normal, Low)',
                },
                ActivityDate: {
                    type: 'string',
                    description: 'Due date in YYYY-MM-DD format',
                },
                WhoId: {
                    type: 'string',
                    description: 'Lead or Contact record ID to link to (the "name" relation)',
                },
                WhatId: {
                    type: 'string',
                    description: 'Opportunity, Account, or other record ID to link to (the "related to" relation)',
                },
                Description: { type: 'string', description: 'Task notes/body' },
            },
            required: ['Subject'],
        },
    },
    {
        name: 'complete_task',
        description: 'Mark a task as Completed by updating its Status field.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Salesforce Task record ID',
                },
            },
            required: ['id'],
        },
    },

    // ── Group 6 — SOQL (2 tools) ──────────────────────────────────────────────

    {
        name: 'run_soql',
        description: 'Execute an arbitrary SOQL query against Salesforce. Use for complex queries not covered by other tools.',
        inputSchema: {
            type: 'object',
            properties: {
                soql: {
                    type: 'string',
                    description: 'Full SOQL query string, e.g. "SELECT Id, Name FROM Account WHERE Industry = \'Technology\' LIMIT 10"',
                },
            },
            required: ['soql'],
        },
    },
    {
        name: 'describe_object',
        description: 'Describe a Salesforce object (SObject) to get its fields, relationships, and metadata.',
        inputSchema: {
            type: 'object',
            properties: {
                object_name: {
                    type: 'string',
                    description: 'Salesforce object API name (e.g. Lead, Contact, Account, Opportunity, Task)',
                },
            },
            required: ['object_name'],
        },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    instanceUrl: string,
): Promise<unknown> {
    switch (name) {
        // ── Leads ───────────────────────────────────────────────────────────────

        case 'search_leads': {
            validateRequired(args, ['field', 'value']);
            const limit = (args.limit as number) || 20;
            const q = encodeURIComponent(
                `SELECT Id,FirstName,LastName,Email,Company,Status,Phone FROM Lead WHERE ${args.field} LIKE '${args.value}%' LIMIT ${limit}`,
            );
            return sfFetch(instanceUrl, `/query?q=${q}`, token);
        }

        case 'get_lead': {
            validateRequired(args, ['id']);
            return sfFetch(instanceUrl, `/sobjects/Lead/${args.id}`, token);
        }

        case 'create_lead': {
            validateRequired(args, ['LastName', 'Company']);
            const body: Record<string, unknown> = {};
            for (const key of ['FirstName', 'LastName', 'Email', 'Company', 'Phone', 'LeadSource']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return sfFetch(instanceUrl, '/sobjects/Lead', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_lead': {
            validateRequired(args, ['id']);
            const { id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['FirstName', 'LastName', 'Email', 'Company', 'Phone', 'Status', 'LeadSource']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return sfFetch(instanceUrl, `/sobjects/Lead/${id}`, token, {
                method: 'PATCH',
                body: JSON.stringify(body),
            });
        }

        case 'convert_lead': {
            validateRequired(args, ['lead_id', 'converted_status']);
            return sfFetch(instanceUrl, '/actions/standard/convertLead', token, {
                method: 'POST',
                body: JSON.stringify({
                    inputs: [{
                        leadId: args.lead_id,
                        convertedStatus: args.converted_status,
                        createOpportunity: args.create_opportunity ?? true,
                    }],
                }),
            });
        }

        // ── Contacts ────────────────────────────────────────────────────────────

        case 'search_contacts': {
            validateRequired(args, ['field', 'value']);
            const limit = (args.limit as number) || 20;
            const q = encodeURIComponent(
                `SELECT Id,FirstName,LastName,Email,Phone,AccountId FROM Contact WHERE ${args.field} LIKE '${args.value}%' LIMIT ${limit}`,
            );
            return sfFetch(instanceUrl, `/query?q=${q}`, token);
        }

        case 'get_contact': {
            validateRequired(args, ['id']);
            return sfFetch(instanceUrl, `/sobjects/Contact/${args.id}`, token);
        }

        case 'create_contact': {
            validateRequired(args, ['LastName']);
            const body: Record<string, unknown> = {};
            for (const key of ['FirstName', 'LastName', 'Email', 'Phone', 'AccountId']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return sfFetch(instanceUrl, '/sobjects/Contact', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_contact': {
            validateRequired(args, ['id']);
            const { id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['FirstName', 'LastName', 'Email', 'Phone', 'AccountId', 'Title', 'Department']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return sfFetch(instanceUrl, `/sobjects/Contact/${id}`, token, {
                method: 'PATCH',
                body: JSON.stringify(body),
            });
        }

        case 'list_contact_activities': {
            validateRequired(args, ['id']);
            return sfFetch(instanceUrl, `/sobjects/Contact/${args.id}/ActivityHistories`, token);
        }

        // ── Accounts ────────────────────────────────────────────────────────────

        case 'search_accounts': {
            validateRequired(args, ['name']);
            const limit = (args.limit as number) || 20;
            const q = encodeURIComponent(
                `SELECT Id,Name,Industry,Website,Phone,AnnualRevenue FROM Account WHERE Name LIKE '${args.name}%' LIMIT ${limit}`,
            );
            return sfFetch(instanceUrl, `/query?q=${q}`, token);
        }

        case 'get_account': {
            validateRequired(args, ['id']);
            return sfFetch(instanceUrl, `/sobjects/Account/${args.id}`, token);
        }

        case 'create_account': {
            validateRequired(args, ['Name']);
            const body: Record<string, unknown> = {};
            for (const key of ['Name', 'Industry', 'Website', 'Phone', 'BillingCity', 'BillingCountry']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return sfFetch(instanceUrl, '/sobjects/Account', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_account': {
            validateRequired(args, ['id']);
            const { id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['Name', 'Industry', 'Website', 'Phone', 'BillingCity', 'BillingCountry', 'AnnualRevenue']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return sfFetch(instanceUrl, `/sobjects/Account/${id}`, token, {
                method: 'PATCH',
                body: JSON.stringify(body),
            });
        }

        case 'list_account_contacts': {
            validateRequired(args, ['id']);
            return sfFetch(instanceUrl, `/sobjects/Account/${args.id}/Contacts`, token);
        }

        // ── Opportunities ───────────────────────────────────────────────────────

        case 'list_opportunities': {
            const limit = (args.limit as number) || 20;
            const whereClause = args.accountId ? `WHERE AccountId='${args.accountId}' ` : '';
            const q = encodeURIComponent(
                `SELECT Id,Name,StageName,Amount,CloseDate,AccountId FROM Opportunity ${whereClause}LIMIT ${limit}`,
            );
            return sfFetch(instanceUrl, `/query?q=${q}`, token);
        }

        case 'get_opportunity': {
            validateRequired(args, ['id']);
            return sfFetch(instanceUrl, `/sobjects/Opportunity/${args.id}`, token);
        }

        case 'create_opportunity': {
            validateRequired(args, ['Name', 'StageName', 'CloseDate']);
            const body: Record<string, unknown> = {};
            for (const key of ['Name', 'StageName', 'CloseDate', 'Amount', 'AccountId']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return sfFetch(instanceUrl, '/sobjects/Opportunity', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_opportunity': {
            validateRequired(args, ['id']);
            const { id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['StageName', 'Amount', 'CloseDate', 'Name', 'AccountId']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return sfFetch(instanceUrl, `/sobjects/Opportunity/${id}`, token, {
                method: 'PATCH',
                body: JSON.stringify(body),
            });
        }

        case 'add_opportunity_note': {
            validateRequired(args, ['opportunity_id', 'subject']);
            const body: Record<string, unknown> = {
                WhatId: args.opportunity_id,
                Subject: args.subject,
                Status: 'Completed',
            };
            if (args.description !== undefined) body.Description = args.description;
            if (args.activity_date !== undefined) body.ActivityDate = args.activity_date;
            return sfFetch(instanceUrl, '/sobjects/Task', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        // ── Tasks & Activities ──────────────────────────────────────────────────

        case 'list_tasks': {
            validateRequired(args, ['owner_id']);
            const limit = (args.limit as number) || 20;
            const q = encodeURIComponent(
                `SELECT Id,Subject,Status,Priority,ActivityDate,WhoId,WhatId FROM Task WHERE OwnerId='${args.owner_id}' ORDER BY ActivityDate DESC LIMIT ${limit}`,
            );
            return sfFetch(instanceUrl, `/query?q=${q}`, token);
        }

        case 'create_task': {
            validateRequired(args, ['Subject']);
            const body: Record<string, unknown> = {};
            for (const key of ['Subject', 'Status', 'Priority', 'ActivityDate', 'WhoId', 'WhatId', 'Description']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return sfFetch(instanceUrl, '/sobjects/Task', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'complete_task': {
            validateRequired(args, ['id']);
            return sfFetch(instanceUrl, `/sobjects/Task/${args.id}`, token, {
                method: 'PATCH',
                body: JSON.stringify({ Status: 'Completed' }),
            });
        }

        // ── SOQL ────────────────────────────────────────────────────────────────

        case 'run_soql': {
            validateRequired(args, ['soql']);
            const q = encodeURIComponent(args.soql as string);
            return sfFetch(instanceUrl, `/query?q=${q}`, token);
        }

        case 'describe_object': {
            validateRequired(args, ['object_name']);
            return sfFetch(instanceUrl, `/sobjects/${args.object_name}/describe`, token);
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
                JSON.stringify({ status: 'ok', server: 'mcp-salesforce', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-salesforce', version: '1.0.0' },
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
            const { token, instanceUrl } = getSecrets(request);
            if (!token || !instanceUrl) {
                const missing = [];
                if (!token) missing.push('SALESFORCE_ACCESS_TOKEN (header: X-Mcp-Secret-SALESFORCE-ACCESS-TOKEN)');
                if (!instanceUrl) missing.push('SALESFORCE_INSTANCE_URL (header: X-Mcp-Secret-SALESFORCE-INSTANCE-URL)');
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                const result = await callTool(toolName, args, token, instanceUrl);
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
