# mcp-aws

AWS MCP server for Aerostack. Covers 60 tools across 15 AWS services via the AWS REST API with SigV4 authentication.

## Required Secrets

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM → Users → Security credentials → Access keys |
| `AWS_SECRET_ACCESS_KEY` | Shown once when the access key is created |
| `AWS_REGION` | AWS region (e.g. `us-east-1`, `eu-west-1`) |

## Tools

### S3 (5)
| Tool | Description |
|------|-------------|
| `list_s3_buckets` | List all S3 buckets in the account |
| `list_s3_objects` | List objects in a bucket with optional prefix filter |
| `get_s3_object` | Get the text content of an S3 object (max 1 MB) |
| `put_s3_object` | Upload text content to an S3 object |
| `delete_s3_object` | Delete an object from a bucket |

### EC2 (4)
| Tool | Description |
|------|-------------|
| `describe_ec2_instances` | List instances with status, type, IP, and tags |
| `start_ec2_instance` | Start a stopped EC2 instance |
| `stop_ec2_instance` | Stop a running EC2 instance |
| `describe_ec2_security_groups` | List security groups with inbound/outbound rules |

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

## IAM Permissions

The IAM user or role needs read permissions for the services you use. For a full read-only setup, attach `ReadOnlyAccess`. For write operations, add the specific policies:

- **S3 write**: `s3:PutObject`, `s3:DeleteObject`
- **EC2 control**: `ec2:StartInstances`, `ec2:StopInstances`
- **Lambda invoke**: `lambda:InvokeFunction`
- **ECS update**: `ecs:UpdateService`
- **Secrets Manager write**: `secretsmanager:CreateSecret`, `secretsmanager:UpdateSecret`
- **SSM write**: `ssm:PutParameter`
- **SNS publish**: `sns:Publish`
- **SQS write**: `sqs:SendMessage`
- **RDS snapshot**: `rds:CreateDBSnapshot`

## Notes

- **Route53** always signs requests with `us-east-1` regardless of the configured `AWS_REGION`.
- **IAM** is a global service and also uses `us-east-1` for signing.
- `get_s3_object` is limited to 1 MB text files. Use the AWS console or CLI for large or binary objects.
- `receive_sqs_messages` does **not** delete messages — they remain visible in the queue after the visibility timeout expires.
