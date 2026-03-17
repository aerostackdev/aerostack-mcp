// mcp-redis — Aerostack MCP Server
// Wraps the Upstash Redis REST API
// Secrets: X-Mcp-Secret-UPSTASH-REDIS-URL, X-Mcp-Secret-UPSTASH-REDIS-TOKEN

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Redis connectivity with a PING command. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'get',
        description: 'Get the value of a key',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The key to retrieve' },
            },
            required: ['key'],
        },
    },
    {
        name: 'set',
        description: 'Set a key-value pair with an optional TTL in seconds',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The key to set' },
                value: { type: 'string', description: 'The value to store' },
                ex: { type: 'number', description: 'Optional TTL in seconds' },
            },
            required: ['key', 'value'],
        },
    },
    {
        name: 'del',
        description: 'Delete one or more keys',
        inputSchema: {
            type: 'object',
            properties: {
                keys: { type: 'array', items: { type: 'string' }, description: 'Key(s) to delete' },
            },
            required: ['keys'],
        },
    },
    {
        name: 'keys',
        description: 'List all keys matching a glob-style pattern (e.g. "user:*")',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Glob pattern to match keys, e.g. "user:*"' },
            },
            required: ['pattern'],
        },
    },
    {
        name: 'exists',
        description: 'Check if one or more keys exist. Returns the count of keys that exist.',
        inputSchema: {
            type: 'object',
            properties: {
                keys: { type: 'array', items: { type: 'string' }, description: 'Key(s) to check' },
            },
            required: ['keys'],
        },
    },
    {
        name: 'ttl',
        description: 'Get the remaining time-to-live of a key in seconds. Returns -1 if no TTL, -2 if key does not exist.',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The key to check' },
            },
            required: ['key'],
        },
    },
    {
        name: 'expire',
        description: 'Set a TTL (time-to-live) on a key in seconds',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The key to set expiry on' },
                seconds: { type: 'number', description: 'TTL in seconds' },
            },
            required: ['key', 'seconds'],
        },
    },
    {
        name: 'hget',
        description: 'Get the value of a single field in a hash',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The hash key' },
                field: { type: 'string', description: 'The field name within the hash' },
            },
            required: ['key', 'field'],
        },
    },
    {
        name: 'hset',
        description: 'Set one or more fields in a hash',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The hash key' },
                fields: { type: 'object', description: 'Object of field-value pairs to set, e.g. {"name":"Alice","age":"30"}' },
            },
            required: ['key', 'fields'],
        },
    },
    {
        name: 'hgetall',
        description: 'Get all fields and values of a hash',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The hash key' },
            },
            required: ['key'],
        },
    },
    {
        name: 'lpush',
        description: 'Push one or more values to the head (left) of a list',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The list key' },
                values: { type: 'array', items: { type: 'string' }, description: 'Value(s) to push' },
            },
            required: ['key', 'values'],
        },
    },
    {
        name: 'lrange',
        description: 'Get a range of elements from a list',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The list key' },
                start: { type: 'number', description: 'Start index (0-based)' },
                stop: { type: 'number', description: 'Stop index (-1 for last element)' },
            },
            required: ['key', 'start', 'stop'],
        },
    },
    {
        name: 'incr',
        description: 'Increment the integer value of a key by 1. Creates the key with value 1 if it does not exist.',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The key to increment' },
            },
            required: ['key'],
        },
    },
    {
        name: 'info',
        description: 'Get Upstash Redis server info and statistics',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
];

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

