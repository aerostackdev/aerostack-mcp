/**
 * Auth0 MCP Worker
 * Implements MCP protocol over HTTP for Auth0 Management API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   AUTH0_MANAGEMENT_TOKEN → X-Mcp-Secret-AUTH0-MANAGEMENT-TOKEN
 *   AUTH0_DOMAIN           → X-Mcp-Secret-AUTH0-DOMAIN (e.g. myapp.auth0.com)
 *
 * Auth format: Authorization: Bearer {token}
 * Base URL: https://{domain}/api/v2
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpcOk(id: string | number | null, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function rpcErr(id: string | number | null, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function toolOk(data: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
  const missing = fields.filter(f => args[f] === undefined || args[f] === null || args[f] === '');
  if (missing.length > 0) throw new Error(`Missing required fields: ${missing.join(', ')}`);
}

function getSecrets(request: Request): { token: string | null; domain: string | null } {
  return {
    token: request.headers.get('X-Mcp-Secret-AUTH0-MANAGEMENT-TOKEN'),
    domain: request.headers.get('X-Mcp-Secret-AUTH0-DOMAIN'),
  };
}

async function auth0Fetch(
  path: string,
  token: string,
  domain: string,
  options: RequestInit = {},
): Promise<unknown> {
  const base = `https://${domain}/api/v2`;
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    },
  });
  if (res.status === 204) return { deleted: true };
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Auth0 API error ${res.status}: ${text}`);
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Auth0 credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'list_users',
    description: 'List users in the Auth0 tenant',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_user',
    description: 'Get details of a specific Auth0 user',
    inputSchema: {
      type: 'object',
      properties: { userId: { type: 'string', description: 'Auth0 user ID (e.g. auth0|123456)' } },
      required: ['userId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_user',
    description: 'Create a new Auth0 user',
    inputSchema: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Connection name (e.g. Username-Password-Authentication)' },
        email: { type: 'string', description: 'User email' },
        password: { type: 'string', description: 'User password (optional for passwordless)' },
        name: { type: 'string', description: 'Full name (optional)' },
        given_name: { type: 'string', description: 'Given name (optional)' },
        family_name: { type: 'string', description: 'Family name (optional)' },
      },
      required: ['connection', 'email'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_user',
    description: 'Update an Auth0 user',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Auth0 user ID' },
        email: { type: 'string', description: 'Updated email' },
        name: { type: 'string', description: 'Updated name' },
        given_name: { type: 'string', description: 'Updated given name' },
        family_name: { type: 'string', description: 'Updated family name' },
        blocked: { type: 'boolean', description: 'Block or unblock the user' },
      },
      required: ['userId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_user',
    description: 'Delete an Auth0 user',
    inputSchema: {
      type: 'object',
      properties: { userId: { type: 'string', description: 'Auth0 user ID to delete' } },
      required: ['userId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_connections',
    description: 'List all connections in the Auth0 tenant',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_connection',
    description: 'Get details of a specific Auth0 connection',
    inputSchema: {
      type: 'object',
      properties: { connectionId: { type: 'string', description: 'Auth0 connection ID' } },
      required: ['connectionId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_applications',
    description: 'List applications (clients) in the Auth0 tenant',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_application',
    description: 'Get details of a specific Auth0 application (client)',
    inputSchema: {
      type: 'object',
      properties: { clientId: { type: 'string', description: 'Auth0 client ID' } },
      required: ['clientId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_roles',
    description: 'List roles in the Auth0 tenant',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_role',
    description: 'Get details of a specific Auth0 role',
    inputSchema: {
      type: 'object',
      properties: { roleId: { type: 'string', description: 'Auth0 role ID' } },
      required: ['roleId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'assign_role_to_user',
    description: 'Assign a role to an Auth0 user',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Auth0 user ID' },
        roleId: { type: 'string', description: 'Auth0 role ID to assign' },
      },
      required: ['userId', 'roleId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_user_roles',
    description: 'Get roles assigned to an Auth0 user',
    inputSchema: {
      type: 'object',
      properties: { userId: { type: 'string', description: 'Auth0 user ID' } },
      required: ['userId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_logs',
    description: 'List recent Auth0 tenant logs',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleTool(
  name: string,
  args: Record<string, unknown>,
  token: string,
  domain: string,
): Promise<unknown> {
  switch (name) {
    case '_ping': {
      await auth0Fetch('/clients?per_page=1&fields=client_id', token, domain);
      return toolOk({ connected: true, domain });
    }

    case 'list_users':
      return toolOk(await auth0Fetch('/users?per_page=25&page=0&include_totals=true', token, domain));

    case 'get_user': {
      validateRequired(args, ['userId']);
      return toolOk(await auth0Fetch(`/users/${encodeURIComponent(String(args.userId))}`, token, domain));
    }

    case 'create_user': {
      validateRequired(args, ['connection', 'email']);
      const body: Record<string, unknown> = {
        connection: args.connection,
        email: args.email,
      };
      if (args.password !== undefined) body.password = args.password;
      if (args.name !== undefined) body.name = args.name;
      if (args.given_name !== undefined) body.given_name = args.given_name;
      if (args.family_name !== undefined) body.family_name = args.family_name;
      return toolOk(await auth0Fetch('/users', token, domain, {
        method: 'POST',
        body: JSON.stringify(body),
      }));
    }

    case 'update_user': {
      validateRequired(args, ['userId']);
      const { userId, ...rest } = args;
      return toolOk(await auth0Fetch(`/users/${encodeURIComponent(String(userId))}`, token, domain, {
        method: 'PATCH',
        body: JSON.stringify(rest),
      }));
    }

    case 'delete_user': {
      validateRequired(args, ['userId']);
      await auth0Fetch(`/users/${encodeURIComponent(String(args.userId))}`, token, domain, {
        method: 'DELETE',
      });
      return toolOk({ deleted: true });
    }

    case 'list_connections':
      return toolOk(await auth0Fetch('/connections?per_page=50', token, domain));

    case 'get_connection': {
      validateRequired(args, ['connectionId']);
      return toolOk(await auth0Fetch(`/connections/${encodeURIComponent(String(args.connectionId))}`, token, domain));
    }

    case 'list_applications':
      return toolOk(await auth0Fetch('/clients?per_page=50&fields=client_id,name,app_type,callbacks', token, domain));

    case 'get_application': {
      validateRequired(args, ['clientId']);
      return toolOk(await auth0Fetch(`/clients/${encodeURIComponent(String(args.clientId))}`, token, domain));
    }

    case 'list_roles':
      return toolOk(await auth0Fetch('/roles?per_page=50&include_totals=true', token, domain));

    case 'get_role': {
      validateRequired(args, ['roleId']);
      return toolOk(await auth0Fetch(`/roles/${encodeURIComponent(String(args.roleId))}`, token, domain));
    }

    case 'assign_role_to_user': {
      validateRequired(args, ['userId', 'roleId']);
      return toolOk(await auth0Fetch(`/users/${encodeURIComponent(String(args.userId))}/roles`, token, domain, {
        method: 'POST',
        body: JSON.stringify({ roles: [args.roleId] }),
      }));
    }

    case 'get_user_roles': {
      validateRequired(args, ['userId']);
      return toolOk(await auth0Fetch(`/users/${encodeURIComponent(String(args.userId))}/roles`, token, domain));
    }

    case 'list_logs':
      return toolOk(await auth0Fetch('/logs?per_page=25&sort=date:-1', token, domain));

    default:
      throw { code: -32601, message: `Method not found: ${name}` };
  }
}

// ── MCP request router ────────────────────────────────────────────────────────

async function handleMcp(request: Request): Promise<Response> {
  let body: { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
  try {
    body = await request.json() as typeof body;
  } catch {
    return rpcErr(null, -32700, 'Parse error');
  }

  const id = body.id ?? null;

  if (body.method === 'initialize') {
    return rpcOk(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'mcp-auth0', version: '1.0.0' },
    });
  }

  if (body.method === 'tools/list') {
    return rpcOk(id, { tools: TOOLS });
  }

  if (body.method === 'tools/call') {
    const { token, domain } = getSecrets(request);
    const missing: string[] = [];
    if (!token) missing.push('AUTH0_MANAGEMENT_TOKEN');
    if (!domain) missing.push('AUTH0_DOMAIN');
    if (missing.length > 0) {
      return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
    }

    const params = body.params ?? {};
    const toolName = params.name as string;
    const args = (params.arguments ?? {}) as Record<string, unknown>;

    try {
      const result = await handleTool(toolName, args, token!, domain!);
      return rpcOk(id, result);
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err) {
        const e = err as { code: number; message: string };
        return rpcErr(id, e.code, e.message);
      }
      return rpcErr(id, -32603, err instanceof Error ? err.message : 'Internal error');
    }
  }

  return rpcErr(id, -32601, `Method not found: ${body.method}`);
}

// ── Worker entry ──────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'mcp-auth0' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    return handleMcp(request);
  },
};
