/**
 * mcp-aerostack-registry (market Worker)
 *
 * Thin proxy — forwards all JSON-RPC traffic to the platform's built-in
 * registry endpoint at /api/mcp/aerostack/registry.
 *
 * Search logic, D1 queries, VECTORIZE, and call_function dispatch all live
 * in the Aerostack platform (packages/api/src/routes/gateway/mcp-registry.ts).
 * This Worker exists so it can be registered as a community MCP server and
 * added to any workspace via the standard MCP install flow.
 *
 * Secret (injected by Aerostack gateway):
 *   AEROSTACK_API_KEY  →  X-Mcp-Secret-AEROSTACK-API-KEY
 */

interface Env {
    PLATFORM_URL: string; // e.g. https://api.aerostack.dev
}

function rpcErr(id: number | string | null, code: number, message: string): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

const UPSTREAM_PATH = '/api/mcp/aerostack/registry';

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method === 'GET') {
            const url = new URL(request.url);
            if (url.pathname === '/health') {
                return new Response(JSON.stringify({ status: 'ok', server: 'mcp-aerostack-registry', version: '1.0.0' }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        const platformUrl = env.PLATFORM_URL?.replace(/\/$/, '') ?? 'https://api.aerostack.dev';

        // Forward the secret from the Aerostack gateway as an auth token
        const apiKey = request.headers.get('X-Mcp-Secret-AEROSTACK-API-KEY');

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        let body: string;
        try {
            body = await request.text();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        try {
            const upstream = await fetch(`${platformUrl}${UPSTREAM_PATH}`, {
                method: 'POST',
                headers,
                body,
            });
            return new Response(upstream.body, {
                status: upstream.status,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e: unknown) {
            return rpcErr(null, -32603, `Registry unreachable: ${(e as Error).message}`);
        }
    },
};
