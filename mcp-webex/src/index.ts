/**
 * Webex MCP Worker
 * Implements MCP protocol over HTTP for Cisco Webex API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: WEBEX_ACCESS_TOKEN → header: X-Mcp-Secret-WEBEX-ACCESS-TOKEN
 */

const WEBEX_API = 'https://webexapis.com/v1';

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
  return request.headers.get('X-Mcp-Secret-WEBEX-ACCESS-TOKEN');
}

async function apiFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${WEBEX_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webex API error ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const TOOLS = [
  {
    name: 'get_current_user',
    description: 'Get the current authenticated Webex user',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_rooms',
    description: 'List Webex rooms/spaces',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['direct', 'group'], description: 'Room type filter (optional, default group)' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_room',
    description: 'Get a specific room by ID',
    inputSchema: {
      type: 'object',
      properties: {
        room_id: { type: 'string', description: 'Room ID' },
      },
      required: ['room_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_room',
    description: 'Create a new Webex room/space',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Room title' },
        team_id: { type: 'string', description: 'Team ID to associate room with (optional)' },
      },
      required: ['title'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_messages',
    description: 'List messages in a room',
    inputSchema: {
      type: 'object',
      properties: {
        room_id: { type: 'string', description: 'Room ID' },
        max: { type: 'number', description: 'Maximum messages to return (default 50)' },
      },
      required: ['room_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_message',
    description: 'Get a specific message by ID',
    inputSchema: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'Message ID' },
      },
      required: ['message_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'send_message',
    description: 'Send a message to a room or person',
    inputSchema: {
      type: 'object',
      properties: {
        room_id: { type: 'string', description: 'Room ID (optional, use room_id or to_person_email)' },
        to_person_id: { type: 'string', description: 'Person ID for direct message (optional)' },
        to_person_email: { type: 'string', description: 'Person email for direct message (optional)' },
        text: { type: 'string', description: 'Plain text message (optional)' },
        markdown: { type: 'string', description: 'Markdown message (optional)' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_message',
    description: 'Delete a message',
    inputSchema: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'Message ID to delete' },
      },
      required: ['message_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_memberships',
    description: 'List memberships for a room',
    inputSchema: {
      type: 'object',
      properties: {
        room_id: { type: 'string', description: 'Room ID' },
      },
      required: ['room_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'add_member',
    description: 'Add a person to a room by email',
    inputSchema: {
      type: 'object',
      properties: {
        room_id: { type: 'string', description: 'Room ID' },
        person_email: { type: 'string', description: 'Email of person to add' },
        is_moderator: { type: 'boolean', description: 'Grant moderator role (optional)' },
      },
      required: ['room_id', 'person_email'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'remove_member',
    description: 'Remove a membership from a room',
    inputSchema: {
      type: 'object',
      properties: {
        membership_id: { type: 'string', description: 'Membership ID to remove' },
      },
      required: ['membership_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_teams',
    description: 'List all Webex teams',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_team',
    description: 'Create a new Webex team',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Team name' },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'create_meeting',
    description: 'Schedule a Webex meeting',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Meeting title' },
        start: { type: 'string', description: 'Start time in ISO8601 format' },
        end: { type: 'string', description: 'End time in ISO8601 format' },
        agenda: { type: 'string', description: 'Meeting agenda (optional)' },
        enable_auto_record: { type: 'boolean', description: 'Enable auto recording (optional)' },
      },
      required: ['title', 'start', 'end'],
    },
    annotations: { readOnlyHint: false },
  },
];

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
  switch (name) {
    case 'get_current_user':
      return apiFetch('/people/me', token);

    case 'list_rooms': {
      const type = (args.type as string) ?? 'group';
      return apiFetch(`/rooms?max=50&type=${type}`, token);
    }

    case 'get_room': {
      validateRequired(args, ['room_id']);
      return apiFetch(`/rooms/${args.room_id}`, token);
    }

    case 'create_room': {
      validateRequired(args, ['title']);
      const body: Record<string, unknown> = { title: args.title };
      if (args.team_id) body.teamId = args.team_id;
      return apiFetch('/rooms', token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    case 'list_messages': {
      validateRequired(args, ['room_id']);
      const max = (args.max as number) ?? 50;
      return apiFetch(`/messages?roomId=${args.room_id}&max=${max}`, token);
    }

    case 'get_message': {
      validateRequired(args, ['message_id']);
      return apiFetch(`/messages/${args.message_id}`, token);
    }

    case 'send_message': {
      const body: Record<string, unknown> = {};
      if (args.room_id) body.roomId = args.room_id;
      if (args.to_person_id) body.toPersonId = args.to_person_id;
      if (args.to_person_email) body.toPersonEmail = args.to_person_email;
      if (args.text) body.text = args.text;
      if (args.markdown) body.markdown = args.markdown;
      if (!body.roomId && !body.toPersonId && !body.toPersonEmail) {
        throw new Error('Missing required fields: room_id, to_person_id, or to_person_email');
      }
      return apiFetch('/messages', token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    case 'delete_message': {
      validateRequired(args, ['message_id']);
      await apiFetch(`/messages/${args.message_id}`, token, { method: 'DELETE' });
      return { deleted: true };
    }

    case 'list_memberships': {
      validateRequired(args, ['room_id']);
      return apiFetch(`/memberships?roomId=${args.room_id}&max=100`, token);
    }

    case 'add_member': {
      validateRequired(args, ['room_id', 'person_email']);
      const body: Record<string, unknown> = {
        roomId: args.room_id,
        personEmail: args.person_email,
      };
      if (args.is_moderator !== undefined) body.isModerator = args.is_moderator;
      return apiFetch('/memberships', token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    case 'remove_member': {
      validateRequired(args, ['membership_id']);
      await apiFetch(`/memberships/${args.membership_id}`, token, { method: 'DELETE' });
      return { deleted: true };
    }

    case 'list_teams':
      return apiFetch('/teams?max=50', token);

    case 'create_team': {
      validateRequired(args, ['name']);
      return apiFetch('/teams', token, {
        method: 'POST',
        body: JSON.stringify({ name: args.name }),
      });
    }

    case 'create_meeting': {
      validateRequired(args, ['title', 'start', 'end']);
      const body: Record<string, unknown> = {
        title: args.title,
        start: args.start,
        end: args.end,
      };
      if (args.agenda) body.agenda = args.agenda;
      if (args.enable_auto_record !== undefined) body.enabledAutoRecordMeeting = args.enable_auto_record;
      return apiFetch('/meetings', token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-webex', version: '1.0.0' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    let body: {
      jsonrpc?: string;
      id?: string | number | null;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
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
        serverInfo: { name: 'mcp-webex', version: '1.0.0' },
      });
    }

    if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });

    if (method === 'tools/call') {
      const apiKey = getApiKey(request);
      if (!apiKey) return rpcErr(id, -32001, 'Missing API key');
      try {
        const result = await callTool(
          params?.name ?? '',
          (params?.arguments ?? {}) as Record<string, unknown>,
          apiKey,
        );
        return rpcOk(id, toolOk(result));
      } catch (err) {
        return rpcErr(id, -32603, err instanceof Error ? err.message : 'Internal error');
      }
    }

    return rpcErr(id, -32601, 'Method not found');
  },
};
