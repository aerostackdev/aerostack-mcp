/**
 * Google Forms MCP Worker
 * Implements MCP protocol over HTTP for Google Forms API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: GOOGLE_FORMS_ACCESS_TOKEN → header: X-Mcp-Secret-GOOGLE-FORMS-ACCESS-TOKEN
 */

const FORMS_API = 'https://forms.googleapis.com/v1';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

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
  return request.headers.get('X-Mcp-Secret-GOOGLE-FORMS-ACCESS-TOKEN');
}

async function apiFetch(url: string, token: string, options: RequestInit = {}): Promise<unknown> {
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
    throw new Error(`Google Forms API error ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const TOOLS = [
  {
    name: 'get_form',
    description: 'Get a Google Form by ID including all questions and settings',
    inputSchema: {
      type: 'object',
      properties: {
        form_id: { type: 'string', description: 'Form ID' },
      },
      required: ['form_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_form',
    description: 'Create a new Google Form',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Form title' },
        document_title: { type: 'string', description: 'Document title in Drive (optional, defaults to form title)' },
      },
      required: ['title'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_form',
    description: 'Update form title or description',
    inputSchema: {
      type: 'object',
      properties: {
        form_id: { type: 'string', description: 'Form ID' },
        title: { type: 'string', description: 'New title (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
      },
      required: ['form_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_responses',
    description: 'List responses to a form',
    inputSchema: {
      type: 'object',
      properties: {
        form_id: { type: 'string', description: 'Form ID' },
        page_size: { type: 'number', description: 'Number of responses to return (default 50)' },
      },
      required: ['form_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_response',
    description: 'Get a specific form response',
    inputSchema: {
      type: 'object',
      properties: {
        form_id: { type: 'string', description: 'Form ID' },
        response_id: { type: 'string', description: 'Response ID' },
      },
      required: ['form_id', 'response_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'batch_update_form',
    description: 'Execute a batch update on a form (pass-through for advanced operations)',
    inputSchema: {
      type: 'object',
      properties: {
        form_id: { type: 'string', description: 'Form ID' },
        requests: { type: 'array', description: 'Array of request objects', items: { type: 'object' } },
      },
      required: ['form_id', 'requests'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'add_question',
    description: 'Add a question to a form',
    inputSchema: {
      type: 'object',
      properties: {
        form_id: { type: 'string', description: 'Form ID' },
        title: { type: 'string', description: 'Question title' },
        index: { type: 'number', description: 'Position index to insert at (default 0)' },
        required: { type: 'boolean', description: 'Whether the question is required (optional)' },
        question_type: { type: 'string', enum: ['TEXT', 'PARAGRAPH_TEXT', 'MULTIPLE_CHOICE', 'CHECKBOX', 'DROPDOWN', 'LINEAR_SCALE', 'DATE', 'TIME'], description: 'Question type (optional, default TEXT)' },
        options: { type: 'array', items: { type: 'string' }, description: 'Options for choice questions (optional)' },
      },
      required: ['form_id', 'title'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_item',
    description: 'Delete a question or item from a form by index',
    inputSchema: {
      type: 'object',
      properties: {
        form_id: { type: 'string', description: 'Form ID' },
        index: { type: 'number', description: 'Zero-based index of item to delete' },
      },
      required: ['form_id', 'index'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_forms_via_drive',
    description: 'List Google Forms visible in Drive',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_form_schema',
    description: 'Get a simplified schema overview of a form (items/questions only)',
    inputSchema: {
      type: 'object',
      properties: {
        form_id: { type: 'string', description: 'Form ID' },
      },
      required: ['form_id'],
    },
    annotations: { readOnlyHint: true },
  },
];

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
  switch (name) {
    case 'get_form': {
      validateRequired(args, ['form_id']);
      return apiFetch(`${FORMS_API}/forms/${args.form_id}`, token);
    }

    case 'create_form': {
      validateRequired(args, ['title']);
      const info: Record<string, unknown> = { title: args.title };
      if (args.document_title) info.documentTitle = args.document_title;
      return apiFetch(`${FORMS_API}/forms`, token, {
        method: 'POST',
        body: JSON.stringify({ info }),
      });
    }

    case 'update_form': {
      validateRequired(args, ['form_id']);
      const updateInfo: Record<string, unknown> = {};
      const updateMaskParts: string[] = [];
      if (args.title) { updateInfo.title = args.title; updateMaskParts.push('title'); }
      if (args.description) { updateInfo.description = args.description; updateMaskParts.push('description'); }
      const updateMask = updateMaskParts.join(',') || 'title,description';
      return apiFetch(`${FORMS_API}/forms/${args.form_id}?includeFormInResponse=true`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          requests: [{
            updateFormInfo: {
              info: updateInfo,
              updateMask,
            },
          }],
        }),
      });
    }

    case 'list_responses': {
      validateRequired(args, ['form_id']);
      const pageSize = (args.page_size as number) ?? 50;
      return apiFetch(`${FORMS_API}/forms/${args.form_id}/responses?pageSize=${pageSize}`, token);
    }

    case 'get_response': {
      validateRequired(args, ['form_id', 'response_id']);
      return apiFetch(`${FORMS_API}/forms/${args.form_id}/responses/${args.response_id}`, token);
    }

    case 'batch_update_form': {
      validateRequired(args, ['form_id', 'requests']);
      return apiFetch(`${FORMS_API}/forms/${args.form_id}:batchUpdate`, token, {
        method: 'POST',
        body: JSON.stringify({ requests: args.requests }),
      });
    }

    case 'add_question': {
      validateRequired(args, ['form_id', 'title']);
      const index = (args.index as number) ?? 0;
      const questionType = (args.question_type as string) ?? 'TEXT';
      const question: Record<string, unknown> = {
        required: args.required ?? false,
      };

      if (['MULTIPLE_CHOICE', 'CHECKBOX', 'DROPDOWN'].includes(questionType) && args.options) {
        const choices = (args.options as string[]).map(v => ({ value: v }));
        question.choiceQuestion = {
          type: questionType,
          options: choices,
        };
      } else if (questionType === 'PARAGRAPH_TEXT') {
        question.textQuestion = { paragraph: true };
      } else if (questionType === 'LINEAR_SCALE') {
        question.scaleQuestion = { low: 1, high: 5 };
      } else if (questionType === 'DATE') {
        question.dateQuestion = {};
      } else if (questionType === 'TIME') {
        question.timeQuestion = {};
      } else {
        question.textQuestion = { paragraph: false };
      }

      return apiFetch(`${FORMS_API}/forms/${args.form_id}:batchUpdate`, token, {
        method: 'POST',
        body: JSON.stringify({
          requests: [{
            createItem: {
              item: {
                title: args.title,
                questionItem: { question },
              },
              location: { index },
            },
          }],
        }),
      });
    }

    case 'delete_item': {
      validateRequired(args, ['form_id']);
      if (args.index === undefined || args.index === null) throw new Error('Missing required fields: index');
      return apiFetch(`${FORMS_API}/forms/${args.form_id}:batchUpdate`, token, {
        method: 'POST',
        body: JSON.stringify({
          requests: [{
            deleteItem: { location: { index: args.index } },
          }],
        }),
      });
    }

    case 'list_forms_via_drive':
      return apiFetch(
        `${DRIVE_API}/files?q=mimeType%3D%27application%2Fvnd.google-apps.form%27&fields=files(id%2Cname%2CmodifiedTime)`,
        token,
      );

    case 'get_form_schema': {
      validateRequired(args, ['form_id']);
      const form = await apiFetch(`${FORMS_API}/forms/${args.form_id}`, token) as { items?: unknown };
      return { items: form.items ?? [] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-google-forms', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-google-forms', version: '1.0.0' },
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
