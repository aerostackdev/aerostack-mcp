# mcp-aws — AWS MCP Server

> Manage EC2, S3, ECS, EKS, RDS, Lambda, IAM, CloudWatch, Secrets Manager, SNS, SQS, Route53, CloudFormation, and Cost Explorer — all from any AI agent via the AWS REST API.

AWS is the world's leading cloud platform. This MCP server gives your agents full access to 17 core AWS services via SigV4-authenticated REST APIs: launching and controlling EC2 instances, managing S3 buckets and objects, inspecting ECS/EKS clusters, monitoring RDS databases, invoking Lambda functions, reading CloudWatch logs and alarms, rotating Secrets Manager secrets, sending SNS/SQS messages, querying Cost Explorer, and managing DNS with Route53.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-aws`

---

## What You Can Do

- Start, stop, launch, and terminate EC2 instances; manage security groups and browse AMI images
- List, upload, download, and delete S3 objects; create and delete buckets across any region
- Inspect ECS clusters and services, scale service desired count, and force new deployments
- List EKS clusters and node groups with their Kubernetes version and scaling configuration
- Monitor RDS instances, create manual snapshots, and list existing snapshots
- Invoke Lambda functions synchronously and fetch CloudWatch log events for debugging
- Read and write SSM Parameter Store values and Secrets Manager secrets
- Publish to SNS topics, send and receive SQS messages, and inspect queue attributes
- Query costs by service, region, and date range; get forecasts and Savings Plans coverage
- List Route53 hosted zones and DNS records; list and inspect CloudFormation stacks

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `AWS_ACCESS_KEY_ID` | Yes | IAM access key ID | AWS Console → IAM → Users → Security credentials → Create access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | IAM secret access key | Shown once when the access key is created |
| `AWS_REGION` | Yes | Default AWS region | e.g. `us-east-1`, `eu-west-1`, `ap-southeast-1` |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"AWS"** and click **Add to Workspace**
3. Add your credentials under **Project → Secrets**

### Example Prompts

```
"List all running EC2 instances in us-east-1"
"What's my AWS spend by service for the last 30 days?"
"Show me all ECS services in the production cluster and their running task counts"
"Get the last 50 log events from the /aws/lambda/checkout-processor log group"
"Create an S3 bucket called my-data-lake in eu-west-1"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-aws \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AWS-ACCESS-KEY-ID: AKIA...' \
  -H 'X-Mcp-Secret-AWS-SECRET-ACCESS-KEY: your-secret' \
  -H 'X-Mcp-Secret-AWS-REGION: us-east-1' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"describe_ec2_instances","arguments":{}}}'
```

---

## Available Tools

### S3 (7)
| Tool | Description |
|------|-------------|
| `list_s3_buckets` | List all S3 buckets in the account |
| `list_s3_objects` | List objects in a bucket with optional prefix filter |
| `get_s3_object` | Get the text content of an S3 object (max 1 MB) |
| `put_s3_object` | Upload text content to an S3 object |
| `delete_s3_object` | Delete an object from a bucket |
| `create_s3_bucket` | Create a new S3 bucket in any region |
| `delete_s3_bucket` | Delete an S3 bucket (must be empty first) |

### EC2 (8)
| Tool | Description |
|------|-------------|
| `describe_ec2_instances` | List instances with status, type, IP, and tags |
| `start_ec2_instance` | Start a stopped EC2 instance |
| `stop_ec2_instance` | Stop a running EC2 instance |
| `describe_ec2_security_groups` | List security groups with inbound/outbound rules |
| `run_ec2_instance` | Launch new EC2 instances from an AMI |
| `terminate_ec2_instances` | Permanently terminate EC2 instances (irreversible) |
| `describe_ec2_images` | List AMI images available to your account |
| `create_ec2_security_group` | Create a new EC2 security group |

### Lambda (4)
| Tool | Description |
|------|-------------|
| `list_lambda_functions` | List all Lambda functions with runtime and memory |
| `get_lambda_function` | Get configuration and tags for a function |
| `invoke_lambda` | Invoke a function synchronously with a JSON payload |
| `get_lambda_logs` | Get recent CloudWatch log events for a function |

### IAM (3)
| Tool | Description |
|------|-------------|
| `list_iam_users` | List IAM users in the account |
| `list_iam_roles` | List IAM roles in the account |
| `get_iam_policy` | Get an IAM policy document by ARN |

### CloudWatch (4)
| Tool | Description |
|------|-------------|
| `list_cloudwatch_alarms` | List alarms with state and thresholds |
| `get_cloudwatch_metrics` | Get metric statistics for a namespace/metric |
| `list_cloudwatch_log_groups` | List log groups with optional prefix filter |
| `get_cloudwatch_log_events` | Get recent log events from a log group |

### ECS — Elastic Container Service (6)
| Tool | Description |
|------|-------------|
| `list_ecs_clusters` | List all ECS clusters in the region |
| `describe_ecs_cluster` | Get detailed info about a cluster |
| `list_ecs_services` | List services in a cluster |
| `describe_ecs_service` | Get service details including desired/running count and deployments |
| `list_ecs_tasks` | List tasks in a cluster with optional status filter (RUNNING/STOPPED) |
| `update_ecs_service` | Update desired count or force a new deployment |

