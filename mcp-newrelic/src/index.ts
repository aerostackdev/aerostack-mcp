/**
 * New Relic MCP Worker
 * Implements MCP protocol over HTTP for New Relic observability operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   NEW_RELIC_API_KEY → X-Mcp-Secret-NEW-RELIC-API-KEY  (New Relic User API Key)
 *
 * Auth format: API-Key: {api_key}  (NOT Authorization Bearer)
 *
 * CRITICAL: New Relic uses GraphQL ONLY — all requests are POST to a single endpoint.
 *
 * Single endpoint: https://api.newrelic.com/graphql
 * Covers: Entities (5), NRQL Queries (5), Dashboards (4), Alerts (4), Accounts & Users (3) = 21 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const NR_GRAPHQL_URL = 'https://api.newrelic.com/graphql';

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

function getSecrets(request: Request): { apiKey: string | null } {
    return {
        apiKey: request.headers.get('X-Mcp-Secret-NEW-RELIC-API-KEY'),
    };
}

/**
 * nrFetch — single GraphQL fetch helper for all New Relic operations.
 * All requests POST to https://api.newrelic.com/graphql with API-Key header.
 * Returns the `data` field from the GraphQL response.
 * Throws on GraphQL `errors` array or non-OK HTTP status.
 */
async function nrFetch(
    query: string,
    variables: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    const res = await fetch(NR_GRAPHQL_URL, {
        method: 'POST',
        headers: {
            'API-Key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });

    const text = await res.text();
    let json: { data?: unknown; errors?: Array<{ message: string }> };
    try {
        json = JSON.parse(text) as typeof json;
    } catch {
        throw { code: -32603, message: `New Relic HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        throw { code: -32603, message: `New Relic API error ${res.status}: ${text}` };
    }

    if (json.errors && json.errors.length > 0) {
        throw { code: -32603, message: `New Relic GraphQL error: ${json.errors.map(e => e.message).join('; ')}` };
    }

    return json.data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Entities (5 tools) ─────────────────────────────────────────

    {
        name: 'list_entities',
        description: 'List New Relic entities by type (HOST, APPLICATION, BROWSER, MOBILE, MONITOR, DASHBOARD). Returns guid, name, accountId, entityType, alertSeverity.',
        inputSchema: {
            type: 'object',
            properties: {
                entity_type: {
                    type: 'string',
                    description: 'Entity type to list: HOST, APPLICATION, BROWSER, MOBILE, MONITOR, or DASHBOARD',
                    enum: ['HOST', 'APPLICATION', 'BROWSER', 'MOBILE', 'MONITOR', 'DASHBOARD'],
                },
                name_filter: {
                    type: 'string',
                    description: 'Optional name substring filter to narrow results',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of entities to return (default 25)',
                },
            },
            required: ['entity_type'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_entity',
        description: 'Get full details of a New Relic entity by GUID including name, accountId, entityType, alertSeverity, and tags.',
        inputSchema: {
            type: 'object',
            properties: {
                guid: {
                    type: 'string',
                    description: 'New Relic entity GUID (e.g. MTIzNDU2N3xBUE18QVBQTElDQVRJT058MTIzNDU2Nzg5)',
                },
            },
            required: ['guid'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_entities',
        description: 'Search New Relic entities by name across all entity types. Returns matching entities with guid, name, accountId, entityType.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name substring to search for across all entities',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results to return (default 25)',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_golden_metrics',
        description: 'Get golden metrics (response time, throughput, error rate) for a specific entity GUID. Returns the metric queries, titles, and units.',
        inputSchema: {
            type: 'object',
            properties: {
                guid: {
                    type: 'string',
                    description: 'New Relic entity GUID to retrieve golden metrics for',
                },
            },
            required: ['guid'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_entity_tags',
        description: 'Get all tags on a New Relic entity by GUID. Returns key-value pairs used for filtering and grouping.',
        inputSchema: {
            type: 'object',
            properties: {
                guid: {
                    type: 'string',
                    description: 'New Relic entity GUID to retrieve tags for',
                },
            },
            required: ['guid'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — NRQL Queries (5 tools) ─────────────────────────────────────

    {
        name: 'run_nrql',
        description: 'Execute an arbitrary NRQL query against a New Relic account. Use for custom data exploration, alerting thresholds, or ad-hoc analysis.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'number',
                    description: 'New Relic account ID to query against',
                },
                nrql: {
                    type: 'string',
                    description: 'Full NRQL query string, e.g. "SELECT count(*) FROM Transaction SINCE 1 hour ago"',
                },
            },
            required: ['account_id', 'nrql'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'run_nrql_timeseries',
        description: 'Run an NRQL query with TIMESERIES appended automatically. Returns time-bucketed results suitable for charting.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'number',
                    description: 'New Relic account ID to query against',
                },
                nrql: {
                    type: 'string',
                    description: 'NRQL query string (TIMESERIES will be appended if not already present)',
                },
            },
            required: ['account_id', 'nrql'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'query_apm_metrics',
        description: 'Pre-built APM query: returns response time and throughput for a named application. Simpler than writing NRQL directly.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'number',
                    description: 'New Relic account ID',
                },
                app_name: {
                    type: 'string',
                    description: 'Application name as it appears in New Relic APM',
                },
                since: {
                    type: 'string',
                    description: 'Time window, e.g. "1 hour ago", "30 minutes ago", "1 day ago" (default: "1 hour ago")',
                },
            },
            required: ['account_id', 'app_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'query_error_rate',
        description: 'Pre-built error rate query for a named application or service. Returns percentage of transactions with errors.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'number',
                    description: 'New Relic account ID',
                },
                app_name: {
                    type: 'string',
                    description: 'Application name as it appears in New Relic APM',
                },
                since: {
                    type: 'string',
                    description: 'Time window (default: "1 hour ago")',
                },
            },
            required: ['account_id', 'app_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'query_infrastructure',
        description: 'Pre-built infrastructure query: returns CPU and memory usage for a named host. Uses SystemSample event type.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'number',
                    description: 'New Relic account ID',
                },
                host_name: {
                    type: 'string',
                    description: 'Hostname as it appears in New Relic Infrastructure',
                },
                since: {
                    type: 'string',
                    description: 'Time window (default: "1 hour ago")',
                },
            },
            required: ['account_id', 'host_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Dashboards (4 tools) ───────────────────────────────────────

    {
        name: 'list_dashboards',
        description: 'List all New Relic dashboards accessible by the API key. Returns guid, name, accountId, and entityType.',
        inputSchema: {
            type: 'object',
            properties: {
                name_filter: {
                    type: 'string',
                    description: 'Optional name filter to narrow results',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_dashboard',
        description: 'Get a New Relic dashboard by GUID including page count and widget count.',
        inputSchema: {
            type: 'object',
            properties: {
                guid: {
                    type: 'string',
                    description: 'New Relic dashboard entity GUID',
                },
            },
            required: ['guid'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_dashboard',
        description: 'Create a new empty New Relic dashboard with PUBLIC_READ_WRITE permissions.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'number',
                    description: 'New Relic account ID to create the dashboard in',
                },
                name: {
                    type: 'string',
                    description: 'Dashboard name',
                },
            },
            required: ['account_id', 'name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_dashboard',
        description: 'Delete a New Relic dashboard by GUID. This is irreversible.',
        inputSchema: {
            type: 'object',
            properties: {
                guid: {
                    type: 'string',
                    description: 'New Relic dashboard entity GUID to delete',
                },
            },
            required: ['guid'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 4 — Alerts (4 tools) ────────────────────────────────────────────

    {
        name: 'list_alert_policies',
        description: 'List alert policies for a New Relic account. Returns id, name, and incidentPreference for each policy.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'number',
                    description: 'New Relic account ID',
                },
            },
            required: ['account_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_alert_conditions',
        description: 'Get NRQL alert conditions for a specific alert policy. Returns condition id, name, enabled status, and NRQL query.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'number',
                    description: 'New Relic account ID',
                },
                policy_id: {
                    type: 'string',
                    description: 'Alert policy ID to retrieve conditions for',
                },
            },
            required: ['account_id', 'policy_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_incidents',
        description: 'List open/active alert incidents for a New Relic account. Returns incident id, state, and timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'number',
                    description: 'New Relic account ID',
                },
                state: {
                    type: 'string',
                    description: 'Incident state filter: CREATED, ACTIVATED, CLOSED (default: ACTIVATED for open incidents)',
                    enum: ['CREATED', 'ACTIVATED', 'CLOSED'],
                },
            },
            required: ['account_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_incident_details',
        description: 'Get detailed information about a specific New Relic alert incident by incident ID.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'number',
                    description: 'New Relic account ID',
                },
                incident_id: {
                    type: 'string',
                    description: 'Alert incident ID',
                },
            },
            required: ['account_id', 'incident_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 5 — Accounts & Users (3 tools) ──────────────────────────────────

    {
        name: 'list_accounts',
        description: 'List all New Relic accounts accessible by the API key. Returns id and name for each account.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_current_user',
        description: 'Get the authenticated New Relic user associated with the API key. Returns name, email, and user ID.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_account_info',
        description: 'Get details for a specific New Relic account by account ID.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'number',
                    description: 'New Relic account ID to retrieve details for',
                },
            },
            required: ['account_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        // ── Entities ────────────────────────────────────────────────────────────

        case 'list_entities': {
            validateRequired(args, ['entity_type']);
            const entityType = args.entity_type as string;
            const limit = (args.limit as number) || 25;
            let queryStr = `type = '${entityType}'`;
            if (args.name_filter) {
                queryStr += ` AND name LIKE '%${args.name_filter}%'`;
            }
            const query = `
                query($query: String!, $limit: Int) {
                    actor {
                        entitySearch(query: $query, options: { limit: $limit }) {
                            results {
                                entities {
                                    guid
                                    name
                                    accountId
                                    entityType
                                    alertSeverity
                                }
                                nextCursor
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { query: queryStr, limit }, apiKey);
        }

        case 'get_entity': {
            validateRequired(args, ['guid']);
            const query = `
                query($guid: EntityGuid!) {
                    actor {
                        entity(guid: $guid) {
                            guid
                            name
                            accountId
                            entityType
                            alertSeverity
                            tags {
                                key
                                values
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { guid: args.guid }, apiKey);
        }

        case 'search_entities': {
            validateRequired(args, ['name']);
            const limit = (args.limit as number) || 25;
            const query = `
                query($query: String!, $limit: Int) {
                    actor {
                        entitySearch(query: $query, options: { limit: $limit }) {
                            results {
                                entities {
                                    guid
                                    name
                                    accountId
                                    entityType
                                    alertSeverity
                                }
                                nextCursor
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { query: `name LIKE '%${args.name}%'`, limit }, apiKey);
        }

        case 'get_golden_metrics': {
            validateRequired(args, ['guid']);
            const query = `
                query($guid: EntityGuid!) {
                    actor {
                        entity(guid: $guid) {
                            guid
                            name
                            goldenMetrics {
                                metrics {
                                    query
                                    title
                                    unit
                                    name
                                }
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { guid: args.guid }, apiKey);
        }

        case 'get_entity_tags': {
            validateRequired(args, ['guid']);
            const query = `
                query($guid: EntityGuid!) {
                    actor {
                        entity(guid: $guid) {
                            guid
                            name
                            tags {
                                key
                                values
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { guid: args.guid }, apiKey);
        }

        // ── NRQL Queries ────────────────────────────────────────────────────────

        case 'run_nrql': {
            validateRequired(args, ['account_id', 'nrql']);
            const query = `
                query($accountId: Int!, $nrql: Nrql!) {
                    actor {
                        account(id: $accountId) {
                            nrql(query: $nrql) {
                                results
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { accountId: args.account_id, nrql: args.nrql }, apiKey);
        }

        case 'run_nrql_timeseries': {
            validateRequired(args, ['account_id', 'nrql']);
            const nrqlStr = args.nrql as string;
            const nrqlWithTs = nrqlStr.toUpperCase().includes('TIMESERIES')
                ? nrqlStr
                : `${nrqlStr} TIMESERIES`;
            const query = `
                query($accountId: Int!, $nrql: Nrql!) {
                    actor {
                        account(id: $accountId) {
                            nrql(query: $nrql) {
                                results
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { accountId: args.account_id, nrql: nrqlWithTs }, apiKey);
        }

        case 'query_apm_metrics': {
            validateRequired(args, ['account_id', 'app_name']);
            const since = (args.since as string) || '1 hour ago';
            const nrql = `SELECT average(duration) AS 'Response Time (s)', rate(count(*), 1 minute) AS 'Throughput (rpm)' FROM Transaction WHERE appName = '${args.app_name}' SINCE ${since}`;
            const query = `
                query($accountId: Int!, $nrql: Nrql!) {
                    actor {
                        account(id: $accountId) {
                            nrql(query: $nrql) {
                                results
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { accountId: args.account_id, nrql }, apiKey);
        }

        case 'query_error_rate': {
            validateRequired(args, ['account_id', 'app_name']);
            const since = (args.since as string) || '1 hour ago';
            const nrql = `SELECT percentage(count(*), WHERE error IS true) AS 'Error Rate (%)' FROM Transaction WHERE appName = '${args.app_name}' SINCE ${since}`;
            const query = `
                query($accountId: Int!, $nrql: Nrql!) {
                    actor {
                        account(id: $accountId) {
                            nrql(query: $nrql) {
                                results
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { accountId: args.account_id, nrql }, apiKey);
        }

        case 'query_infrastructure': {
            validateRequired(args, ['account_id', 'host_name']);
            const since = (args.since as string) || '1 hour ago';
            const nrql = `SELECT average(cpuPercent) AS 'CPU (%)', average(memoryUsedPercent) AS 'Memory (%)' FROM SystemSample WHERE hostname = '${args.host_name}' SINCE ${since}`;
            const query = `
                query($accountId: Int!, $nrql: Nrql!) {
                    actor {
                        account(id: $accountId) {
                            nrql(query: $nrql) {
                                results
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { accountId: args.account_id, nrql }, apiKey);
        }

        // ── Dashboards ──────────────────────────────────────────────────────────

        case 'list_dashboards': {
            let queryStr = `type = 'DASHBOARD'`;
            if (args.name_filter) {
                queryStr += ` AND name LIKE '%${args.name_filter}%'`;
            }
            const query = `
                query($query: String!) {
                    actor {
                        entitySearch(query: $query) {
                            results {
                                entities {
                                    guid
                                    name
                                    accountId
                                    entityType
                                }
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { query: queryStr }, apiKey);
        }

        case 'get_dashboard': {
            validateRequired(args, ['guid']);
            const query = `
                query($guid: EntityGuid!) {
                    actor {
                        entity(guid: $guid) {
                            guid
                            name
                            accountId
                            entityType
                            ... on DashboardEntity {
                                pages {
                                    guid
                                    name
                                    widgets {
                                        id
                                        title
                                    }
                                }
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { guid: args.guid }, apiKey);
        }

        case 'create_dashboard': {
            validateRequired(args, ['account_id', 'name']);
            const query = `
                mutation($accountId: Int!, $name: String!) {
                    dashboardCreate(
                        accountId: $accountId,
                        dashboard: {
                            name: $name,
                            permissions: PUBLIC_READ_WRITE,
                            pages: []
                        }
                    ) {
                        entityResult {
                            guid
                            name
                        }
                        errors {
                            description
                            type
                        }
                    }
                }
            `;
            return nrFetch(query, { accountId: args.account_id, name: args.name }, apiKey);
        }

        case 'delete_dashboard': {
            validateRequired(args, ['guid']);
            const query = `
                mutation($guid: EntityGuid!) {
                    dashboardDelete(guid: $guid) {
                        status
                        errors {
                            description
                            type
                        }
                    }
                }
            `;
            return nrFetch(query, { guid: args.guid }, apiKey);
        }

        // ── Alerts ──────────────────────────────────────────────────────────────

        case 'list_alert_policies': {
            validateRequired(args, ['account_id']);
            const query = `
                query($accountId: Int!) {
                    actor {
                        account(id: $accountId) {
                            alerts {
                                policiesSearch {
                                    policies {
                                        id
                                        name
                                        incidentPreference
                                    }
                                }
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { accountId: args.account_id }, apiKey);
        }

        case 'get_alert_conditions': {
            validateRequired(args, ['account_id', 'policy_id']);
            const query = `
                query($accountId: Int!, $policyId: ID!) {
                    actor {
                        account(id: $accountId) {
                            alerts {
                                nrqlConditionsSearch(searchCriteria: { policyId: $policyId }) {
                                    nrqlConditions {
                                        id
                                        name
                                        enabled
                                        policyId
                                        nrql {
                                            query
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { accountId: args.account_id, policyId: args.policy_id }, apiKey);
        }

        case 'list_incidents': {
            validateRequired(args, ['account_id']);
            const state = (args.state as string) || 'ACTIVATED';
            const query = `
                query($accountId: Int!, $state: AiAlertsIncidentState) {
                    actor {
                        account(id: $accountId) {
                            aiAlerts {
                                incidentSearch(searchCriteria: { states: [$state] }) {
                                    incidents {
                                        incidentId
                                        state
                                        createdAt
                                        closedAt
                                        title
                                    }
                                }
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { accountId: args.account_id, state }, apiKey);
        }

        case 'get_incident_details': {
            validateRequired(args, ['account_id', 'incident_id']);
            const query = `
                query($accountId: Int!, $incidentId: ID!) {
                    actor {
                        account(id: $accountId) {
                            aiAlerts {
                                incidentSearch(searchCriteria: { incidentIds: [$incidentId] }) {
                                    incidents {
                                        incidentId
                                        state
                                        createdAt
                                        closedAt
                                        title
                                        isCorrelated
                                    }
                                }
                            }
                        }
                    }
                }
            `;
            return nrFetch(query, { accountId: args.account_id, incidentId: args.incident_id }, apiKey);
        }

        // ── Accounts & Users ────────────────────────────────────────────────────

        case 'list_accounts': {
            const query = `
                {
                    actor {
                        accounts {
                            id
                            name
                        }
                    }
                }
            `;
            return nrFetch(query, {}, apiKey);
        }

        case 'get_current_user': {
            const query = `
                {
                    actor {
                        user {
                            name
                            email
                            id
                        }
                    }
                }
            `;
            return nrFetch(query, {}, apiKey);
        }

        case 'get_account_info': {
            validateRequired(args, ['account_id']);
            const query = `
                query($accountId: Int!) {
                    actor {
                        account(id: $accountId) {
                            id
                            name
                        }
                    }
                }
            `;
            return nrFetch(query, { accountId: args.account_id }, apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-newrelic', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-newrelic', version: '1.0.0' },
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
            const { apiKey } = getSecrets(request);
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: NEW_RELIC_API_KEY (header: X-Mcp-Secret-NEW-RELIC-API-KEY)');
            }

            try {
                const result = await callTool(toolName, args, apiKey);
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
