/**
 * Confluence MCP Worker
 * Implements MCP protocol over HTTP for Confluence API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   CONFLUENCE_EMAIL      → header: X-Mcp-Secret-CONFLUENCE-EMAIL
 *   CONFLUENCE_API_TOKEN  → header: X-Mcp-Secret-CONFLUENCE-API-TOKEN
 *   CONFLUENCE_DOMAIN     → header: X-Mcp-Secret-CONFLUENCE-DOMAIN
 */

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

interface ConfluenceSecrets {
  email: string;
  apiToken: string;
  domain: string;
}

function getSecrets(request: Request): ConfluenceSecrets | null {
  const email = request.headers.get('X-Mcp-Secret-CONFLUENCE-EMAIL');
  const apiToken = request.headers.get('X-Mcp-Secret-CONFLUENCE-API-TOKEN');
  const domain = request.headers.get('X-Mcp-Secret-CONFLUENCE-DOMAIN');
  if (!email || !apiToken || !domain) return null;
  return { email, apiToken, domain };
}

function getApiBase(domain: string): string {
  return `https://${domain}.atlassian.net/wiki/rest/api`;
}

async function apiGet(path: string, secrets: ConfluenceSecrets, params?: Record<string, string>): Promise<unknown> {
  const apiBase = getApiBase(secrets.domain);
  const url = new URL(`${apiBase}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const credentials = btoa(`${secrets.email}:${secrets.apiToken}`);
  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path: string, secrets: ConfluenceSecrets, body: unknown): Promise<unknown> {
  const apiBase = getApiBase(secrets.domain);
  const credentials = btoa(`${secrets.email}:${secrets.apiToken}`);
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPut(path: string, secrets: ConfluenceSecrets, body: unknown): Promise<unknown> {
  const apiBase = getApiBase(secrets.domain);
  const credentials = btoa(`${secrets.email}:${secrets.apiToken}`);
  const res = await fetch(`${apiBase}${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiDelete(path: string, secrets: ConfluenceSecrets): Promise<unknown> {
  const apiBase = getApiBase(secrets.domain);
  const credentials = btoa(`${secrets.email}:${secrets.apiToken}`);
  const res = await fetch(`${apiBase}${path}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return { deleted: true };
}

const TOOLS = [
  {
    name: 'list_spaces',
    description: 'List all Confluence spaces',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum results (default: 25)' },
        start: { type: 'number', description: 'Start index for pagination (default: 0)' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_space',
    description: 'Get details of a specific Confluence space',
    inputSchema: {
      type: 'object',
      properties: {
        spaceKey: { type: 'string', description: 'Space key' },
      },
      required: ['spaceKey'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_pages',
    description: 'List pages in a Confluence space',
    inputSchema: {
      type: 'object',
      properties: {
        spaceKey: { type: 'string', description: 'Space key' },
        limit: { type: 'number', description: 'Maximum results (default: 25)' },
      },
      required: ['spaceKey'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_page',
    description: 'Get a specific Confluence page with body content',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID' },
      },
      required: ['pageId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_page',
    description: 'Create a new Confluence page',
    inputSchema: {
      type: 'object',
      properties: {
        spaceKey: { type: 'string', description: 'Space key to create page in' },
        title: { type: 'string', description: 'Page title' },
        body: { type: 'string', description: 'Page body in Confluence storage format (HTML)' },
        parentId: { type: 'string', description: 'Parent page ID (optional)' },
      },
      required: ['spaceKey', 'title', 'body'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_page',
    description: 'Update an existing Confluence page',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID to update' },
        title: { type: 'string', description: 'New page title' },
        body: { type: 'string', description: 'New page body in Confluence storage format' },
        version: { type: 'number', description: 'Current version number (required for optimistic locking)' },
      },
      required: ['pageId', 'title', 'body', 'version'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_page',
    description: 'Delete a Confluence page',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID to delete' },
      },
      required: ['pageId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'search_content',
    description: 'Search Confluence content using CQL (Confluence Query Language)',
    inputSchema: {
      type: 'object',
      properties: {
        cql: { type: 'string', description: 'CQL query string (e.g. type=page AND space=DEV)' },
        limit: { type: 'number', description: 'Maximum results (default: 20)' },
      },
      required: ['cql'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_children',
    description: 'List child pages of a Confluence page',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Parent page ID' },
      },
      required: ['pageId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_page_history',
    description: 'Get version history of a Confluence page',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID' },
      },
      required: ['pageId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'add_comment',
    description: 'Add a comment to a Confluence page',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID to comment on' },
        body: { type: 'string', description: 'Comment body in Confluence storage format' },
      },
      required: ['pageId', 'body'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_comments',
    description: 'List comments on a Confluence page',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID' },
      },
      required: ['pageId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_blog_posts',
    description: 'List blog posts in a Confluence space',
    inputSchema: {
      type: 'object',
      properties: {
        spaceKey: { type: 'string', description: 'Space key' },
      },
      required: ['spaceKey'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_current_user',
    description: 'Get the current authenticated Confluence user',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
];

async function callTool(name: string, args: Record<string, unknown>, secrets: ConfluenceSecrets): Promise<unknown> {
  switch (name) {
    case 'list_spaces': {
      return apiGet('/space', secrets, {
        limit: String(args.limit ?? 25),
        start: String(args.start ?? 0),
      });
    }
    case 'get_space': {
      validateRequired(args, ['spaceKey']);
      return apiGet(`/space/${args.spaceKey}`, secrets);
    }
    case 'list_pages': {
      validateRequired(args, ['spaceKey']);
      return apiGet('/content', secrets, {
        type: 'page',
        spaceKey: String(args.spaceKey),
        limit: String(args.limit ?? 25),
      });
    }
    case 'get_page': {
      validateRequired(args, ['pageId']);
      return apiGet(`/content/${args.pageId}`, secrets, { expand: 'body.storage,version,space' });
    }
    case 'create_page': {
      validateRequired(args, ['spaceKey', 'title', 'body']);
      const pageBody: Record<string, unknown> = {
        type: 'page',
        title: args.title,
        space: { key: args.spaceKey },
        body: { storage: { value: args.body, representation: 'storage' } },
      };
      if (args.parentId) pageBody.ancestors = [{ id: args.parentId }];
      return apiPost('/content', secrets, pageBody);
    }
    case 'update_page': {
      validateRequired(args, ['pageId', 'title', 'body', 'version']);
      return apiPut(`/content/${args.pageId}`, secrets, {
        type: 'page',
        title: args.title,
        version: { number: args.version },
        body: { storage: { value: args.body, representation: 'storage' } },
      });
    }
    case 'delete_page': {
      validateRequired(args, ['pageId']);
      return apiDelete(`/content/${args.pageId}`, secrets);
    }
    case 'search_content': {
      validateRequired(args, ['cql']);
      return apiGet('/content/search', secrets, {
        cql: String(args.cql),
        limit: String(args.limit ?? 20),
      });
    }
    case 'list_children': {
      validateRequired(args, ['pageId']);
      return apiGet(`/content/${args.pageId}/child/page`, secrets);
    }
    case 'get_page_history': {
      validateRequired(args, ['pageId']);
      return apiGet(`/content/${args.pageId}/history`, secrets);
    }
    case 'add_comment': {
      validateRequired(args, ['pageId', 'body']);
      return apiPost('/content', secrets, {
        type: 'comment',
        container: { id: args.pageId, type: 'page' },
        body: { storage: { value: args.body, representation: 'storage' } },
      });
    }
    case 'list_comments': {
      validateRequired(args, ['pageId']);
      return apiGet(`/content/${args.pageId}/child/comment`, secrets, { expand: 'body.storage' });
    }
    case 'list_blog_posts': {
      validateRequired(args, ['spaceKey']);
      return apiGet('/content', secrets, { type: 'blogpost', spaceKey: String(args.spaceKey) });
    }
    case 'get_current_user': {
      return apiGet('/user/current', secrets);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-confluence', version: '1.0.0' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    let body: { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
    try {
      body = await request.json();
    } catch {
      return rpcErr(null, -32700, 'Parse error');
    }
    const { id = null, method, params } = body;
    if (method === 'initialize') {
      return rpcOk(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mcp-confluence', version: '1.0.0' },
      });
    }
    if (method === 'tools/list') {
      return rpcOk(id, { tools: TOOLS });
    }
    if (method === 'tools/call') {
      const secrets = getSecrets(request);
      if (!secrets) return rpcErr(id, -32001, 'Missing secrets: CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, and CONFLUENCE_DOMAIN are required');
      try {
        const result = await callTool(params?.name ?? '', (params?.arguments ?? {}) as Record<string, unknown>, secrets);
        return rpcOk(id, toolOk(result));
      } catch (err) {
        return rpcErr(id, -32603, err instanceof Error ? err.message : 'Internal error');
      }
    }
    return rpcErr(id, -32601, 'Method not found');
  },
};
