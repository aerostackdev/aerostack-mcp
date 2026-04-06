/**
 * AWS MCP Worker
 * Implements MCP protocol over HTTP for core AWS operations via the AWS REST API.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   AWS_ACCESS_KEY_ID     → X-Mcp-Secret-AWS-ACCESS-KEY-ID
 *   AWS_SECRET_ACCESS_KEY → X-Mcp-Secret-AWS-SECRET-ACCESS-KEY
 *   AWS_REGION            → X-Mcp-Secret-AWS-REGION
 *
 * Covers: S3 (5), EC2 (4), Lambda (4), IAM (3), CloudWatch (4) = 20 tools total
 */

function rpcOk(id: number | string, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: number | string | null, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

// ── AWS Signature V4 ─────────────────────────────────────────────────────────

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function sha256(data: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signRequest(
    method: string, url: string, body: string,
    accessKey: string, secretKey: string, region: string, service: string,
    extraHeaders: Record<string, string> = {},
): Promise<Record<string, string>> {
    const u = new URL(url);
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:]/g, '').slice(0, 8);
    const amzDate = dateStamp + 'T' + now.toISOString().replace(/[-:]/g, '').slice(9, 15) + 'Z';
    const scope = `${dateStamp}/${region}/${service}/aws4_request`;

    const payloadHash = await sha256(body);
    const headers: Record<string, string> = {
        host: u.host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        ...extraHeaders,
    };
    if (body && method !== 'GET') headers['content-type'] = 'application/x-amz-json-1.1';

    const signedHeaderKeys = Object.keys(headers).sort();
    const signedHeaders = signedHeaderKeys.join(';');
    const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
    const canonicalRequest = [method, u.pathname, u.search.slice(1), canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonicalRequest)].join('\n');

    let signingKey: ArrayBuffer = new TextEncoder().encode('AWS4' + secretKey).buffer;
    for (const part of [dateStamp, region, service, 'aws4_request']) {
        signingKey = await hmacSha256(signingKey, part);
    }
    const sig = [...new Uint8Array(await hmacSha256(signingKey, stringToSign))].map(b => b.toString(16).padStart(2, '0')).join('');

    headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;
    return headers;
}

