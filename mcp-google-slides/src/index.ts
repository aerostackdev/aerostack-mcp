/**
 * Google Slides MCP Worker
 * Implements MCP protocol over HTTP for Google Slides API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: GOOGLE_SLIDES_ACCESS_TOKEN → header: X-Mcp-Secret-GOOGLE-SLIDES-ACCESS-TOKEN
 */

const SLIDES_API = 'https://slides.googleapis.com/v1';
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
  return request.headers.get('X-Mcp-Secret-GOOGLE-SLIDES-ACCESS-TOKEN');
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
    throw new Error(`Google Slides API error ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const TOOLS = [
  {
    name: 'list_presentations',
    description: 'List all Google Slides presentations in Drive',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_presentation',
    description: 'Get a presentation by ID with all slides and content',
    inputSchema: {
      type: 'object',
      properties: {
        presentation_id: { type: 'string', description: 'Presentation ID' },
      },
      required: ['presentation_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_presentation',
    description: 'Create a new Google Slides presentation',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the presentation' },
      },
      required: ['title'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_slide',
    description: 'Get a specific slide from a presentation by index',
    inputSchema: {
      type: 'object',
      properties: {
        presentation_id: { type: 'string', description: 'Presentation ID' },
        slide_index: { type: 'number', description: 'Zero-based slide index' },
      },
      required: ['presentation_id', 'slide_index'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'add_slide',
    description: 'Add a new slide to a presentation',
    inputSchema: {
      type: 'object',
      properties: {
        presentation_id: { type: 'string', description: 'Presentation ID' },
        insertion_index: { type: 'number', description: 'Index at which to insert the slide' },
        layout: { type: 'string', description: 'Slide layout name (optional)' },
      },
      required: ['presentation_id', 'insertion_index'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_slide',
    description: 'Delete a slide from a presentation by object ID',
    inputSchema: {
      type: 'object',
      properties: {
        presentation_id: { type: 'string', description: 'Presentation ID' },
        object_id: { type: 'string', description: 'Object ID of the slide to delete' },
      },
      required: ['presentation_id', 'object_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'duplicate_slide',
    description: 'Duplicate a slide in a presentation',
    inputSchema: {
      type: 'object',
      properties: {
        presentation_id: { type: 'string', description: 'Presentation ID' },
        object_id: { type: 'string', description: 'Object ID of the slide to duplicate' },
      },
      required: ['presentation_id', 'object_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'add_text_box',
    description: 'Add a text box to a slide',
    inputSchema: {
      type: 'object',
      properties: {
        presentation_id: { type: 'string', description: 'Presentation ID' },
        page_object_id: { type: 'string', description: 'Object ID of the target slide' },
        width: { type: 'number', description: 'Width in EMU (optional, default 3000000)' },
        height: { type: 'number', description: 'Height in EMU (optional, default 450000)' },
        translate_x: { type: 'number', description: 'X position in EMU (optional, default 1000000)' },
        translate_y: { type: 'number', description: 'Y position in EMU (optional, default 1000000)' },
      },
      required: ['presentation_id', 'page_object_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_text',
    description: 'Update text content of a shape on a slide',
    inputSchema: {
      type: 'object',
      properties: {
        presentation_id: { type: 'string', description: 'Presentation ID' },
        object_id: { type: 'string', description: 'Object ID of the shape' },
        text: { type: 'string', description: 'Text to insert' },
      },
      required: ['presentation_id', 'object_id', 'text'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'add_image',
    description: 'Add an image to a slide from a URL',
    inputSchema: {
      type: 'object',
      properties: {
        presentation_id: { type: 'string', description: 'Presentation ID' },
        page_object_id: { type: 'string', description: 'Object ID of the target slide' },
        image_url: { type: 'string', description: 'Public URL of the image' },
        width: { type: 'number', description: 'Width in EMU (optional, default 3000000)' },
        height: { type: 'number', description: 'Height in EMU (optional, default 2000000)' },
        translate_x: { type: 'number', description: 'X position in EMU (optional, default 1000000)' },
        translate_y: { type: 'number', description: 'Y position in EMU (optional, default 1000000)' },
      },
      required: ['presentation_id', 'page_object_id', 'image_url'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_page_thumbnail',
    description: 'Get a thumbnail image URL for a specific slide',
    inputSchema: {
      type: 'object',
      properties: {
        presentation_id: { type: 'string', description: 'Presentation ID' },
        page_object_id: { type: 'string', description: 'Object ID of the slide' },
      },
      required: ['presentation_id', 'page_object_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'batch_update',
    description: 'Execute a batch update on a presentation (pass-through for advanced operations)',
    inputSchema: {
      type: 'object',
      properties: {
        presentation_id: { type: 'string', description: 'Presentation ID' },
        requests: { type: 'array', description: 'Array of request objects', items: { type: 'object' } },
      },
      required: ['presentation_id', 'requests'],
    },
    annotations: { readOnlyHint: false },
  },
];

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
  switch (name) {
    case 'list_presentations':
      return apiFetch(
        `${DRIVE_API}/files?q=mimeType%3D%27application%2Fvnd.google-apps.presentation%27&fields=files(id%2Cname%2CmodifiedTime)`,
        token,
      );

    case 'get_presentation': {
      validateRequired(args, ['presentation_id']);
      return apiFetch(`${SLIDES_API}/presentations/${args.presentation_id}`, token);
    }

    case 'create_presentation': {
      validateRequired(args, ['title']);
      return apiFetch(`${SLIDES_API}/presentations`, token, {
        method: 'POST',
        body: JSON.stringify({ title: args.title }),
      });
    }

    case 'get_slide': {
      validateRequired(args, ['presentation_id', 'slide_index']);
      const pres = await apiFetch(`${SLIDES_API}/presentations/${args.presentation_id}`, token) as { slides?: unknown[] };
      const idx = args.slide_index as number;
      if (!pres.slides || idx >= pres.slides.length) throw new Error(`Slide index ${idx} out of range`);
      return pres.slides[idx];
    }

    case 'add_slide': {
      validateRequired(args, ['presentation_id', 'insertion_index']);
      const req: Record<string, unknown> = { insertionIndex: args.insertion_index };
      if (args.layout) req.slideLayoutReference = { predefinedLayout: args.layout };
      return apiFetch(`${SLIDES_API}/presentations/${args.presentation_id}:batchUpdate`, token, {
        method: 'POST',
        body: JSON.stringify({ requests: [{ insertSlide: req }] }),
      });
    }

    case 'delete_slide': {
      validateRequired(args, ['presentation_id', 'object_id']);
      return apiFetch(`${SLIDES_API}/presentations/${args.presentation_id}:batchUpdate`, token, {
        method: 'POST',
        body: JSON.stringify({ requests: [{ deleteObject: { objectId: args.object_id } }] }),
      });
    }

    case 'duplicate_slide': {
      validateRequired(args, ['presentation_id', 'object_id']);
      return apiFetch(`${SLIDES_API}/presentations/${args.presentation_id}:batchUpdate`, token, {
        method: 'POST',
        body: JSON.stringify({ requests: [{ duplicateObject: { objectId: args.object_id } }] }),
      });
    }

    case 'add_text_box': {
      validateRequired(args, ['presentation_id', 'page_object_id']);
      const w = (args.width as number) ?? 3000000;
      const h = (args.height as number) ?? 450000;
      const tx = (args.translate_x as number) ?? 1000000;
      const ty = (args.translate_y as number) ?? 1000000;
      return apiFetch(`${SLIDES_API}/presentations/${args.presentation_id}:batchUpdate`, token, {
        method: 'POST',
        body: JSON.stringify({
          requests: [{
            createShape: {
              shapeType: 'TEXT_BOX',
              elementProperties: {
                pageObjectId: args.page_object_id,
                size: { width: { magnitude: w, unit: 'EMU' }, height: { magnitude: h, unit: 'EMU' } },
                transform: { scaleX: 1, scaleY: 1, translateX: tx, translateY: ty, unit: 'EMU' },
              },
            },
          }],
        }),
      });
    }

    case 'update_text': {
      validateRequired(args, ['presentation_id', 'object_id', 'text']);
      return apiFetch(`${SLIDES_API}/presentations/${args.presentation_id}:batchUpdate`, token, {
        method: 'POST',
        body: JSON.stringify({
          requests: [{ insertText: { objectId: args.object_id, text: args.text } }],
        }),
      });
    }

    case 'add_image': {
      validateRequired(args, ['presentation_id', 'page_object_id', 'image_url']);
      const w = (args.width as number) ?? 3000000;
      const h = (args.height as number) ?? 2000000;
      const tx = (args.translate_x as number) ?? 1000000;
      const ty = (args.translate_y as number) ?? 1000000;
      return apiFetch(`${SLIDES_API}/presentations/${args.presentation_id}:batchUpdate`, token, {
        method: 'POST',
        body: JSON.stringify({
          requests: [{
            createImage: {
              url: args.image_url,
              elementProperties: {
                pageObjectId: args.page_object_id,
                size: { width: { magnitude: w, unit: 'EMU' }, height: { magnitude: h, unit: 'EMU' } },
                transform: { scaleX: 1, scaleY: 1, translateX: tx, translateY: ty, unit: 'EMU' },
              },
            },
          }],
        }),
      });
    }

    case 'get_page_thumbnail': {
      validateRequired(args, ['presentation_id', 'page_object_id']);
      return apiFetch(
        `${SLIDES_API}/presentations/${args.presentation_id}/pages/${args.page_object_id}/thumbnail`,
        token,
      );
    }

    case 'batch_update': {
      validateRequired(args, ['presentation_id', 'requests']);
      return apiFetch(`${SLIDES_API}/presentations/${args.presentation_id}:batchUpdate`, token, {
        method: 'POST',
        body: JSON.stringify({ requests: args.requests }),
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-google-slides', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-google-slides', version: '1.0.0' },
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
