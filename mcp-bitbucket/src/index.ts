/**
 * Bitbucket MCP Worker
 * Implements MCP protocol over HTTP for Bitbucket API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: BITBUCKET_TOKEN → header: X-Mcp-Secret-BITBUCKET-TOKEN
 */

const API_BASE = 'https://api.bitbucket.org/2.0';

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

function getApiKey(request: Request): string | null {
  return request.headers.get('X-Mcp-Secret-BITBUCKET-TOKEN');
}

async function apiGet(path: string, apiKey: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Bitbucket credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_repositories',
    description: 'List repositories in a Bitbucket workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        q: { type: 'string', description: 'Query string to filter repositories' },
        sort: { type: 'string', description: 'Field to sort by (e.g. -updated_on)' },
      },
      required: ['workspace'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_repository',
    description: 'Get details of a specific Bitbucket repository',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug' },
      },
      required: ['workspace', 'repo_slug'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_repository',
    description: 'Create a new Bitbucket repository',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug for the new repo' },
        scm: { type: 'string', description: 'SCM type: git or hg', enum: ['git', 'hg'] },
        is_private: { type: 'boolean', description: 'Whether the repository is private' },
        description: { type: 'string', description: 'Repository description' },
      },
      required: ['workspace', 'repo_slug'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_branches',
    description: 'List branches in a Bitbucket repository',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug' },
      },
      required: ['workspace', 'repo_slug'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_branch',
    description: 'Get details of a specific branch',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug' },
        name: { type: 'string', description: 'Branch name' },
      },
      required: ['workspace', 'repo_slug', 'name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_pull_requests',
    description: 'List pull requests in a Bitbucket repository',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug' },
        state: { type: 'string', description: 'PR state filter: OPEN, MERGED, DECLINED, SUPERSEDED' },
      },
      required: ['workspace', 'repo_slug'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_pull_request',
    description: 'Get details of a specific pull request',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug' },
        id: { type: 'number', description: 'Pull request ID' },
      },
      required: ['workspace', 'repo_slug', 'id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_pull_request',
    description: 'Create a new pull request in a Bitbucket repository',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug' },
        title: { type: 'string', description: 'Pull request title' },
        source_branch: { type: 'string', description: 'Source branch name' },
        destination_branch: { type: 'string', description: 'Destination branch name' },
        description: { type: 'string', description: 'Pull request description' },
      },
      required: ['workspace', 'repo_slug', 'title', 'source_branch', 'destination_branch'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'merge_pull_request',
    description: 'Merge a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug' },
        id: { type: 'number', description: 'Pull request ID' },
        merge_strategy: { type: 'string', description: 'Merge strategy: merge_commit, squash, fast_forward' },
      },
      required: ['workspace', 'repo_slug', 'id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_commits',
    description: 'List commits in a Bitbucket repository',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug' },
        branch: { type: 'string', description: 'Branch to list commits from' },
      },
      required: ['workspace', 'repo_slug'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_commit',
    description: 'Get details of a specific commit',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug' },
        node: { type: 'string', description: 'Commit hash (node)' },
      },
      required: ['workspace', 'repo_slug', 'node'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_pipelines',
    description: 'List pipelines in a Bitbucket repository',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug' },
      },
      required: ['workspace', 'repo_slug'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_pipeline',
    description: 'Get details of a specific pipeline',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug' },
        pipeline_uuid: { type: 'string', description: 'Pipeline UUID' },
      },
      required: ['workspace', 'repo_slug', 'pipeline_uuid'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_pipeline',
    description: 'Trigger a new pipeline in a Bitbucket repository',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug or UUID' },
        repo_slug: { type: 'string', description: 'Repository slug' },
        ref_type: { type: 'string', description: 'Reference type: branch or tag' },
        ref_name: { type: 'string', description: 'Branch or tag name' },
      },
      required: ['workspace', 'repo_slug', 'ref_type', 'ref_name'],
    },
    annotations: { readOnlyHint: false },
  },
];

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
  switch (name) {
    case '_ping': {
      return apiGet('/user', apiKey);
    }
    case 'list_repositories': {
      validateRequired(args, ['workspace']);
      const params: Record<string, string> = {};
      if (args.q) params.q = String(args.q);
      if (args.sort) params.sort = String(args.sort);
      return apiGet(`/repositories/${args.workspace}`, apiKey, params);
    }
    case 'get_repository': {
      validateRequired(args, ['workspace', 'repo_slug']);
      return apiGet(`/repositories/${args.workspace}/${args.repo_slug}`, apiKey);
    }
    case 'create_repository': {
      validateRequired(args, ['workspace', 'repo_slug']);
      const body: Record<string, unknown> = {};
      if (args.scm) body.scm = args.scm;
      if (args.is_private !== undefined) body.is_private = args.is_private;
      if (args.description) body.description = args.description;
      return apiPost(`/repositories/${args.workspace}/${args.repo_slug}`, apiKey, body);
    }
    case 'list_branches': {
      validateRequired(args, ['workspace', 'repo_slug']);
      return apiGet(`/repositories/${args.workspace}/${args.repo_slug}/refs/branches`, apiKey);
    }
    case 'get_branch': {
      validateRequired(args, ['workspace', 'repo_slug', 'name']);
      return apiGet(`/repositories/${args.workspace}/${args.repo_slug}/refs/branches/${args.name}`, apiKey);
    }
    case 'list_pull_requests': {
      validateRequired(args, ['workspace', 'repo_slug']);
      const params: Record<string, string> = {};
      if (args.state) params.state = String(args.state);
      return apiGet(`/repositories/${args.workspace}/${args.repo_slug}/pullrequests`, apiKey, params);
    }
    case 'get_pull_request': {
      validateRequired(args, ['workspace', 'repo_slug', 'id']);
      return apiGet(`/repositories/${args.workspace}/${args.repo_slug}/pullrequests/${args.id}`, apiKey);
    }
    case 'create_pull_request': {
      validateRequired(args, ['workspace', 'repo_slug', 'title', 'source_branch', 'destination_branch']);
      const body: Record<string, unknown> = {
        title: args.title,
        source: { branch: { name: args.source_branch } },
        destination: { branch: { name: args.destination_branch } },
      };
      if (args.description) body.description = args.description;
      return apiPost(`/repositories/${args.workspace}/${args.repo_slug}/pullrequests`, apiKey, body);
    }
    case 'merge_pull_request': {
      validateRequired(args, ['workspace', 'repo_slug', 'id']);
      const body: Record<string, unknown> = {};
      if (args.merge_strategy) body.merge_strategy = args.merge_strategy;
      return apiPost(`/repositories/${args.workspace}/${args.repo_slug}/pullrequests/${args.id}/merge`, apiKey, body);
    }
    case 'list_commits': {
      validateRequired(args, ['workspace', 'repo_slug']);
      const params: Record<string, string> = {};
      if (args.branch) params.branch = String(args.branch);
      return apiGet(`/repositories/${args.workspace}/${args.repo_slug}/commits`, apiKey, params);
    }
    case 'get_commit': {
      validateRequired(args, ['workspace', 'repo_slug', 'node']);
      return apiGet(`/repositories/${args.workspace}/${args.repo_slug}/commit/${args.node}`, apiKey);
    }
    case 'list_pipelines': {
      validateRequired(args, ['workspace', 'repo_slug']);
      return apiGet(`/repositories/${args.workspace}/${args.repo_slug}/pipelines/`, apiKey, { sort: '-created_on' });
    }
    case 'get_pipeline': {
      validateRequired(args, ['workspace', 'repo_slug', 'pipeline_uuid']);
      return apiGet(`/repositories/${args.workspace}/${args.repo_slug}/pipelines/${args.pipeline_uuid}`, apiKey);
    }
    case 'create_pipeline': {
      validateRequired(args, ['workspace', 'repo_slug', 'ref_type', 'ref_name']);
      return apiPost(`/repositories/${args.workspace}/${args.repo_slug}/pipelines/`, apiKey, {
        target: { ref_type: args.ref_type, type: 'pipeline_ref_target', ref_name: args.ref_name },
      });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-bitbucket', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-bitbucket', version: '1.0.0' },
      });
    }
    if (method === 'tools/list') {
      return rpcOk(id, { tools: TOOLS });
    }
    if (method === 'tools/call') {
      const apiKey = getApiKey(request);
      if (!apiKey) return rpcErr(id, -32001, 'Missing API key');
      try {
        const result = await callTool(params?.name ?? '', (params?.arguments ?? {}) as Record<string, unknown>, apiKey);
        return rpcOk(id, toolOk(result));
      } catch (err) {
        return rpcErr(id, -32603, err instanceof Error ? err.message : 'Internal error');
      }
    }
    return rpcErr(id, -32601, 'Method not found');
  },
};