### EKS — Elastic Kubernetes Service (4)
| Tool | Description |
|------|-------------|
| `list_eks_clusters` | List all EKS clusters in the region |
| `describe_eks_cluster` | Get cluster details including endpoint and Kubernetes version |
| `list_eks_nodegroups` | List node groups in a cluster |
| `describe_eks_nodegroup` | Get node group details including instance types and scaling config |

### RDS — Relational Database Service (4)
| Tool | Description |
|------|-------------|
| `list_rds_instances` | List all DB instances with engine, status, and endpoint |
| `describe_rds_instance` | Get detailed info about a specific DB instance |
| `create_rds_snapshot` | Create a manual snapshot of a DB instance |
| `list_rds_snapshots` | List snapshots with optional DB instance filter |

### Secrets Manager (4)
| Tool | Description |
|------|-------------|
| `list_secrets` | List all secrets in Secrets Manager |
| `get_secret_value` | Retrieve a secret value by name or ARN |
| `create_secret` | Create a new secret |
| `update_secret` | Update an existing secret's value |

### SSM Parameter Store (3)
| Tool | Description |
|------|-------------|
| `list_parameters` | List parameters in SSM Parameter Store |
| `get_parameter` | Get a parameter value (SecureString parameters are decrypted) |
| `put_parameter` | Create or update a parameter (String, SecureString, StringList) |

### ECR — Elastic Container Registry (3)
| Tool | Description |
|------|-------------|
| `list_ecr_repositories` | List all ECR image repositories |
| `describe_ecr_images` | List images in a repository with tags and digest |
| `get_ecr_login_token` | Get an authorization token for `docker login` (valid 12 hours) |

### SNS — Simple Notification Service (3)
| Tool | Description |
|------|-------------|
| `list_sns_topics` | List all SNS topics in the region |
| `publish_sns_message` | Publish a message to a topic |
| `list_sns_subscriptions` | List all subscriptions in the region |

### SQS — Simple Queue Service (4)
| Tool | Description |
|------|-------------|
| `list_sqs_queues` | List all SQS queues in the region |
| `get_queue_attributes` | Get queue attributes including message count |
| `send_sqs_message` | Send a message to a queue |
| `receive_sqs_messages` | Receive up to 10 messages (messages remain in queue until deleted) |

### Route53 (2)
| Tool | Description |
|------|-------------|
| `list_hosted_zones` | List all hosted DNS zones in the account |
| `list_dns_records` | List DNS records (resource record sets) in a hosted zone |

### CloudFormation (3)
| Tool | Description |
|------|-------------|
| `list_cf_stacks` | List all stacks with status |
| `get_cf_stack` | Get stack details including outputs and parameters |
| `list_cf_stack_resources` | List all resources in a stack with physical IDs and status |

### Cost Explorer (5)
| Tool | Description |
|------|-------------|
| `get_cost_and_usage` | Get cost and usage data for a date range with configurable granularity |
| `get_cost_by_service` | Get costs grouped by AWS service for a date range |
| `get_cost_by_region` | Get costs grouped by service and region for a date range |
| `get_cost_forecast` | Get a cost forecast for the current billing period |
| `get_savings_plans_coverage` | Get Savings Plans coverage for the current month |

## IAM Permissions

For a full read-only setup, attach `ReadOnlyAccess`. For write operations, add the specific policies:

- **S3 write**: `s3:PutObject`, `s3:DeleteObject`, `s3:CreateBucket`, `s3:DeleteBucket`
- **EC2 control**: `ec2:StartInstances`, `ec2:StopInstances`, `ec2:RunInstances`, `ec2:TerminateInstances`, `ec2:CreateSecurityGroup`
- **Lambda invoke**: `lambda:InvokeFunction`
- **ECS update**: `ecs:UpdateService`
- **Secrets Manager write**: `secretsmanager:CreateSecret`, `secretsmanager:UpdateSecret`
- **SSM write**: `ssm:PutParameter`
- **SNS publish**: `sns:Publish`
- **SQS write**: `sqs:SendMessage`
- **RDS snapshot**: `rds:CreateDBSnapshot`
- **Cost Explorer**: `ce:GetCostAndUsage`, `ce:GetCostForecast`, `ce:GetSavingsPlansCoverage`

## Technical Notes

- **SigV4 authentication** is used for all AWS API calls. Requests are signed per-service per-region.
- **Route53, IAM, and Cost Explorer** always use `us-east-1` regardless of `AWS_REGION` — these are global services.
- `get_s3_object` is capped at 1 MB text content. Use the AWS CLI for large or binary files.
- `receive_sqs_messages` does **not** delete messages — they return to the queue after the visibility timeout.
- `terminate_ec2_instances` is irreversible. Use `stop_ec2_instance` first to confirm the correct instance.
- `delete_s3_bucket` requires the bucket to be empty first (delete all objects and versions).

## License

MIT
