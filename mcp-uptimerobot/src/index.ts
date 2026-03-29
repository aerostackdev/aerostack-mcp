/**
 * UptimeRobot MCP Worker
 * Implements MCP protocol over HTTP for UptimeRobot monitoring operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   UPTIMEROBOT_API_KEY → X-Mcp-Secret-UPTIMEROBOT-API-KEY
 *
 * Auth format: api_key is passed in the POST body (not a header)
 * Base URL: https://api.uptimerobot.com/v2
 */

const UPTIMEROBOT_API_BASE = 'https://api.uptimerobot.com/v2';

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

function getApiKey(request: Request): string | null {
  return request.headers.get('X-Mcp-Secret-UPTIMEROBOT-API-KEY');
}

async function uptimeFetch(
  endpoint: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${UPTIMEROBOT_API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(
      Object.entries(params).reduce((acc, [k, v]) => {
        acc[k] = String(v);
        return acc;
      }, {} as Record<string, string>),
    ).toString(),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`UptimeRobot API error ${res.status}: ${text}`);
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_account_details',
    description: 'Get UptimeRobot account details including plan and limits',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_monitors',
    description: 'List all monitors in the UptimeRobot account',
    inputSchema: {
      type: 'object',
      properties: {
        logs: { type: 'number', description: '1 to include logs, 0 to exclude (default: 0)' },
        response_times: { type: 'number', description: '1 to include response times (default: 0)' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_monitor',
    description: 'Get details of a specific UptimeRobot monitor including logs',
    inputSchema: {
      type: 'object',
      properties: { monitorId: { type: 'string', description: 'Monitor ID' } },
      required: ['monitorId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_monitor',
    description: 'Create a new UptimeRobot monitor',
    inputSchema: {
      type: 'object',
      properties: {
        friendly_name: { type: 'string', description: 'Display name for the monitor' },
        url: { type: 'string', description: 'URL to monitor' },
        type: { type: 'number', description: 'Monitor type: 1=HTTP(s), 2=keyword, 3=ping, 4=port' },
      },
      required: ['friendly_name', 'url', 'type'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_monitor',
    description: 'Update an existing UptimeRobot monitor',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Monitor ID' },
        friendly_name: { type: 'string', description: 'New display name' },
        url: { type: 'string', description: 'New URL' },
        interval: { type: 'number', description: 'Check interval in seconds' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_monitor',
    description: 'Delete a UptimeRobot monitor',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Monitor ID to delete' } },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'pause_monitor',
    description: 'Pause a UptimeRobot monitor (set status to paused)',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Monitor ID to pause' } },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'resume_monitor',
    description: 'Resume a paused UptimeRobot monitor',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Monitor ID to resume' } },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_alert_contacts',
    description: 'List all alert contacts configured in UptimeRobot',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_alert_contact',
    description: 'Create a new alert contact in UptimeRobot',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'number', description: 'Contact type: 1=SMS, 2=Email, 3=Twitter, 5=Webhook' },
        value: { type: 'string', description: 'Contact value (email address, phone, URL)' },
        friendly_name: { type: 'string', description: 'Display name for the contact' },
      },
      required: ['type', 'value', 'friendly_name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_alert_contact',
    description: 'Delete an alert contact from UptimeRobot',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Alert contact ID to delete' } },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_public_status_pages',
    description: 'List all public status pages in UptimeRobot',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleTool(
  name: string,
  args: Record<string, unknown>,
  apiKey: string,
): Promise<unknown> {
  switch (name) {
    case 'get_account_details':
      return toolOk(await uptimeFetch('getAccountDetails', { api_key: apiKey, format: 'json' }));

    case 'list_monitors': {
      const params: Record<string, unknown> = { api_key: apiKey, format: 'json' };
      if (args.logs !== undefined) params.logs = args.logs;
      if (args.response_times !== undefined) params.response_times = args.response_times;
      return toolOk(await uptimeFetch('getMonitors', params));
    }

    case 'get_monitor': {
      validateRequired(args, ['monitorId']);
      return toolOk(await uptimeFetch('getMonitors', {
        api_key: apiKey,
        monitors: args.monitorId,
        format: 'json',
        logs: 1,
      }));
    }

    case 'create_monitor': {
      validateRequired(args, ['friendly_name', 'url', 'type']);
      return toolOk(await uptimeFetch('newMonitor', {
        api_key: apiKey,
        format: 'json',
        friendly_name: args.friendly_name,
        url: args.url,
        type: args.type,
      }));
    }

    case 'update_monitor': {
      validateRequired(args, ['id']);
      const params: Record<string, unknown> = { api_key: apiKey, format: 'json', id: args.id };
      if (args.friendly_name !== undefined) params.friendly_name = args.friendly_name;
      if (args.url !== undefined) params.url = args.url;
      if (args.interval !== undefined) params.interval = args.interval;
      return toolOk(await uptimeFetch('editMonitor', params));
    }

    case 'delete_monitor': {
      validateRequired(args, ['id']);
      return toolOk(await uptimeFetch('deleteMonitor', { api_key: apiKey, format: 'json', id: args.id }));
    }

    case 'pause_monitor': {
      validateRequired(args, ['id']);
      return toolOk(await uptimeFetch('editMonitor', { api_key: apiKey, format: 'json', id: args.id, status: 0 }));
    }

    case 'resume_monitor': {
      validateRequired(args, ['id']);
      return toolOk(await uptimeFetch('editMonitor', { api_key: apiKey, format: 'json', id: args.id, status: 1 }));
    }

    case 'list_alert_contacts':
      return toolOk(await uptimeFetch('getAlertContacts', { api_key: apiKey, format: 'json' }));

    case 'create_alert_contact': {
      validateRequired(args, ['type', 'value', 'friendly_name']);
      return toolOk(await uptimeFetch('newAlertContact', {
        api_key: apiKey,
        format: 'json',
        type: args.type,
        value: args.value,
        friendly_name: args.friendly_name,
      }));
    }

    case 'delete_alert_contact': {
      validateRequired(args, ['id']);
      return toolOk(await uptimeFetch('deleteAlertContact', { api_key: apiKey, format: 'json', id: args.id }));
    }

    case 'get_public_status_pages':
      return toolOk(await uptimeFetch('getPSPs', { api_key: apiKey, format: 'json' }));

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
      serverInfo: { name: 'mcp-uptimerobot', version: '1.0.0' },
    });
  }

  if (body.method === 'tools/list') {
    return rpcOk(id, { tools: TOOLS });
  }

  if (body.method === 'tools/call') {
    const apiKey = getApiKey(request);
    if (!apiKey) return rpcErr(id, -32001, 'Missing required secret: UPTIMEROBOT_API_KEY');

    const params = body.params ?? {};
    const toolName = params.name as string;
    const args = (params.arguments ?? {}) as Record<string, unknown>;

    try {
      const result = await handleTool(toolName, args, apiKey);
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
      return new Response(JSON.stringify({ status: 'ok', service: 'mcp-uptimerobot' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    return handleMcp(request);
  },
};
