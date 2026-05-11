# mcp-digitalocean — DigitalOcean MCP Server

> Manage Droplets, App Platform apps, Kubernetes clusters, Databases, Firewalls, VPCs, DNS, Container Registry, Spaces, and account billing — all from any AI agent via the DigitalOcean API.

DigitalOcean is a leading cloud infrastructure provider used by developers and teams worldwide. This MCP server gives your agents full access to the DigitalOcean v2 REST API: creating and managing Droplets, deploying App Platform apps, configuring DNS, managing firewalls and VPCs, inspecting Kubernetes clusters, and monitoring account billing.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-digitalocean`

---

## What You Can Do

- List, create, and delete Droplets — with SSH keys, backups, IPv6, and tags
- Deploy App Platform apps from GitHub repos or container images, trigger deployments, and tail logs
- Manage Kubernetes clusters and check their status
- Create and query managed Database clusters (PostgreSQL, MySQL, Redis, MongoDB)
- Configure Cloud Firewalls with granular inbound/outbound rules and attach them to Droplets
- Create and manage VPCs with custom IP ranges and inspect their members
- Manage DNS domains and records (A, AAAA, CNAME, MX, TXT, SRV, NS)
- Inspect the Container Registry and list repositories and image tags
- List Spaces (S3-compatible object storage buckets)
- Check account info, current balance, and recent invoices

## Available Tools

### Droplets

| Tool | Description |
|------|-------------|
| `list_droplets` | List all Droplets with optional pagination |
| `get_droplet` | Get full details of a specific Droplet |
| `create_droplet` | Create a new Droplet (name, region, size, image required) |
| `delete_droplet` | Delete a Droplet by ID |

### App Platform

| Tool | Description |
|------|-------------|
| `list_apps` | List all App Platform apps |
| `get_app` | Get full app details including spec and active deployment |
| `create_app` | Create a new app from a GitHub repo or container image |
| `get_app_deployments` | List the 5 most recent deployments for an app |
| `create_deployment` | Trigger a new deployment for an app |
| `get_app_logs` | Get recent runtime logs for an app |

### Kubernetes

| Tool | Description |
|------|-------------|
| `list_kubernetes_clusters` | List all Kubernetes clusters |
| `get_kubernetes_cluster` | Get details of a specific cluster |

### Databases

| Tool | Description |
|------|-------------|
| `list_databases` | List all managed database clusters |
| `get_database` | Get details of a specific database cluster |

### Firewalls

| Tool | Description |
|------|-------------|
| `list_firewalls` | List all Cloud Firewalls |
| `get_firewall` | Get details of a specific firewall |
| `create_firewall` | Create a firewall with inbound/outbound rules |
| `add_droplets_to_firewall` | Attach Droplets to an existing firewall |
| `delete_firewall` | Delete a firewall |

### VPCs

| Tool | Description |
|------|-------------|
| `list_vpcs` | List all VPCs |
| `get_vpc` | Get details of a specific VPC |
| `create_vpc` | Create a new VPC in a region with optional IP range |
| `list_vpc_members` | List all resources (Droplets, etc.) in a VPC |

### Domains / DNS

| Tool | Description |
|------|-------------|
| `list_domains` | List all domains |
| `get_domain` | Get details of a specific domain |
| `create_domain` | Create a new domain with optional A record |
| `list_domain_records` | List all DNS records for a domain |
| `create_domain_record` | Create a DNS record (A, AAAA, CNAME, MX, TXT, SRV, NS) |
| `delete_domain_record` | Delete a DNS record by ID |

### Container Registry

| Tool | Description |
|------|-------------|
| `get_registry` | Get your account's Container Registry details |
| `list_registry_repositories` | List all repositories in the registry |
| `list_registry_tags` | List image digests/tags in a repository |

### Spaces

| Tool | Description |
|------|-------------|
| `list_spaces` | List all Spaces buckets in the account |

### Volumes & Load Balancers

| Tool | Description |
|------|-------------|
| `list_volumes` | List all block storage volumes |
| `list_load_balancers` | List all load balancers |

### Account / Billing

| Tool | Description |
|------|-------------|
| `get_account` | Get account info, Droplet limits, and status |
| `get_balance` | Get current balance and month-to-date usage |
| `list_invoices` | List 5 most recent invoices |

---

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `DIGITALOCEAN_TOKEN` | Yes | DigitalOcean Personal Access Token | [cloud.digitalocean.com](https://cloud.digitalocean.com) → API → Tokens → Generate New Token. Grant **Read** scope for read-only tools; grant **Write** scope to create/delete resources. |

> The token must have the appropriate scopes. A read-only token works for all `list_*`, `get_*`, and `_ping` tools. Write operations (create, delete, deploy) require a write-enabled token.

---

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"DigitalOcean"** and click **Add to Workspace**
3. Add your `DIGITALOCEAN_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can manage DigitalOcean infrastructure automatically.

### Example Prompts

```
"List all my Droplets and show their sizes and regions"
"Create a new Ubuntu 22.04 Droplet in nyc3 called web-01 using the s-1vcpu-1gb size"
"What App Platform apps do I have and when was each last deployed?"
"Show me the inbound rules for all my Cloud Firewalls"
"List all DNS records for example.com"
"What's my current DigitalOcean balance and month-to-date usage?"
"Create a VPC called production in sfo3 with IP range 10.20.0.0/20"
"Trigger a new deployment for my app abc123"
```

### Direct API Call

```bash
# Ping / auth check
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-digitalocean \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DIGITALOCEAN-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"_ping","arguments":{}}}'

# List Droplets
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-digitalocean \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DIGITALOCEAN-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_droplets","arguments":{}}}'
```