async function awsFetch(
    method: string, url: string, body: string,
    accessKey: string, secretKey: string, region: string, service: string,
    extraHeaders: Record<string, string> = {},
): Promise<unknown> {
    const headers = await signRequest(method, url, body, accessKey, secretKey, region, service, extraHeaders);
    const res = await fetch(url, { method, headers, body: body || undefined });
    const text = await res.text();
    if (!res.ok) throw new Error(`AWS ${service} error (${res.status}): ${text.slice(0, 500)}`);
    try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function awsXmlFetch(
    method: string, url: string, body: string,
    accessKey: string, secretKey: string, region: string, service: string,
): Promise<string> {
    const headers = await signRequest(method, url, body, accessKey, secretKey, region, service);
    const res = await fetch(url, { method, headers, body: body || undefined });
    const text = await res.text();
    if (!res.ok) throw new Error(`AWS ${service} error (${res.status}): ${text.slice(0, 500)}`);
    return text;
}

// ── Tools ────────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify AWS credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    // ── S3 ──────────────────────────────────────────────────────────────────
    {
        name: 'list_s3_buckets', description: 'List all S3 buckets in the AWS account',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_s3_objects', description: 'List objects in an S3 bucket with optional prefix filter',
        inputSchema: {
            type: 'object', properties: {
                bucket: { type: 'string', description: 'Bucket name' },
                prefix: { type: 'string', description: 'Key prefix filter (optional)' },
                max_keys: { type: 'number', description: 'Max results (default 100)' },
            }, required: ['bucket'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_s3_object', description: 'Get the content of an S3 object (text files only, max 1MB)',
        inputSchema: {
            type: 'object', properties: {
                bucket: { type: 'string', description: 'Bucket name' },
                key: { type: 'string', description: 'Object key' },
            }, required: ['bucket', 'key'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'put_s3_object', description: 'Upload text content to an S3 object',
        inputSchema: {
            type: 'object', properties: {
                bucket: { type: 'string', description: 'Bucket name' },
                key: { type: 'string', description: 'Object key' },
                content: { type: 'string', description: 'Text content to upload' },
                content_type: { type: 'string', description: 'MIME type (default text/plain)' },
            }, required: ['bucket', 'key', 'content'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_s3_object', description: 'Delete an object from an S3 bucket',
        inputSchema: {
            type: 'object', properties: {
                bucket: { type: 'string', description: 'Bucket name' },
                key: { type: 'string', description: 'Object key to delete' },
            }, required: ['bucket', 'key'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── EC2 ─────────────────────────────────────────────────────────────────
    {
        name: 'describe_ec2_instances', description: 'List EC2 instances with status, type, IP, and tags',
        inputSchema: {
            type: 'object', properties: {
                instance_ids: { type: 'array', items: { type: 'string' }, description: 'Specific instance IDs (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'start_ec2_instance', description: 'Start a stopped EC2 instance',
        inputSchema: {
            type: 'object', properties: {
                instance_id: { type: 'string', description: 'EC2 instance ID (i-...)' },
            }, required: ['instance_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'stop_ec2_instance', description: 'Stop a running EC2 instance',
        inputSchema: {
            type: 'object', properties: {
                instance_id: { type: 'string', description: 'EC2 instance ID (i-...)' },
            }, required: ['instance_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'describe_ec2_security_groups', description: 'List security groups with inbound/outbound rules',
        inputSchema: {
            type: 'object', properties: {
                group_ids: { type: 'array', items: { type: 'string' }, description: 'Specific group IDs (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Lambda ──────────────────────────────────────────────────────────────
    {
        name: 'list_lambda_functions', description: 'List all Lambda functions with runtime, memory, and last modified',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_lambda_function', description: 'Get details of a Lambda function including configuration and tags',
        inputSchema: {
            type: 'object', properties: {
                function_name: { type: 'string', description: 'Function name or ARN' },
            }, required: ['function_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'invoke_lambda', description: 'Invoke a Lambda function synchronously with a JSON payload',
        inputSchema: {
            type: 'object', properties: {
                function_name: { type: 'string', description: 'Function name or ARN' },
                payload: { type: 'object', description: 'JSON payload to pass to the function' },
            }, required: ['function_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_lambda_logs', description: 'Get recent CloudWatch log events for a Lambda function',
        inputSchema: {
            type: 'object', properties: {
                function_name: { type: 'string', description: 'Function name' },
                minutes: { type: 'number', description: 'Look back N minutes (default 30)' },
            }, required: ['function_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── IAM ─────────────────────────────────────────────────────────────────
    {
        name: 'list_iam_users', description: 'List IAM users in the account',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_iam_roles', description: 'List IAM roles in the account',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_iam_policy', description: 'Get an IAM policy document by ARN',
        inputSchema: {
            type: 'object', properties: {
                policy_arn: { type: 'string', description: 'IAM policy ARN' },
            }, required: ['policy_arn'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── CloudWatch ──────────────────────────────────────────────────────────
    {
        name: 'list_cloudwatch_alarms', description: 'List CloudWatch alarms with state and thresholds',
        inputSchema: {
            type: 'object', properties: {
                state: { type: 'string', enum: ['OK', 'ALARM', 'INSUFFICIENT_DATA'], description: 'Filter by alarm state (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_cloudwatch_metrics', description: 'Get metric statistics for a CloudWatch metric',
        inputSchema: {
            type: 'object', properties: {
                namespace: { type: 'string', description: 'AWS namespace (e.g. AWS/EC2, AWS/Lambda)' },
                metric_name: { type: 'string', description: 'Metric name (e.g. CPUUtilization)' },
                dimensions: { type: 'array', items: { type: 'object', properties: { Name: { type: 'string' }, Value: { type: 'string' } } }, description: 'Metric dimensions' },
                period: { type: 'number', description: 'Period in seconds (default 300)' },
                minutes: { type: 'number', description: 'Look back N minutes (default 60)' },
                statistics: { type: 'array', items: { type: 'string' }, description: 'Statistics: Average, Sum, Minimum, Maximum, SampleCount' },
            }, required: ['namespace', 'metric_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_cloudwatch_log_groups', description: 'List CloudWatch log groups',
        inputSchema: {
            type: 'object', properties: {
                prefix: { type: 'string', description: 'Log group name prefix filter (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_cloudwatch_log_events', description: 'Get recent log events from a CloudWatch log group',
        inputSchema: {
            type: 'object', properties: {
                log_group: { type: 'string', description: 'Log group name' },
                log_stream: { type: 'string', description: 'Log stream name (optional — uses latest if omitted)' },
                minutes: { type: 'number', description: 'Look back N minutes (default 30)' },
                limit: { type: 'number', description: 'Max events to return (default 50)' },
            }, required: ['log_group'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool Handlers ────────────────────────────────────────────────────────────

async function callTool(
    name: string, args: Record<string, unknown>,
    accessKey: string, secretKey: string, region: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Verify credentials using STS GetCallerIdentity — lightweight, no permissions required
            const stsBody = 'Action=GetCallerIdentity&Version=2011-06-15';
            const stsHeaders = await signRequest('POST', 'https://sts.amazonaws.com/', stsBody, accessKey, secretKey, region, 'sts', { 'content-type': 'application/x-www-form-urlencoded' });
            const stsRes = await fetch('https://sts.amazonaws.com/', { method: 'POST', headers: stsHeaders, body: stsBody });
            const stsText = await stsRes.text();
            if (!stsRes.ok) throw new Error(`AWS STS error (${stsRes.status}): ${stsText.slice(0, 300)}`);
            const accountId = stsText.match(/<Account>([^<]+)<\/Account>/)?.[1] ?? 'unknown';
            const arn = stsText.match(/<Arn>([^<]+)<\/Arn>/)?.[1] ?? 'unknown';
            return `Connected to AWS — Account: ${accountId}, ARN: ${arn}`;
        }
        // ── S3 ──
        case 'list_s3_buckets': {
            const xml = await awsXmlFetch('GET', `https://s3.${region}.amazonaws.com/`, '', accessKey, secretKey, region, 's3');
            const buckets = [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map(m => m[1]);
            return { buckets };
        }
        case 'list_s3_objects': {
            const bucket = args.bucket as string;
            const prefix = (args.prefix as string) || '';
            const maxKeys = (args.max_keys as number) || 100;
            const params = new URLSearchParams({ 'list-type': '2', 'max-keys': String(maxKeys) });
            if (prefix) params.set('prefix', prefix);
            const xml = await awsXmlFetch('GET', `https://${bucket}.s3.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 's3');
            const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
            const sizes = [...xml.matchAll(/<Size>([^<]+)<\/Size>/g)].map(m => parseInt(m[1]));
            return { objects: keys.map((k, i) => ({ key: k, size: sizes[i] })) };
        }
        case 'get_s3_object': {
            const headers = await signRequest('GET', `https://${args.bucket}.s3.${region}.amazonaws.com/${args.key}`, '', accessKey, secretKey, region, 's3');
            const res = await fetch(`https://${args.bucket}.s3.${region}.amazonaws.com/${args.key}`, { headers });
            if (!res.ok) throw new Error(`S3 GET failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
            const content = await res.text();
            if (content.length > 1_000_000) throw new Error('Object too large (>1MB). Use the AWS console for large files.');
            return { content, content_type: res.headers.get('content-type') };
        }
        case 'put_s3_object': {
            const ct = (args.content_type as string) || 'text/plain';
            const url = `https://${args.bucket}.s3.${region}.amazonaws.com/${args.key}`;
            const headers = await signRequest('PUT', url, args.content as string, accessKey, secretKey, region, 's3', { 'content-type': ct });
            const res = await fetch(url, { method: 'PUT', headers, body: args.content as string });
            if (!res.ok) throw new Error(`S3 PUT failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
            return { success: true, key: args.key };
        }
        case 'delete_s3_object': {
            const url = `https://${args.bucket}.s3.${region}.amazonaws.com/${args.key}`;
            const headers = await signRequest('DELETE', url, '', accessKey, secretKey, region, 's3');
            const res = await fetch(url, { method: 'DELETE', headers });
            if (!res.ok) throw new Error(`S3 DELETE failed (${res.status})`);
            return { success: true, deleted: args.key };
        }

        // ── EC2 ──
        case 'describe_ec2_instances': {
            const params = new URLSearchParams({ Action: 'DescribeInstances', Version: '2016-11-15' });
            const ids = args.instance_ids as string[] | undefined;
            if (ids) ids.forEach((id, i) => params.set(`InstanceId.${i + 1}`, id));
            return awsXmlFetch('GET', `https://ec2.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'ec2');
        }
        case 'start_ec2_instance': {
            const params = new URLSearchParams({ Action: 'StartInstances', Version: '2016-11-15', 'InstanceId.1': args.instance_id as string });
            return awsXmlFetch('GET', `https://ec2.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'ec2');
        }
        case 'stop_ec2_instance': {
            const params = new URLSearchParams({ Action: 'StopInstances', Version: '2016-11-15', 'InstanceId.1': args.instance_id as string });
            return awsXmlFetch('GET', `https://ec2.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'ec2');
        }
        case 'describe_ec2_security_groups': {
            const params = new URLSearchParams({ Action: 'DescribeSecurityGroups', Version: '2016-11-15' });
            const ids = args.group_ids as string[] | undefined;
            if (ids) ids.forEach((id, i) => params.set(`GroupId.${i + 1}`, id));
            return awsXmlFetch('GET', `https://ec2.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'ec2');
        }

        // ── Lambda ──
        case 'list_lambda_functions':
            return awsFetch('GET', `https://lambda.${region}.amazonaws.com/2015-03-31/functions`, '', accessKey, secretKey, region, 'lambda');
        case 'get_lambda_function':
            return awsFetch('GET', `https://lambda.${region}.amazonaws.com/2015-03-31/functions/${encodeURIComponent(args.function_name as string)}`, '', accessKey, secretKey, region, 'lambda');
        case 'invoke_lambda': {
            const payload = JSON.stringify(args.payload ?? {});
            return awsFetch('POST', `https://lambda.${region}.amazonaws.com/2015-03-31/functions/${encodeURIComponent(args.function_name as string)}/invocations`, payload, accessKey, secretKey, region, 'lambda', { 'x-amz-invocation-type': 'RequestResponse' });
        }
        case 'get_lambda_logs': {
            const mins = (args.minutes as number) || 30;
            const logGroup = `/aws/lambda/${args.function_name}`;
            const body = JSON.stringify({ logGroupName: logGroup, startTime: Date.now() - mins * 60 * 1000, limit: 50, interleaved: true });
            return awsFetch('POST', `https://logs.${region}.amazonaws.com/`, body, accessKey, secretKey, region, 'logs', { 'x-amz-target': 'Logs_20140328.FilterLogEvents' });
        }

        // ── IAM ──
        case 'list_iam_users': {
            const params = new URLSearchParams({ Action: 'ListUsers', Version: '2010-05-08' });
            return awsXmlFetch('GET', `https://iam.amazonaws.com/?${params}`, '', accessKey, secretKey, 'us-east-1', 'iam');
        }
        case 'list_iam_roles': {
            const params = new URLSearchParams({ Action: 'ListRoles', Version: '2010-05-08' });
            return awsXmlFetch('GET', `https://iam.amazonaws.com/?${params}`, '', accessKey, secretKey, 'us-east-1', 'iam');
        }
        case 'get_iam_policy': {
            const params = new URLSearchParams({ Action: 'GetPolicy', Version: '2010-05-08', PolicyArn: args.policy_arn as string });
            return awsXmlFetch('GET', `https://iam.amazonaws.com/?${params}`, '', accessKey, secretKey, 'us-east-1', 'iam');
        }

        // ── CloudWatch ──
        case 'list_cloudwatch_alarms': {
            const body: Record<string, unknown> = {};
            if (args.state) body.StateValue = args.state;
            return awsFetch('POST', `https://monitoring.${region}.amazonaws.com/`, JSON.stringify(body), accessKey, secretKey, region, 'monitoring', { 'x-amz-target': 'GraniteServiceVersion20100801.DescribeAlarms' });
        }
        case 'get_cloudwatch_metrics': {
            const mins = (args.minutes as number) || 60;
            const period = (args.period as number) || 300;
            const stats = (args.statistics as string[]) || ['Average'];
            const body = {
                Namespace: args.namespace, MetricName: args.metric_name,
                Dimensions: args.dimensions || [],
                StartTime: new Date(Date.now() - mins * 60 * 1000).toISOString(),
                EndTime: new Date().toISOString(),
                Period: period, Statistics: stats,
            };
            return awsFetch('POST', `https://monitoring.${region}.amazonaws.com/`, JSON.stringify(body), accessKey, secretKey, region, 'monitoring', { 'x-amz-target': 'GraniteServiceVersion20100801.GetMetricStatistics' });
        }
        case 'list_cloudwatch_log_groups': {
            const body: Record<string, unknown> = {};
            if (args.prefix) body.logGroupNamePrefix = args.prefix;
            return awsFetch('POST', `https://logs.${region}.amazonaws.com/`, JSON.stringify(body), accessKey, secretKey, region, 'logs', { 'x-amz-target': 'Logs_20140328.DescribeLogGroups' });
        }
        case 'get_cloudwatch_log_events': {
            const mins = (args.minutes as number) || 30;
            const limit = (args.limit as number) || 50;
            const body: Record<string, unknown> = {
                logGroupName: args.log_group,
                startTime: Date.now() - mins * 60 * 1000,
                limit, interleaved: true,
            };
            if (args.log_stream) body.logStreamNames = [args.log_stream];
            return awsFetch('POST', `https://logs.${region}.amazonaws.com/`, JSON.stringify(body), accessKey, secretKey, region, 'logs', { 'x-amz-target': 'Logs_20140328.FilterLogEvents' });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker Entry ─────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-aws', version: '1.0.0', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
        try { body = await request.json(); } catch { return rpcErr(null, -32700, 'Parse error'); }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-aws', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });

        if (method === 'tools/call') {
            const accessKey = request.headers.get('X-Mcp-Secret-AWS-ACCESS-KEY-ID');
            const secretKey = request.headers.get('X-Mcp-Secret-AWS-SECRET-ACCESS-KEY');
            const region = request.headers.get('X-Mcp-Secret-AWS-REGION') || 'us-east-1';

            if (!accessKey || !secretKey) {
                return rpcErr(id, -32001, 'Missing AWS credentials — add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to workspace secrets');
            }

            try {
                const result = await callTool(params?.name as string, (params?.arguments ?? {}) as Record<string, unknown>, accessKey, secretKey, region);
                return rpcOk(id, { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] });
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