async function runCommand(url: string, token: string, command: string[]) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
    });
    if (!res.ok) throw new Error(`Redis error: ${res.status} ${await res.text()}`);
    return (await res.json()) as { result: unknown };
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    redisUrl: string,
    redisToken: string,
) {
    switch (name) {
        case '_ping': {
            const { result } = await runCommand(redisUrl, redisToken, ['PING']);
            return text(`Connected to Upstash Redis — PING returned "${result}"`);
        }

        case 'get': {
            const key = args.key as string;
            if (!key) return text('Error: "key" is required');
            const { result } = await runCommand(redisUrl, redisToken, ['GET', key]);
            return json({ key, value: result });
        }

        case 'set': {
            const key = args.key as string;
            const value = args.value as string;
            if (!key || value === undefined) return text('Error: "key" and "value" are required');
            const command = ['SET', key, value];
            if (args.ex) command.push('EX', String(args.ex));
            const { result } = await runCommand(redisUrl, redisToken, command);
            return json({ key, result });
        }

        case 'del': {
            const keys = args.keys as string[];
            if (!keys || keys.length === 0) return text('Error: "keys" array is required');
            const { result } = await runCommand(redisUrl, redisToken, ['DEL', ...keys]);
            return json({ deleted: result });
        }

        case 'keys': {
            const pattern = args.pattern as string;
            if (!pattern) return text('Error: "pattern" is required');
            const { result } = await runCommand(redisUrl, redisToken, ['KEYS', pattern]);
            return json({ keys: result });
        }

        case 'exists': {
            const keys = args.keys as string[];
            if (!keys || keys.length === 0) return text('Error: "keys" array is required');
            const { result } = await runCommand(redisUrl, redisToken, ['EXISTS', ...keys]);
            return json({ exists: result });
        }

        case 'ttl': {
            const key = args.key as string;
            if (!key) return text('Error: "key" is required');
            const { result } = await runCommand(redisUrl, redisToken, ['TTL', key]);
            return json({ key, ttl: result });
        }

        case 'expire': {
            const key = args.key as string;
            const seconds = args.seconds as number;
            if (!key || seconds === undefined) return text('Error: "key" and "seconds" are required');
            const { result } = await runCommand(redisUrl, redisToken, ['EXPIRE', key, String(seconds)]);
            return json({ key, result });
        }

        case 'hget': {
            const key = args.key as string;
            const field = args.field as string;
            if (!key || !field) return text('Error: "key" and "field" are required');
            const { result } = await runCommand(redisUrl, redisToken, ['HGET', key, field]);
            return json({ key, field, value: result });
        }

        case 'hset': {
            const key = args.key as string;
            const fields = args.fields as Record<string, string>;
            if (!key || !fields) return text('Error: "key" and "fields" are required');
            const flat: string[] = [];
            for (const [f, v] of Object.entries(fields)) {
                flat.push(f, String(v));
            }
            const { result } = await runCommand(redisUrl, redisToken, ['HSET', key, ...flat]);
            return json({ key, fieldsSet: result });
        }

        case 'hgetall': {
            const key = args.key as string;
            if (!key) return text('Error: "key" is required');
            const { result } = await runCommand(redisUrl, redisToken, ['HGETALL', key]);
            // Upstash returns HGETALL as an array: [field1, val1, field2, val2, ...]
            const arr = result as string[] | null;
            if (!arr || arr.length === 0) return json({ key, fields: {} });
            const obj: Record<string, string> = {};
            for (let i = 0; i < arr.length; i += 2) {
                obj[arr[i]] = arr[i + 1];
            }
            return json({ key, fields: obj });
        }

        case 'lpush': {
            const key = args.key as string;
            const values = args.values as string[];
            if (!key || !values || values.length === 0) return text('Error: "key" and "values" are required');
            const { result } = await runCommand(redisUrl, redisToken, ['LPUSH', key, ...values]);
            return json({ key, listLength: result });
        }

        case 'lrange': {
            const key = args.key as string;
            const start = args.start as number;
            const stop = args.stop as number;
            if (!key || start === undefined || stop === undefined) return text('Error: "key", "start", and "stop" are required');
            const { result } = await runCommand(redisUrl, redisToken, ['LRANGE', key, String(start), String(stop)]);
            return json({ key, values: result });
        }

        case 'incr': {
            const key = args.key as string;
            if (!key) return text('Error: "key" is required');
            const { result } = await runCommand(redisUrl, redisToken, ['INCR', key]);
            return json({ key, value: result });
        }

        case 'info': {
            const { result } = await runCommand(redisUrl, redisToken, ['INFO']);
            return text(String(result));
        }

        default:
            return text(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-redis' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const redisUrl = request.headers.get('X-Mcp-Secret-UPSTASH-REDIS-URL') || '';
        const redisToken = request.headers.get('X-Mcp-Secret-UPSTASH-REDIS-TOKEN') || '';

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json() as typeof body;
        } catch {
            return new Response(
                JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }),
                { status: 400, headers: { 'Content-Type': 'application/json' } },
            );
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return Response.json({
                jsonrpc: '2.0', id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'mcp-redis', version: '1.0.0' },
                },
            });
        }

        if (method === 'tools/list') {
            return Response.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        }

        if (method === 'tools/call') {
            if (!redisUrl || !redisToken) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32001, message: 'Missing secrets: UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN required' },
                });
            }
            const { name, arguments: args = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, args, redisUrl, redisToken);
                return Response.json({ jsonrpc: '2.0', id, result });
            } catch (err) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32603, message: String(err) },
                });
            }
        }

        return Response.json({
            jsonrpc: '2.0', id,
            error: { code: -32601, message: `Method not found: ${method}` },
        });
    },
};
