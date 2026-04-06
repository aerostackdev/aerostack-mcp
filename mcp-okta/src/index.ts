/**
 * Okta MCP Worker
 * Implements MCP protocol over HTTP for Okta identity and access management.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   OKTA_API_TOKEN → X-Mcp-Secret-OKTA-API-TOKEN
 *   OKTA_DOMAIN    → X-Mcp-Secret-OKTA-DOMAIN (e.g. dev-12345.okta.com)
 *
 * Auth format: Authorization: SSWS {token}
 * Base URL: https://{domain}/api/v1
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
    token: request.headers.get('X-Mcp-Secret-OKTA-API-TOKEN'),
    domain: request.headers.get('X-Mcp-Secret-OKTA-DOMAIN'),
  };
}

async function oktaFetch(
  path: string,
  token: string,
  domain: string,
  options: RequestInit = {},
): Promise<unknown> {
  const base = `https://${domain}/api/v1`;
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `SSWS ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string> || {}),
    },
  });
  if (res.status === 204 || res.status === 200 && res.headers.get('content-length') === '0') return {};
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Okta API error ${res.status}: ${text}`);
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Okta credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'list_users',
    description: 'List users in the Okta organization with optional search',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query to filter users by name or email' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_user',
    description: 'Get details of a specific Okta user',
    inputSchema: {
      type: 'object',
      properties: { userId: { type: 'string', description: 'Okta user ID or login' } },
      required: ['userId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_user',
    description: 'Create a new Okta user',
    inputSchema: {
      type: 'object',
      properties: {
        firstName: { type: 'string', description: 'First name' },
        lastName: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email address (also used as login)' },
        login: { type: 'string', description: 'Login (defaults to email if not provided)' },
        activate: { type: 'boolean', description: 'Whether to activate immediately (default: false)' },
        password: { type: 'string', description: 'Initial password (optional)' },
      },
      required: ['firstName', 'lastName', 'email'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_user',
    description: 'Update an Okta user profile',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Okta user ID' },
        firstName: { type: 'string', description: 'Updated first name' },
        lastName: { type: 'string', description: 'Updated last name' },
        email: { type: 'string', description: 'Updated email' },
        mobilePhone: { type: 'string', description: 'Updated mobile phone' },
      },
      required: ['userId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'deactivate_user',
    description: 'Deactivate an Okta user',
    inputSchema: {
      type: 'object',
      properties: { userId: { type: 'string', description: 'Okta user ID' } },
      required: ['userId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'activate_user',
    description: 'Activate an Okta user',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Okta user ID' },
        sendEmail: { type: 'boolean', description: 'Whether to send activation email (default: true)' },
      },
      required: ['userId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_groups',
    description: 'List groups in the Okta organization',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query to filter groups by name' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_group',
    description: 'Get details of a specific Okta group',
    inputSchema: {
      type: 'object',
      properties: { groupId: { type: 'string', description: 'Okta group ID' } },
      required: ['groupId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_group',
    description: 'Create a new Okta group',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Group name' },
        description: { type: 'string', description: 'Group description (optional)' },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'add_user_to_group',
    description: 'Add a user to an Okta group',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'Okta group ID' },
        userId: { type: 'string', description: 'Okta user ID' },
      },
      required: ['groupId', 'userId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'remove_user_from_group',
    description: 'Remove a user from an Okta group',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'Okta group ID' },
        userId: { type: 'string', description: 'Okta user ID' },
      },
      required: ['groupId', 'userId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_applications',
    description: 'List applications in the Okta organization',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query to filter applications' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_application',
    description: 'Get details of a specific Okta application',
    inputSchema: {
      type: 'object',
      properties: { appId: { type: 'string', description: 'Okta application ID' } },
      required: ['appId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_user_sessions',
    description: 'List active sessions for a specific Okta user',
    inputSchema: {
      type: 'object',
      properties: { userId: { type: 'string', description: 'Okta user ID' } },
      required: ['userId'],
    },
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
      // GET /api/v1/users/me — validates API token + domain
      const data = (await oktaFetch('/users/me', token, domain)) as any;
      return toolOk({ connected: true, login: data?.profile?.login ?? data?.login ?? 'unknown', status: data?.status ?? 'unknown' });
    }

    case 'list_users': {
      const q = args.q ? `?limit=25&q=${encodeURIComponent(String(args.q))}` : '?limit=25';
      return toolOk(await oktaFetch(`/users${q}`, token, domain));
    }

    case 'get_user': {
      validateRequired(args, ['userId']);
      return toolOk(await oktaFetch(`/users/${encodeURIComponent(String(args.userId))}`, token, domain));
    }

    case 'create_user': {
      validateRequired(args, ['firstName', 'lastName', 'email']);
      const activate = args.activate === true ? 'true' : 'false';
      const profile: Record<string, unknown> = {
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        login: args.login ?? args.email,
      };
      const body: Record<string, unknown> = { profile };
      if (args.password) {
        body.credentials = { password: { value: args.password } };
      }
      return toolOk(await oktaFetch(`/users?activate=${activate}`, token, domain, {
        method: 'POST',
        body: JSON.stringify(body),
      }));
    }

    case 'update_user': {
      validateRequired(args, ['userId']);
      const profile: Record<string, unknown> = {};
      if (args.firstName !== undefined) profile.firstName = args.firstName;
      if (args.lastName !== undefined) profile.lastName = args.lastName;
      if (args.email !== undefined) profile.email = args.email;
      if (args.mobilePhone !== undefined) profile.mobilePhone = args.mobilePhone;
      return toolOk(await oktaFetch(`/users/${args.userId}`, token, domain, {
        method: 'POST',
        body: JSON.stringify({ profile }),
      }));
    }

    case 'deactivate_user': {
      validateRequired(args, ['userId']);
      return toolOk(await oktaFetch(`/users/${encodeURIComponent(String(args.userId))}/lifecycle/deactivate`, token, domain, {
        method: 'POST',
        body: '{}',
      }));
    }

    case 'activate_user': {
      validateRequired(args, ['userId']);
      const sendEmail = args.sendEmail === false ? 'false' : 'true';
      return toolOk(await oktaFetch(`/users/${encodeURIComponent(String(args.userId))}/lifecycle/activate?sendEmail=${sendEmail}`, token, domain, {
        method: 'POST',
        body: '{}',
      }));
    }

    case 'list_groups': {
      const q = args.q ? `?limit=25&q=${encodeURIComponent(String(args.q))}` : '?limit=25';
      return toolOk(await oktaFetch(`/groups${q}`, token, domain));
    }

    case 'get_group': {
      validateRequired(args, ['groupId']);
      return toolOk(await oktaFetch(`/groups/${encodeURIComponent(String(args.groupId))}`, token, domain));
    }

    case 'create_group': {
      validateRequired(args, ['name']);
      const profile: Record<string, unknown> = { name: args.name };
      if (args.description) profile.description = args.description;
      return toolOk(await oktaFetch('/groups', token, domain, {
        method: 'POST',
        body: JSON.stringify({ profile }),
      }));
    }

    case 'add_user_to_group': {
      validateRequired(args, ['groupId', 'userId']);
      await oktaFetch(`/groups/${encodeURIComponent(String(args.groupId))}/users/${encodeURIComponent(String(args.userId))}`, token, domain, { method: 'PUT', body: '' });
      return toolOk({ added: true });
    }

    case 'remove_user_from_group': {
      validateRequired(args, ['groupId', 'userId']);
      await oktaFetch(`/groups/${encodeURIComponent(String(args.groupId))}/users/${encodeURIComponent(String(args.userId))}`, token, domain, { method: 'DELETE' });
      return toolOk({ removed: true });
    }

    case 'list_applications': {
      const q = args.q ? `?limit=25&q=${encodeURIComponent(String(args.q))}` : '?limit=25';
      return toolOk(await oktaFetch(`/apps${q}`, token, domain));
    }

    case 'get_application': {
      validateRequired(args, ['appId']);
      return toolOk(await oktaFetch(`/apps/${encodeURIComponent(String(args.appId))}`, token, domain));
    }

    case 'list_user_sessions': {
      validateRequired(args, ['userId']);
      return toolOk(await oktaFetch(`/users/${encodeURIComponent(String(args.userId))}/sessions`, token, domain));
    }

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
      serverInfo: { name: 'mcp-okta', version: '1.0.0' },
    });
  }

  if (body.method === 'tools/list') {
    return rpcOk(id, { tools: TOOLS });
  }

  if (body.method === 'tools/call') {
    const { token, domain } = getSecrets(request);
    const missing: string[] = [];
    if (!token) missing.push('OKTA_API_TOKEN');
    if (!domain) missing.push('OKTA_DOMAIN');
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
      return new Response(JSON.stringify({ status: 'ok', service: 'mcp-okta' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    return handleMcp(request);
  },
};
