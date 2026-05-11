# mcp-azure — Azure MCP Server

> Manage Azure virtual machines, Kubernetes clusters, App Service, Key Vault, storage, networking, DNS, and cost — from any AI agent.

Azure is Microsoft's cloud platform powering enterprise infrastructure worldwide. This MCP server gives your agents full access to the Azure Resource Manager REST API: listing and controlling VMs, inspecting AKS clusters and node pools, managing App Service web apps and Function Apps, reading Key Vault secrets, browsing storage accounts, monitoring alert rules and the activity log, managing virtual networks and NSGs, tracking costs and budgets, managing DNS zones and records, creating and deleting VMs and managed disks — all authenticated via OAuth2 client credentials.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-azure`

---

## What You Can Do

- Start, stop, restart, create, delete, and inspect Azure virtual machines without touching the portal
- List available VM sizes per region and manage managed disks (create, delete, inspect)
- List and inspect AKS clusters and their node pools to understand your Kubernetes fleet
- Restart App Service web apps and Function Apps and fetch their log configuration
- Read Key Vault secrets by name directly from the data plane using the separate vault scope
- Browse storage accounts and list blob containers across your subscription
- Triage production issues using metric alert rules and the last 24 hours of the activity log
- Inspect virtual networks, subnets, NSG rules, public IPs, load balancers, and network interfaces
- Track month-to-date costs by subscription, resource group, and service; view and inspect budgets
- Manage DNS zones and records — list, create (A/CNAME/TXT/MX), and delete DNS records

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify Azure credentials by fetching subscription details |
| `list_resource_groups` | List all resource groups in the subscription |
| `get_resource_group` | Get details of a specific resource group |
| `create_resource_group` | Create a new resource group with a location and optional tags |
| `list_resources` | List all resources inside a specific resource group |
| `list_vms` | List all virtual machines across the entire subscription |
| `list_vms_in_rg` | List all virtual machines in a specific resource group |
| `get_vm` | Get details of a VM including size, OS, and network info |
| `start_vm` | Start a stopped virtual machine |
| `stop_vm` | Deallocate a virtual machine (stops compute billing) |
| `restart_vm` | Restart a virtual machine |
| `get_vm_status` | Get the current power state and provisioning status of a VM |
| `list_aks_clusters` | List all AKS clusters across the subscription |
| `get_aks_cluster` | Get details of a specific AKS cluster including node pools and version |
| `list_aks_node_pools` | List all node pools in an AKS cluster |
| `list_web_apps` | List all App Service web apps across the subscription |
| `get_web_app` | Get details of a specific App Service web app |
| `restart_web_app` | Restart an App Service web app |
| `get_web_app_logs` | Get the logging configuration for a web app |
| `list_key_vaults` | List all Key Vaults in the subscription |
| `get_key_vault` | Get details of a specific Key Vault including access policies |
| `list_vault_secrets` | List secret names in a Key Vault (data plane) |
| `get_vault_secret` | Get the current value of a secret from Key Vault (data plane) |
| `list_storage_accounts` | List all storage accounts in the subscription |
| `list_storage_containers` | List blob containers in a specific storage account |
| `list_alert_rules` | List all metric alert rules in the subscription |
| `list_activity_log` | List Azure activity log events from the past 24 hours |
| `list_container_groups` | List all Azure Container Instance groups in the subscription |
| `get_container_group` | Get details of a specific Container Instance group |
| `start_container_group` | Start a stopped Container Instance group |
| `stop_container_group` | Stop a running Container Instance group |
| `list_function_apps` | List all Azure Function Apps across the subscription |
| `get_function_app` | Get details of a specific Azure Function App |
| `list_virtual_networks` | List all virtual networks across the subscription |
| `get_virtual_network` | Get details of a specific virtual network including address space and subnets |
| `list_subnets` | List all subnets within a specific virtual network |
| `list_network_security_groups` | List all NSGs across the subscription |
| `get_nsg_rules` | Get all security rules defined in a specific NSG |
| `list_public_ips` | List all public IP addresses across the subscription |
| `list_load_balancers` | List all load balancers across the subscription |
| `get_load_balancer` | Get details of a specific load balancer including frontend IPs and rules |
| `list_network_interfaces` | List all network interfaces across the subscription |
| `get_cost_summary` | Get total month-to-date cost for the subscription |
| `get_cost_by_resource_group` | Get month-to-date cost broken down by resource group |
| `get_cost_by_service` | Get month-to-date cost broken down by Azure service |
| `list_budgets` | List all spending budgets configured for the subscription |
| `get_budget` | Get details of a specific budget including current spend vs limit |
| `list_dns_zones` | List all DNS zones in the subscription |
| `list_dns_records` | List all DNS records in a specific DNS zone |
| `create_dns_record` | Create or update a DNS record (A, CNAME, TXT, MX) |
| `delete_dns_record` | Delete a DNS record from a zone |
| `create_vm` | Create a new Azure virtual machine (requires pre-created NIC ID) |
| `delete_vm` | Delete an Azure virtual machine (irreversible) |
| `list_vm_sizes` | List all available VM sizes in a specific Azure region |
| `list_disks` | List all managed disks across the subscription |
| `get_disk` | Get details of a specific managed disk |
| `create_disk` | Create a new empty managed disk |
| `delete_disk` | Delete a managed disk (irreversible) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `AZURE_CLIENT_ID` | Yes | Azure App Registration Client ID | portal.azure.com → **Azure Active Directory** → **App registrations** → **New registration** → copy **Application (client) ID** |
| `AZURE_CLIENT_SECRET` | Yes | Azure App Registration Client Secret | In your App Registration → **Certificates & secrets** → **New client secret** → copy the **Value** immediately (shown only once) |
| `AZURE_TENANT_ID` | Yes | Azure Tenant ID | portal.azure.com → **Azure Active Directory** → **Overview** → copy **Tenant ID** |
| `AZURE_SUBSCRIPTION_ID` | Yes | Azure Subscription ID | portal.azure.com → **Subscriptions** → click your subscription → copy **Subscription ID** |

