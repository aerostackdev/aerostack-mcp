/**
 * mcp-huggingface — Hugging Face MCP Server
 *
 * Search models, datasets, Spaces. Get model details, run inference.
 * Uses Hugging Face Hub API + Inference API directly.
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 */

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Hugging Face connectivity by fetching the authenticated user. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_models',
        description: 'Search Hugging Face models by keyword, task, library, or author — returns name, downloads, likes, tags, and pipeline task',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query (e.g. "text-generation llama")' },
                filter: { type: 'string', description: 'Filter by pipeline task (e.g. text-generation, image-classification, translation, summarization)' },
                author: { type: 'string', description: 'Filter by author/organization (e.g. "meta-llama", "openai")' },
                library: { type: 'string', description: 'Filter by library (e.g. transformers, diffusers, gguf, onnx)' },
                sort: { type: 'string', description: 'Sort by: downloads, likes, trending, created_at, modified_at (default: trending)' },
                limit: { type: 'number', description: 'Maximum results to return (default: 20, max: 100)' },
            },
            required: [] as string[],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_model',
        description: 'Get detailed information about a Hugging Face model — description, config, tags, files, safetensors info, and model card',
        inputSchema: {
            type: 'object' as const,
            properties: {
                model_id: { type: 'string', description: 'Model ID (e.g. "meta-llama/Llama-3-8B", "openai/whisper-large-v3")' },
            },
            required: ['model_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_datasets',
        description: 'Search Hugging Face datasets by keyword, task type, or author — returns name, downloads, size, and tags',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query' },
                author: { type: 'string', description: 'Filter by author/organization' },
                sort: { type: 'string', description: 'Sort by: downloads, likes, trending, created_at (default: trending)' },
                limit: { type: 'number', description: 'Maximum results (default: 20, max: 100)' },
            },
            required: [] as string[],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_dataset',
        description: 'Get detailed information about a Hugging Face dataset — description, card content, size, splits, features, and download stats',
        inputSchema: {
            type: 'object' as const,
            properties: {
                dataset_id: { type: 'string', description: 'Dataset ID (e.g. "imdb", "squad", "wikipedia")' },
            },
            required: ['dataset_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_spaces',
        description: 'Search Hugging Face Spaces (apps/demos) by keyword — returns name, SDK, status, likes, and URL',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query' },
                sort: { type: 'string', description: 'Sort by: likes, trending, created_at (default: trending)' },
                limit: { type: 'number', description: 'Maximum results (default: 20, max: 100)' },
            },
            required: [] as string[],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'run_inference',
        description: 'Run inference on a Hugging Face model using the serverless Inference API. Supports text generation, summarization, classification, embeddings, and more.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                model_id: { type: 'string', description: 'Model ID to run inference on (e.g. "meta-llama/Llama-3-8B-Instruct")' },
                inputs: { type: 'string', description: 'Input text for the model' },
                parameters: { type: 'object', description: 'Optional model parameters (e.g. {"max_new_tokens": 200, "temperature": 0.7})' },
            },
            required: ['model_id', 'inputs'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_model_files',
        description: 'List all files in a model repository with size, LFS status, and download URLs',
        inputSchema: {
            type: 'object' as const,
            properties: {
                model_id: { type: 'string', description: 'Model ID' },
                path: { type: 'string', description: 'Subdirectory path to list (default: root)' },
            },
            required: ['model_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

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

async function hfFetch(token: string, path: string): Promise<any> {
    const res = await fetch(`https://huggingface.co/api${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HF API ${res.status}: ${errText.slice(0, 500)}`);
    }
    return res.json();
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const user = await hfFetch(token, '/whoami-v2');
            return text(`Connected to Hugging Face as "${user.name}" (${user.fullname || user.name})`);
        }

        case 'search_models': {
            const params = new URLSearchParams();
            if (args.query) params.set('search', args.query as string);
            if (args.filter) params.set('filter', args.filter as string);
            if (args.author) params.set('author', args.author as string);
            if (args.library) params.set('library', args.library as string);
            params.set('sort', (args.sort as string) || 'trending');
            params.set('direction', '-1');
            params.set('limit', String(Math.min(Number(args.limit ?? 20), 100)));
            const data = await hfFetch(token, `/models?${params}`);
            const models = data.map((m: any) => ({
                id: m.modelId || m.id,
                author: m.author,
                pipeline_tag: m.pipeline_tag,
                library: m.library_name,
                downloads: m.downloads,
                likes: m.likes,
                tags: m.tags?.slice(0, 8),
                last_modified: m.lastModified,
            }));
            return json({ models, count: models.length });
        }

        case 'get_model': {
            const modelId = args.model_id as string;
            const m = await hfFetch(token, `/models/${modelId}`);
            return json({
                id: m.modelId || m.id,
                author: m.author,
                pipeline_tag: m.pipeline_tag,
                library: m.library_name,
                tags: m.tags,
                downloads: m.downloads,
                likes: m.likes,
                private: m.private,
                gated: m.gated,
                model_card: m.cardData ? {
                    language: m.cardData.language,
                    license: m.cardData.license,
                    datasets: m.cardData.datasets,
                    metrics: m.cardData.metrics,
                } : null,
                safetensors: m.safetensors ? { total_size: m.safetensors.total } : null,
                created: m.createdAt,
                last_modified: m.lastModified,
                siblings: m.siblings?.length,
            });
        }

        case 'search_datasets': {
            const params = new URLSearchParams();
            if (args.query) params.set('search', args.query as string);
            if (args.author) params.set('author', args.author as string);
            params.set('sort', (args.sort as string) || 'trending');
            params.set('direction', '-1');
            params.set('limit', String(Math.min(Number(args.limit ?? 20), 100)));
            const data = await hfFetch(token, `/datasets?${params}`);
            const datasets = data.map((d: any) => ({
                id: d.id,
                author: d.author,
                downloads: d.downloads,
                likes: d.likes,
                tags: d.tags?.slice(0, 8),
                last_modified: d.lastModified,
            }));
            return json({ datasets, count: datasets.length });
        }

        case 'get_dataset': {
            const datasetId = args.dataset_id as string;
            const d = await hfFetch(token, `/datasets/${datasetId}`);
            return json({
                id: d.id,
                author: d.author,
                description: d.description,
                citation: d.citation,
                downloads: d.downloads,
                likes: d.likes,
                tags: d.tags,
                private: d.private,
                gated: d.gated,
                card_data: d.cardData ? {
                    language: d.cardData.language,
                    license: d.cardData.license,
                    task_categories: d.cardData.task_categories,
                    size_categories: d.cardData.size_categories,
                } : null,
                created: d.createdAt,
                last_modified: d.lastModified,
            });
        }

        case 'search_spaces': {
            const params = new URLSearchParams();
            if (args.query) params.set('search', args.query as string);
            params.set('sort', (args.sort as string) || 'trending');
            params.set('direction', '-1');
            params.set('limit', String(Math.min(Number(args.limit ?? 20), 100)));
            const data = await hfFetch(token, `/spaces?${params}`);
            const spaces = data.map((s: any) => ({
                id: s.id,
                author: s.author,
                sdk: s.sdk,
                runtime_stage: s.runtime?.stage,
                likes: s.likes,
                url: `https://huggingface.co/spaces/${s.id}`,
                last_modified: s.lastModified,
            }));
            return json({ spaces, count: spaces.length });
        }

        case 'run_inference': {
            const modelId = args.model_id as string;
            const inputs = args.inputs as string;
            const parameters = args.parameters as Record<string, unknown> | undefined;
            const res = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ inputs, parameters }),
            });
            if (!res.ok) {
                const err = await res.text().catch(() => '');
                throw new Error(`Inference failed (${res.status}): ${err.slice(0, 500)}`);
            }
            const result = await res.json();
            return json({ model: modelId, result });
        }

        case 'list_model_files': {
            const modelId = args.model_id as string;
            const path = args.path ? `/${args.path}` : '';
            const data = await hfFetch(token, `/models/${modelId}/tree/main${path}`);
            const files = (Array.isArray(data) ? data : []).map((f: any) => ({
                type: f.type,
                path: f.path,
                size: f.size,
                lfs: f.lfs ? { size: f.lfs.size, sha256: f.lfs.oid } : null,
            }));
            return json({ files, count: files.length });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ─── Worker Entry ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-huggingface', version: '1.0.0' });
        }
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = (await request.json()) as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-huggingface', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-HUGGINGFACE-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing HUGGINGFACE_TOKEN secret — add your Hugging Face access token to workspace secrets');
            }

            const { name, arguments: toolArgs = {} } = (params ?? {}) as {
                name: string;
                arguments?: Record<string, unknown>;
            };

            try {
                const result = await callTool(name, toolArgs, token);
                return rpcOk(id, result);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
