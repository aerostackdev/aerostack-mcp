/**
 * Terraform Cloud MCP Worker
 * Implements MCP protocol over HTTP for Terraform Cloud workspace management.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   TERRAFORM_API_TOKEN → X-Mcp-Secret-TERRAFORM-API-TOKEN (Team or User API token)
 *   TERRAFORM_ORG       → X-Mcp-Secret-TERRAFORM-ORG (Organization name)
 */

const TFC_API = 'https://app.terraform.io/api/v2';

function rpcOk(id: unknown, result: unknown) {
    return Response.json({ jsonrpc: '2.0', id, result });
}

function rpcErr(id: unknown, code: number, message: string) {
    return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Terraform Cloud API token by fetching the current account. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'list_workspaces',
        description: 'List workspaces in the Terraform Cloud organization',
        inputSchema: {
            type: 'object',
            properties: {
                search: { type: 'string', description: 'Filter workspaces by name (optional)' },
                page_number: { type: 'number', description: 'Page number (default 1)' },
                page_size: { type: 'number', description: 'Results per page (default 20, max 100)' },
            },
        },
    },
    {
        name: 'get_workspace',
        description: 'Get full details for a specific workspace by name',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_name: { type: 'string', description: 'Name of the workspace' },
            },
            required: ['workspace_name'],
        },
    },
    {
        name: 'list_runs',
        description: 'List runs for a specific workspace',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: { type: 'string', description: 'Workspace ID (e.g. ws-abc123)' },
                page_number: { type: 'number', description: 'Page number (default 1)' },
                page_size: { type: 'number', description: 'Results per page (default 20, max 100)' },
            },
            required: ['workspace_id'],
        },
    },
    {
        name: 'get_run',
        description: 'Get full details for a specific run by ID',
        inputSchema: {
            type: 'object',
            properties: {
                run_id: { type: 'string', description: 'Run ID (e.g. run-abc123)' },
            },
            required: ['run_id'],
        },
    },
    {
        name: 'trigger_run',
        description: 'Create and queue a new run for a workspace',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: { type: 'string', description: 'Workspace ID (e.g. ws-abc123)' },
                message: { type: 'string', description: 'Description of the run (optional)' },
                is_destroy: { type: 'boolean', description: 'If true, creates a destroy plan (default false)' },
                auto_apply: { type: 'boolean', description: 'If true, automatically apply after plan succeeds (default false)' },
            },
            required: ['workspace_id'],
        },
    },
    {
        name: 'list_state_versions',
        description: 'List state versions for a workspace',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: { type: 'string', description: 'Workspace ID (e.g. ws-abc123)' },
                page_number: { type: 'number', description: 'Page number (default 1)' },
                page_size: { type: 'number', description: 'Results per page (default 20, max 100)' },
            },
            required: ['workspace_id'],
        },
    },
    {
        name: 'get_current_state',
        description: 'Get the current state version for a workspace',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: { type: 'string', description: 'Workspace ID (e.g. ws-abc123)' },
            },
            required: ['workspace_id'],
        },
    },
    {
        name: 'list_variables',
        description: 'List all variables for a workspace',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: { type: 'string', description: 'Workspace ID (e.g. ws-abc123)' },
            },
            required: ['workspace_id'],
        },
    },
    {
        name: 'set_variable',
        description: 'Create or update a variable in a workspace',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: { type: 'string', description: 'Workspace ID (e.g. ws-abc123)' },
                key: { type: 'string', description: 'Variable name' },
                value: { type: 'string', description: 'Variable value' },
                category: { type: 'string', enum: ['terraform', 'env'], description: 'Variable category: terraform or env (default terraform)' },
                sensitive: { type: 'boolean', description: 'Mark variable as sensitive (default false)' },
                hcl: { type: 'boolean', description: 'Parse value as HCL (default false)' },
                description: { type: 'string', description: 'Variable description (optional)' },
            },
            required: ['workspace_id', 'key', 'value'],
        },
    },
];