### Granting the App Registration access

After creating the App Registration, you must assign it the **Contributor** role on your subscription so it can read and manage resources:

1. Go to portal.azure.com → **Subscriptions** → click your subscription
2. Click **Access control (IAM)** → **Add role assignment**
3. Role: **Contributor** (or **Reader** for read-only access)
4. Members: **User, group, or service principal** → select your App Registration by name
5. Click **Review + assign**

For Key Vault data plane access (`list_vault_secrets`, `get_vault_secret`), the App Registration also needs a **Key Vault Secrets User** role on each vault, or an access policy granting `Get` and `List` on secrets.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Azure"** and click **Add to Workspace**
3. Add all four credentials under **Project → Secrets**

Once added, every AI agent in your workspace can manage your Azure infrastructure automatically.

### Example Prompts

```
"Show me all VMs in my Azure subscription and their current status"
"Stop the staging virtual machine in resource group rg-staging"
"List all AKS clusters and how many node pools each one has"
"What alerts fired in Azure in the last 24 hours?"
"List all blob containers in storage account mystorageaccount"
"Get the database-password secret from key vault my-vault"
"Restart the api-prod web app in resource group rg-production"
"List all Azure Function Apps in the subscription"
```

### Direct API Call

```bash
# Verify credentials
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-azure \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AZURE-CLIENT-ID: your-client-id' \
  -H 'X-Mcp-Secret-AZURE-CLIENT-SECRET: your-client-secret' \
  -H 'X-Mcp-Secret-AZURE-TENANT-ID: your-tenant-id' \
  -H 'X-Mcp-Secret-AZURE-SUBSCRIPTION-ID: your-subscription-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"_ping","arguments":{}}}'

# List all VMs
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-azure \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AZURE-CLIENT-ID: your-client-id' \
  -H 'X-Mcp-Secret-AZURE-CLIENT-SECRET: your-client-secret' \
  -H 'X-Mcp-Secret-AZURE-TENANT-ID: your-tenant-id' \
  -H 'X-Mcp-Secret-AZURE-SUBSCRIPTION-ID: your-subscription-id' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_vms","arguments":{}}}'

# Stop a VM
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-azure \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AZURE-CLIENT-ID: your-client-id' \
  -H 'X-Mcp-Secret-AZURE-CLIENT-SECRET: your-client-secret' \
  -H 'X-Mcp-Secret-AZURE-TENANT-ID: your-tenant-id' \
  -H 'X-Mcp-Secret-AZURE-SUBSCRIPTION-ID: your-subscription-id' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"stop_vm","arguments":{"resource_group":"rg-staging","name":"vm-staging-01"}}}'
```

## Technical Notes

- **OAuth2 client credentials.** Every request fetches (or reuses a cached) Bearer token from `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`. Tokens are cached in module memory with a 60-second safety buffer before expiry.
- **Token caching.** Two separate caches are maintained — one for the Azure management plane (`https://management.azure.com/.default`) and one for the Key Vault data plane (`https://vault.azure.net/.default`). This avoids redundant token fetches across calls.
- **Key Vault data plane uses a separate scope.** The `list_vault_secrets` and `get_vault_secret` tools call `https://{vault-name}.vault.azure.net` directly using a token scoped to `https://vault.azure.net/.default`, not the management API token.
- **VM stop = deallocate.** `stop_vm` uses the `/deallocate` action, which stops the VM and releases the compute allocation so you are not billed for VM compute while stopped. The `/powerOff` action stops the OS but keeps the VM allocated and billed.
- **Async VM/container operations return 202.** Start, stop, and restart operations on VMs and Container Instance groups return `{accepted: true, status: 202}`. Azure processes these asynchronously — use `get_vm_status` to poll the result.
- **Management API base:** `https://management.azure.com`

## License

MIT
