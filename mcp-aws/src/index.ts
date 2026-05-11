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
 * Covers: S3 (5), EC2 (4), Lambda (4), IAM (3), CloudWatch (4),
 *         ECS (6), EKS (4), RDS (4), Secrets Manager (4), SSM (3),
 *         ECR (3), SNS (3), SQS (4), Route53 (2), CloudFormation (3) = 60 tools total
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

    // ── ECS ─────────────────────────────────────────────────────────────────
    {
        name: 'list_ecs_clusters', description: 'List all ECS clusters in the region',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'describe_ecs_cluster', description: 'Get detailed information about an ECS cluster',
        inputSchema: {
            type: 'object', properties: {
                cluster_arn: { type: 'string', description: 'ECS cluster ARN or name' },
            }, required: ['cluster_arn'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_ecs_services', description: 'List services running in an ECS cluster',
        inputSchema: {
            type: 'object', properties: {
                cluster: { type: 'string', description: 'ECS cluster ARN or name' },
            }, required: ['cluster'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'describe_ecs_service', description: 'Get detailed information about an ECS service including desired/running count and deployments',
        inputSchema: {
            type: 'object', properties: {
                cluster: { type: 'string', description: 'ECS cluster ARN or name' },
                service: { type: 'string', description: 'ECS service name or ARN' },
            }, required: ['cluster', 'service'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_ecs_tasks', description: 'List tasks in an ECS cluster with optional status filter',
        inputSchema: {
            type: 'object', properties: {
                cluster: { type: 'string', description: 'ECS cluster ARN or name' },
                desired_status: { type: 'string', enum: ['RUNNING', 'STOPPED'], description: 'Filter by task status (optional)' },
            }, required: ['cluster'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_ecs_service', description: 'Update an ECS service — change desired count or force a new deployment',
        inputSchema: {
            type: 'object', properties: {
                cluster: { type: 'string', description: 'ECS cluster ARN or name' },
                service: { type: 'string', description: 'ECS service name or ARN' },
                desired_count: { type: 'number', description: 'New desired task count (optional)' },
                force_new_deployment: { type: 'boolean', description: 'Force a new deployment (default false)' },
            }, required: ['cluster', 'service'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── EKS ─────────────────────────────────────────────────────────────────
    {
        name: 'list_eks_clusters', description: 'List all EKS clusters in the region',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'describe_eks_cluster', description: 'Get detailed information about an EKS cluster including endpoint and status',
        inputSchema: {
            type: 'object', properties: {
                name: { type: 'string', description: 'EKS cluster name' },
            }, required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_eks_nodegroups', description: 'List node groups in an EKS cluster',
        inputSchema: {
            type: 'object', properties: {
                cluster_name: { type: 'string', description: 'EKS cluster name' },
            }, required: ['cluster_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'describe_eks_nodegroup', description: 'Get details of an EKS node group including instance types, scaling config, and status',
        inputSchema: {
            type: 'object', properties: {
                cluster_name: { type: 'string', description: 'EKS cluster name' },
                nodegroup_name: { type: 'string', description: 'Node group name' },
            }, required: ['cluster_name', 'nodegroup_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── RDS ─────────────────────────────────────────────────────────────────
    {
        name: 'list_rds_instances', description: 'List all RDS database instances with engine, status, and endpoint',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'describe_rds_instance', description: 'Get detailed information about a specific RDS database instance',
        inputSchema: {
            type: 'object', properties: {
                db_instance_identifier: { type: 'string', description: 'RDS DB instance identifier' },
            }, required: ['db_instance_identifier'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_rds_snapshot', description: 'Create a manual snapshot of an RDS database instance',
        inputSchema: {
            type: 'object', properties: {
                db_instance_identifier: { type: 'string', description: 'RDS DB instance identifier to snapshot' },
                db_snapshot_identifier: { type: 'string', description: 'Name for the new snapshot' },
            }, required: ['db_instance_identifier', 'db_snapshot_identifier'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_rds_snapshots', description: 'List RDS database snapshots (manual and automated)',
        inputSchema: {
            type: 'object', properties: {
                db_instance_identifier: { type: 'string', description: 'Filter by DB instance identifier (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Secrets Manager ──────────────────────────────────────────────────────
    {
        name: 'list_secrets', description: 'List all secrets in AWS Secrets Manager',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_secret_value', description: 'Retrieve the value of a secret from AWS Secrets Manager',
        inputSchema: {
            type: 'object', properties: {
                secret_id: { type: 'string', description: 'Secret name or ARN' },
            }, required: ['secret_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_secret', description: 'Create a new secret in AWS Secrets Manager',
        inputSchema: {
            type: 'object', properties: {
                name: { type: 'string', description: 'Secret name' },
                secret_string: { type: 'string', description: 'Secret value (string or JSON string)' },
            }, required: ['name', 'secret_string'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_secret', description: 'Update the value of an existing secret in AWS Secrets Manager',
        inputSchema: {
            type: 'object', properties: {
                secret_id: { type: 'string', description: 'Secret name or ARN' },
                secret_string: { type: 'string', description: 'New secret value' },
            }, required: ['secret_id', 'secret_string'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── SSM Parameter Store ──────────────────────────────────────────────────
    {
        name: 'list_parameters', description: 'List parameters in AWS SSM Parameter Store',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_parameter', description: 'Get the value of an SSM parameter (decrypts SecureString parameters)',
        inputSchema: {
            type: 'object', properties: {
                name: { type: 'string', description: 'Parameter name (e.g. /myapp/db/password)' },
            }, required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'put_parameter', description: 'Create or update an SSM parameter',
        inputSchema: {
            type: 'object', properties: {
                name: { type: 'string', description: 'Parameter name (e.g. /myapp/db/password)' },
                value: { type: 'string', description: 'Parameter value' },
                type: { type: 'string', enum: ['String', 'SecureString', 'StringList'], description: 'Parameter type (default String)' },
                overwrite: { type: 'boolean', description: 'Overwrite existing parameter (default true)' },
            }, required: ['name', 'value'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── ECR ─────────────────────────────────────────────────────────────────
    {
        name: 'list_ecr_repositories', description: 'List all ECR container image repositories',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'describe_ecr_images', description: 'List container images in an ECR repository with tags and digest',
        inputSchema: {
            type: 'object', properties: {
                repository_name: { type: 'string', description: 'ECR repository name' },
            }, required: ['repository_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_ecr_login_token', description: 'Get an ECR authorization token for docker login (valid 12 hours)',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── SNS ─────────────────────────────────────────────────────────────────
    {
        name: 'list_sns_topics', description: 'List all SNS topics in the region',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'publish_sns_message', description: 'Publish a message to an SNS topic',
        inputSchema: {
            type: 'object', properties: {
                topic_arn: { type: 'string', description: 'SNS topic ARN' },
                message: { type: 'string', description: 'Message body' },
                subject: { type: 'string', description: 'Message subject (optional, used for email subscriptions)' },
            }, required: ['topic_arn', 'message'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_sns_subscriptions', description: 'List all SNS subscriptions in the region',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── SQS ─────────────────────────────────────────────────────────────────
    {
        name: 'list_sqs_queues', description: 'List all SQS queues in the region',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_queue_attributes', description: 'Get attributes of an SQS queue including message count and visibility timeout',
        inputSchema: {
            type: 'object', properties: {
                queue_url: { type: 'string', description: 'SQS queue URL' },
            }, required: ['queue_url'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'send_sqs_message', description: 'Send a message to an SQS queue',
        inputSchema: {
            type: 'object', properties: {
                queue_url: { type: 'string', description: 'SQS queue URL' },
                message_body: { type: 'string', description: 'Message body (string or JSON string)' },
            }, required: ['queue_url', 'message_body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'receive_sqs_messages', description: 'Receive up to 10 messages from an SQS queue (non-destructive — messages remain until deleted)',
        inputSchema: {
            type: 'object', properties: {
                queue_url: { type: 'string', description: 'SQS queue URL' },
                max_messages: { type: 'number', description: 'Max messages to receive 1–10 (default 10)' },
            }, required: ['queue_url'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Route53 ─────────────────────────────────────────────────────────────
    {
        name: 'list_hosted_zones', description: 'List all Route53 hosted zones (DNS zones) in the account',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_dns_records', description: 'List DNS records in a Route53 hosted zone',
        inputSchema: {
            type: 'object', properties: {
                hosted_zone_id: { type: 'string', description: 'Hosted zone ID (e.g. Z1D633PJN98FT9) or full ID path (/hostedzone/Z...)' },
            }, required: ['hosted_zone_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── CloudFormation ───────────────────────────────────────────────────────
    {
        name: 'list_cf_stacks', description: 'List all CloudFormation stacks with status',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_cf_stack', description: 'Get detailed information about a CloudFormation stack including outputs and parameters',
        inputSchema: {
            type: 'object', properties: {
                stack_name: { type: 'string', description: 'CloudFormation stack name or ARN' },
            }, required: ['stack_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_cf_stack_resources', description: 'List all resources in a CloudFormation stack with their physical IDs and status',
        inputSchema: {
            type: 'object', properties: {
                stack_name: { type: 'string', description: 'CloudFormation stack name or ARN' },
            }, required: ['stack_name'],
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

        // ── ECS ──
        case 'list_ecs_clusters': {
            return awsFetch(
                'POST', `https://ecs.${region}.amazonaws.com/`,
                JSON.stringify({}),
                accessKey, secretKey, region, 'ecs',
                { 'x-amz-target': 'AmazonEC2ContainerServiceV20141113.ListClusters' },
            );
        }
        case 'describe_ecs_cluster': {
            return awsFetch(
                'POST', `https://ecs.${region}.amazonaws.com/`,
                JSON.stringify({ clusters: [args.cluster_arn as string] }),
                accessKey, secretKey, region, 'ecs',
                { 'x-amz-target': 'AmazonEC2ContainerServiceV20141113.DescribeClusters' },
            );
        }
        case 'list_ecs_services': {
            return awsFetch(
                'POST', `https://ecs.${region}.amazonaws.com/`,
                JSON.stringify({ cluster: args.cluster as string }),
                accessKey, secretKey, region, 'ecs',
                { 'x-amz-target': 'AmazonEC2ContainerServiceV20141113.ListServices' },
            );
        }
        case 'describe_ecs_service': {
            return awsFetch(
                'POST', `https://ecs.${region}.amazonaws.com/`,
                JSON.stringify({ cluster: args.cluster as string, services: [args.service as string] }),
                accessKey, secretKey, region, 'ecs',
                { 'x-amz-target': 'AmazonEC2ContainerServiceV20141113.DescribeServices' },
            );
        }
        case 'list_ecs_tasks': {
            const body: Record<string, unknown> = { cluster: args.cluster as string };
            if (args.desired_status) body.desiredStatus = args.desired_status;
            return awsFetch(
                'POST', `https://ecs.${region}.amazonaws.com/`,
                JSON.stringify(body),
                accessKey, secretKey, region, 'ecs',
                { 'x-amz-target': 'AmazonEC2ContainerServiceV20141113.ListTasks' },
            );
        }
        case 'update_ecs_service': {
            const body: Record<string, unknown> = {
                cluster: args.cluster as string,
                service: args.service as string,
            };
            if (args.desired_count !== undefined) body.desiredCount = args.desired_count;
            if (args.force_new_deployment !== undefined) body.forceNewDeployment = args.force_new_deployment;
            return awsFetch(
                'POST', `https://ecs.${region}.amazonaws.com/`,
                JSON.stringify(body),
                accessKey, secretKey, region, 'ecs',
                { 'x-amz-target': 'AmazonEC2ContainerServiceV20141113.UpdateService' },
            );
        }

        // ── EKS ──
        case 'list_eks_clusters':
            return awsFetch('GET', `https://eks.${region}.amazonaws.com/clusters`, '', accessKey, secretKey, region, 'eks');
        case 'describe_eks_cluster':
            return awsFetch('GET', `https://eks.${region}.amazonaws.com/clusters/${encodeURIComponent(args.name as string)}`, '', accessKey, secretKey, region, 'eks');
        case 'list_eks_nodegroups':
            return awsFetch('GET', `https://eks.${region}.amazonaws.com/clusters/${encodeURIComponent(args.cluster_name as string)}/node-groups`, '', accessKey, secretKey, region, 'eks');
        case 'describe_eks_nodegroup':
            return awsFetch('GET', `https://eks.${region}.amazonaws.com/clusters/${encodeURIComponent(args.cluster_name as string)}/node-groups/${encodeURIComponent(args.nodegroup_name as string)}`, '', accessKey, secretKey, region, 'eks');

        // ── RDS ──
        case 'list_rds_instances': {
            const params = new URLSearchParams({ Action: 'DescribeDBInstances', Version: '2014-10-31' });
            return awsXmlFetch('GET', `https://rds.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'rds');
        }
        case 'describe_rds_instance': {
            const params = new URLSearchParams({
                Action: 'DescribeDBInstances',
                Version: '2014-10-31',
                DBInstanceIdentifier: args.db_instance_identifier as string,
            });
            return awsXmlFetch('GET', `https://rds.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'rds');
        }
        case 'create_rds_snapshot': {
            const params = new URLSearchParams({
                Action: 'CreateDBSnapshot',
                Version: '2014-10-31',
                DBInstanceIdentifier: args.db_instance_identifier as string,
                DBSnapshotIdentifier: args.db_snapshot_identifier as string,
            });
            return awsXmlFetch('GET', `https://rds.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'rds');
        }
        case 'list_rds_snapshots': {
            const params = new URLSearchParams({ Action: 'DescribeDBSnapshots', Version: '2014-10-31' });
            if (args.db_instance_identifier) params.set('DBInstanceIdentifier', args.db_instance_identifier as string);
            return awsXmlFetch('GET', `https://rds.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'rds');
        }

        // ── Secrets Manager ──
        case 'list_secrets':
            return awsFetch(
                'POST', `https://secretsmanager.${region}.amazonaws.com/`,
                JSON.stringify({}),
                accessKey, secretKey, region, 'secretsmanager',
                { 'x-amz-target': 'secretsmanager.ListSecrets' },
            );
        case 'get_secret_value':
            return awsFetch(
                'POST', `https://secretsmanager.${region}.amazonaws.com/`,
                JSON.stringify({ SecretId: args.secret_id as string }),
                accessKey, secretKey, region, 'secretsmanager',
                { 'x-amz-target': 'secretsmanager.GetSecretValue' },
            );
        case 'create_secret':
            return awsFetch(
                'POST', `https://secretsmanager.${region}.amazonaws.com/`,
                JSON.stringify({ Name: args.name as string, SecretString: args.secret_string as string }),
                accessKey, secretKey, region, 'secretsmanager',
                { 'x-amz-target': 'secretsmanager.CreateSecret' },
            );
        case 'update_secret':
            return awsFetch(
                'POST', `https://secretsmanager.${region}.amazonaws.com/`,
                JSON.stringify({ SecretId: args.secret_id as string, SecretString: args.secret_string as string }),
                accessKey, secretKey, region, 'secretsmanager',
                { 'x-amz-target': 'secretsmanager.UpdateSecret' },
            );

        // ── SSM Parameter Store ──
        case 'list_parameters':
            return awsFetch(
                'POST', `https://ssm.${region}.amazonaws.com/`,
                JSON.stringify({}),
                accessKey, secretKey, region, 'ssm',
                { 'x-amz-target': 'AmazonSSM.DescribeParameters' },
            );
        case 'get_parameter':
            return awsFetch(
                'POST', `https://ssm.${region}.amazonaws.com/`,
                JSON.stringify({ Name: args.name as string, WithDecryption: true }),
                accessKey, secretKey, region, 'ssm',
                { 'x-amz-target': 'AmazonSSM.GetParameter' },
            );
        case 'put_parameter': {
            const paramBody: Record<string, unknown> = {
                Name: args.name as string,
                Value: args.value as string,
                Type: (args.type as string) || 'String',
                Overwrite: args.overwrite !== false,
            };
            return awsFetch(
                'POST', `https://ssm.${region}.amazonaws.com/`,
                JSON.stringify(paramBody),
                accessKey, secretKey, region, 'ssm',
                { 'x-amz-target': 'AmazonSSM.PutParameter' },
            );
        }

        // ── ECR ──
        case 'list_ecr_repositories':
            return awsFetch(
                'POST', `https://ecr.${region}.amazonaws.com/`,
                JSON.stringify({}),
                accessKey, secretKey, region, 'ecr',
                { 'x-amz-target': 'AmazonEC2ContainerRegistry_V20150921.DescribeRepositories' },
            );
        case 'describe_ecr_images':
            return awsFetch(
                'POST', `https://ecr.${region}.amazonaws.com/`,
                JSON.stringify({ repositoryName: args.repository_name as string }),
                accessKey, secretKey, region, 'ecr',
                { 'x-amz-target': 'AmazonEC2ContainerRegistry_V20150921.DescribeImages' },
            );
        case 'get_ecr_login_token':
            return awsFetch(
                'POST', `https://ecr.${region}.amazonaws.com/`,
                JSON.stringify({}),
                accessKey, secretKey, region, 'ecr',
                { 'x-amz-target': 'AmazonEC2ContainerRegistry_V20150921.GetAuthorizationToken' },
            );

        // ── SNS ──
        case 'list_sns_topics': {
            const params = new URLSearchParams({ Action: 'ListTopics', Version: '2010-03-31' });
            return awsXmlFetch('GET', `https://sns.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'sns');
        }
        case 'publish_sns_message': {
            const params = new URLSearchParams({
                Action: 'Publish',
                Version: '2010-03-31',
                TopicArn: args.topic_arn as string,
                Message: args.message as string,
            });
            if (args.subject) params.set('Subject', args.subject as string);
            return awsXmlFetch('GET', `https://sns.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'sns');
        }
        case 'list_sns_subscriptions': {
            const params = new URLSearchParams({ Action: 'ListSubscriptions', Version: '2010-03-31' });
            return awsXmlFetch('GET', `https://sns.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'sns');
        }

        // ── SQS ──
        case 'list_sqs_queues': {
            const params = new URLSearchParams({ Action: 'ListQueues', Version: '2012-11-05' });
            return awsXmlFetch('GET', `https://sqs.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'sqs');
        }
        case 'get_queue_attributes': {
            const params = new URLSearchParams({
                Action: 'GetQueueAttributes',
                Version: '2012-11-05',
                QueueUrl: args.queue_url as string,
                'AttributeName.1': 'All',
            });
            return awsXmlFetch('GET', `https://sqs.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'sqs');
        }
        case 'send_sqs_message': {
            const params = new URLSearchParams({
                Action: 'SendMessage',
                Version: '2012-11-05',
                QueueUrl: args.queue_url as string,
                MessageBody: args.message_body as string,
            });
            return awsXmlFetch('GET', `https://sqs.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'sqs');
        }
        case 'receive_sqs_messages': {
            const maxMessages = Math.min(Math.max((args.max_messages as number) || 10, 1), 10);
            const params = new URLSearchParams({
                Action: 'ReceiveMessage',
                Version: '2012-11-05',
                QueueUrl: args.queue_url as string,
                MaxNumberOfMessages: String(maxMessages),
                WaitTimeSeconds: '0',
            });
            return awsXmlFetch('GET', `https://sqs.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'sqs');
        }

        // ── Route53 ──
        case 'list_hosted_zones': {
            // Route53 is always us-east-1 regardless of configured region
            const xml = await awsXmlFetch('GET', 'https://route53.amazonaws.com/2013-04-01/hostedzone', '', accessKey, secretKey, 'us-east-1', 'route53');
            return { raw: xml };
        }
        case 'list_dns_records': {
            // Strip leading /hostedzone/ if present, keep only the zone ID
            let zoneId = args.hosted_zone_id as string;
            if (zoneId.startsWith('/hostedzone/')) zoneId = zoneId.slice('/hostedzone/'.length);
            const xml = await awsXmlFetch('GET', `https://route53.amazonaws.com/2013-04-01/hostedzone/${zoneId}/rrset`, '', accessKey, secretKey, 'us-east-1', 'route53');
            return { raw: xml };
        }

        // ── CloudFormation ──
        case 'list_cf_stacks': {
            const params = new URLSearchParams({ Action: 'DescribeStacks', Version: '2010-05-15' });
            return awsXmlFetch('GET', `https://cloudformation.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'cloudformation');
        }
        case 'get_cf_stack': {
            const params = new URLSearchParams({
                Action: 'DescribeStacks',
                Version: '2010-05-15',
                StackName: args.stack_name as string,
            });
            return awsXmlFetch('GET', `https://cloudformation.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'cloudformation');
        }
        case 'list_cf_stack_resources': {
            const params = new URLSearchParams({
                Action: 'ListStackResources',
                Version: '2010-05-15',
                StackName: args.stack_name as string,
            });
            return awsXmlFetch('GET', `https://cloudformation.${region}.amazonaws.com/?${params}`, '', accessKey, secretKey, region, 'cloudformation');
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
                JSON.stringify({ status: 'ok', server: 'mcp-aws', version: '2.0.0', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-aws', version: '2.0.0' },
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