async function tfcApi(
    path: string,
    token: string,
    opts: RequestInit = {},
): Promise<unknown> {
    const url = `${TFC_API}${path}`;
    const res = await fetch(url, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/vnd.api+json',
            ...(opts.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        throw new Error(`Terraform Cloud API error ${res.status}: ${await res.text()}`);
    }
    return res.json();
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    org: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await tfcApi('/account/details', token) as any;
            const user = data.data?.attributes;
            return text(`Connected to Terraform Cloud as ${user?.username ?? 'unknown'} (${user?.email ?? 'no email'})`);
        }

        case 'list_workspaces': {
            const params = new URLSearchParams();
            if (args.search) params.set('search[name]', String(args.search));
            params.set('page[number]', String(args.page_number ?? 1));
            params.set('page[size]', String(Math.min(Number(args.page_size ?? 20), 100)));
            const data = await tfcApi(`/organizations/${org}/workspaces?${params}`, token) as any;
            return json((data.data ?? []).map((w: any) => ({
                id: w.id,
                name: w.attributes.name,
                terraform_version: w.attributes['terraform-version'],
                auto_apply: w.attributes['auto-apply'],
                working_directory: w.attributes['working-directory'],
                vcs_repo: w.attributes['vcs-repo']?.identifier ?? null,
                resource_count: w.attributes['resource-count'],
                updated_at: w.attributes['updated-at'],
                locked: w.attributes.locked,
            })));
        }

        case 'get_workspace': {
            if (!args.workspace_name) throw new Error('workspace_name is required');
            const data = await tfcApi(`/organizations/${org}/workspaces/${args.workspace_name}`, token) as any;
            const w = data.data;
            return json({
                id: w.id,
                name: w.attributes.name,
                description: w.attributes.description,
                terraform_version: w.attributes['terraform-version'],
                auto_apply: w.attributes['auto-apply'],
                working_directory: w.attributes['working-directory'],
                vcs_repo: w.attributes['vcs-repo'] ? {
                    identifier: w.attributes['vcs-repo'].identifier,
                    branch: w.attributes['vcs-repo'].branch,
                } : null,
                execution_mode: w.attributes['execution-mode'],
                resource_count: w.attributes['resource-count'],
                locked: w.attributes.locked,
                created_at: w.attributes['created-at'],
                updated_at: w.attributes['updated-at'],
            });
        }

        case 'list_runs': {
            if (!args.workspace_id) throw new Error('workspace_id is required');
            const params = new URLSearchParams();
            params.set('page[number]', String(args.page_number ?? 1));
            params.set('page[size]', String(Math.min(Number(args.page_size ?? 20), 100)));
            const data = await tfcApi(`/workspaces/${args.workspace_id}/runs?${params}`, token) as any;
            return json((data.data ?? []).map((r: any) => ({
                id: r.id,
                status: r.attributes.status,
                message: r.attributes.message,
                is_destroy: r.attributes['is-destroy'],
                has_changes: r.attributes['has-changes'],
                auto_apply: r.attributes['auto-apply'],
                resource_additions: r.attributes['resource-additions'],
                resource_changes: r.attributes['resource-changes'],
                resource_destructions: r.attributes['resource-destructions'],
                created_at: r.attributes['created-at'],
            })));
        }

        case 'get_run': {
            if (!args.run_id) throw new Error('run_id is required');
            const data = await tfcApi(`/runs/${args.run_id}`, token) as any;
            const r = data.data;
            return json({
                id: r.id,
                status: r.attributes.status,
                message: r.attributes.message,
                is_destroy: r.attributes['is-destroy'],
                has_changes: r.attributes['has-changes'],
                auto_apply: r.attributes['auto-apply'],
                resource_additions: r.attributes['resource-additions'],
                resource_changes: r.attributes['resource-changes'],
                resource_destructions: r.attributes['resource-destructions'],
                status_timestamps: r.attributes['status-timestamps'],
                created_at: r.attributes['created-at'],
                plan: r.relationships?.plan?.data ? { id: r.relationships.plan.data.id } : null,
                apply: r.relationships?.apply?.data ? { id: r.relationships.apply.data.id } : null,
            });
        }

        case 'trigger_run': {
            if (!args.workspace_id) throw new Error('workspace_id is required');
            const payload = {
                data: {
                    attributes: {
                        message: args.message ?? 'Triggered via Aerostack MCP',
                        'is-destroy': args.is_destroy ?? false,
                        'auto-apply': args.auto_apply ?? false,
                    },
                    type: 'runs',
                    relationships: {
                        workspace: {
                            data: { type: 'workspaces', id: args.workspace_id },
                        },
                    },
                },
            };
            const data = await tfcApi('/runs', token, {
                method: 'POST',
                body: JSON.stringify(payload),
            }) as any;
            const r = data.data;
            return json({
                id: r.id,
                status: r.attributes.status,
                message: r.attributes.message,
                is_destroy: r.attributes['is-destroy'],
                auto_apply: r.attributes['auto-apply'],
                created_at: r.attributes['created-at'],
            });
        }

        case 'list_state_versions': {
            if (!args.workspace_id) throw new Error('workspace_id is required');
            const params = new URLSearchParams();
            params.set('page[number]', String(args.page_number ?? 1));
            params.set('page[size]', String(Math.min(Number(args.page_size ?? 20), 100)));
            const data = await tfcApi(`/workspaces/${args.workspace_id}/state-versions?${params}`, token) as any;
            return json((data.data ?? []).map((s: any) => ({
                id: s.id,
                serial: s.attributes.serial,
                terraform_version: s.attributes['terraform-version'],
                resource_count: s.attributes['resources-processed'],
                created_at: s.attributes['created-at'],
                size: s.attributes.size,
            })));
        }

        case 'get_current_state': {
            if (!args.workspace_id) throw new Error('workspace_id is required');
            const data = await tfcApi(`/workspaces/${args.workspace_id}/current-state-version`, token) as any;
            const s = data.data;
            return json({
                id: s.id,
                serial: s.attributes.serial,
                terraform_version: s.attributes['terraform-version'],
                resource_count: s.attributes['resources-processed'],
                created_at: s.attributes['created-at'],
                size: s.attributes.size,
                outputs: s.attributes.outputs ?? null,
            });
        }

        case 'list_variables': {
            if (!args.workspace_id) throw new Error('workspace_id is required');
            const data = await tfcApi(`/workspaces/${args.workspace_id}/vars`, token) as any;
            return json((data.data ?? []).map((v: any) => ({
                id: v.id,
                key: v.attributes.key,
                value: v.attributes.sensitive ? '***' : v.attributes.value,
                category: v.attributes.category,
                sensitive: v.attributes.sensitive,
                hcl: v.attributes.hcl,
                description: v.attributes.description,
            })));
        }

        case 'set_variable': {
            if (!args.workspace_id) throw new Error('workspace_id is required');
            if (!args.key) throw new Error('key is required');
            if (args.value === undefined) throw new Error('value is required');

            // Check if variable already exists
            const existing = await tfcApi(`/workspaces/${args.workspace_id}/vars`, token) as any;
            const match = (existing.data ?? []).find(
                (v: any) => v.attributes.key === args.key && v.attributes.category === (args.category ?? 'terraform'),
            );

            if (match) {
                // Update existing variable
                const payload = {
                    data: {
                        id: match.id,
                        attributes: {
                            value: String(args.value),
                            ...(args.sensitive !== undefined && { sensitive: args.sensitive }),
                            ...(args.hcl !== undefined && { hcl: args.hcl }),
                            ...(args.description !== undefined && { description: args.description }),
                        },
                        type: 'vars',
                    },
                };
                const data = await tfcApi(`/workspaces/${args.workspace_id}/vars/${match.id}`, token, {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                }) as any;
                const v = data.data;
                return json({
                    id: v.id,
                    key: v.attributes.key,
                    category: v.attributes.category,
                    sensitive: v.attributes.sensitive,
                    hcl: v.attributes.hcl,
                    action: 'updated',
                });
            } else {
                // Create new variable
                const payload = {
                    data: {
                        attributes: {
                            key: args.key,
                            value: String(args.value),
                            category: args.category ?? 'terraform',
                            sensitive: args.sensitive ?? false,
                            hcl: args.hcl ?? false,
                            ...(args.description !== undefined && { description: args.description }),
                        },
                        type: 'vars',
                        relationships: {
                            workspace: {
                                data: { type: 'workspaces', id: args.workspace_id },
                            },
                        },
                    },
                };
                const data = await tfcApi(`/workspaces/${args.workspace_id}/vars`, token, {
                    method: 'POST',
                    body: JSON.stringify(payload),
                }) as any;
                const v = data.data;
                return json({
                    id: v.id,
                    key: v.attributes.key,
                    category: v.attributes.category,
                    sensitive: v.attributes.sensitive,
                    hcl: v.attributes.hcl,
                    action: 'created',
                });
            }
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return Response.json({ status: 'ok', server: 'terraform-mcp', version: '1.0.0' });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: any;
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { jsonrpc, id, method, params } = body;
        if (jsonrpc !== '2.0') return rpcErr(id ?? null, -32600, 'Invalid Request');

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'terraform-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-TERRAFORM-API-TOKEN');
            const org = request.headers.get('X-Mcp-Secret-TERRAFORM-ORG');

            if (!token) {
                return rpcErr(id, -32001, 'Missing required secret: TERRAFORM_API_TOKEN');
            }
            if (!org) {
                return rpcErr(id, -32001, 'Missing required secret: TERRAFORM_ORG');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, token, org);
                return rpcOk(id, result);
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
