/**
 * Azure MCP Worker
 * Implements MCP protocol over HTTP for Azure REST API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   AZURE_CLIENT_ID       → X-Mcp-Secret-AZURE-CLIENT-ID
 *   AZURE_CLIENT_SECRET   → X-Mcp-Secret-AZURE-CLIENT-SECRET
 *   AZURE_TENANT_ID       → X-Mcp-Secret-AZURE-TENANT-ID
 *   AZURE_SUBSCRIPTION_ID → X-Mcp-Secret-AZURE-SUBSCRIPTION-ID
 *
 * Auth: OAuth2 client credentials flow against login.microsoftonline.com
 * Management API: https://management.azure.com
 * Key Vault data plane: https://{vault}.vault.azure.net (separate token scope)
 */

const MGMT_BASE = 'https://management.azure.com';

// ── Token Cache ───────────────────────────────────────────────────────────────

interface TokenEntry {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenEntry | null = null;
let kvTokenCache: TokenEntry | null = null;

async function fetchToken(tenantId: string, clientId: string, clientSecret: string, scope: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Azure token error (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  return data.access_token + '|' + String(Math.floor(Date.now() / 1000) + data.expires_in);
}

async function getAzureToken(clientId: string, clientSecret: string, tenantId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt > now + 60) return tokenCache.token;

  const raw = await fetchToken(tenantId, clientId, clientSecret, 'https://management.azure.com/.default');
  const [token, expStr] = raw.split('|');
  tokenCache = { token, expiresAt: parseInt(expStr, 10) };
  return token;
}

async function getKeyVaultToken(clientId: string, clientSecret: string, tenantId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (kvTokenCache && kvTokenCache.expiresAt > now + 60) return kvTokenCache.token;

  const raw = await fetchToken(tenantId, clientId, clientSecret, 'https://vault.azure.net/.default');
  const [token, expStr] = raw.split('|');
  kvTokenCache = { token, expiresAt: parseInt(expStr, 10) };
  return token;
}

// ── RPC Helpers ───────────────────────────────────────────────────────────────

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

// ── Azure REST Helpers ────────────────────────────────────────────────────────

interface Credentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  subscriptionId: string;
}

function getCredentials(request: Request): Credentials | null {
  const clientId = request.headers.get('X-Mcp-Secret-AZURE-CLIENT-ID');
  const clientSecret = request.headers.get('X-Mcp-Secret-AZURE-CLIENT-SECRET');
  const tenantId = request.headers.get('X-Mcp-Secret-AZURE-TENANT-ID');
  const subscriptionId = request.headers.get('X-Mcp-Secret-AZURE-SUBSCRIPTION-ID');
  if (!clientId || !clientSecret || !tenantId || !subscriptionId) return null;
  return { clientId, clientSecret, tenantId, subscriptionId };
}

async function azureGet(path: string, token: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${MGMT_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Azure API error (${res.status}): ${(await res.text()).slice(0, 500)}`);
  if (res.status === 204) return { success: true };
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function azurePost(path: string, token: string, body: unknown, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${MGMT_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 202) return { accepted: true, status: 202 };
  if (res.status === 204) return { success: true };
  if (!res.ok) throw new Error(`Azure API error (${res.status}): ${(await res.text()).slice(0, 500)}`);
  const text = await res.text();
  if (!text) return { success: true };
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function azurePut(path: string, token: string, body: unknown, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${MGMT_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Azure API error (${res.status}): ${(await res.text()).slice(0, 500)}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function kvGet(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Key Vault error (${res.status}): ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

// ── Tool Definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  // Auth
  {
    name: '_ping',
    description: 'Verify Azure credentials by fetching subscription details. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },

  // Resource Groups
  {
    name: 'list_resource_groups',
    description: 'List all resource groups in the Azure subscription',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_resource_group',
    description: 'Get details of a specific resource group',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Resource group name' },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_resource_group',
    description: 'Create a new resource group in the subscription',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Resource group name' },
        location: { type: 'string', description: 'Azure region (e.g. eastus, westeurope)' },
        tags: { type: 'object', description: 'Key-value tags to apply to the resource group' },
      },
      required: ['name', 'location'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_resources',
    description: 'List all resources inside a specific resource group',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
      },
      required: ['resource_group'],
    },
    annotations: { readOnlyHint: true },
  },

  // Virtual Machines
  {
    name: 'list_vms',
    description: 'List all virtual machines across the entire subscription',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_vms_in_rg',
    description: 'List all virtual machines in a specific resource group',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
      },
      required: ['resource_group'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_vm',
    description: 'Get details of a specific virtual machine including size, OS, and network info',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Virtual machine name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'start_vm',
    description: 'Start a stopped Azure virtual machine',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Virtual machine name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'stop_vm',
    description: 'Stop (deallocate) an Azure virtual machine — stops billing for compute',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Virtual machine name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'restart_vm',
    description: 'Restart an Azure virtual machine',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Virtual machine name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_vm_status',
    description: 'Get the current power state and provisioning status of a virtual machine',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Virtual machine name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: true },
  },

  // AKS
  {
    name: 'list_aks_clusters',
    description: 'List all AKS (Azure Kubernetes Service) clusters across the subscription',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_aks_cluster',
    description: 'Get details of a specific AKS cluster including node pools, version, and network profile',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'AKS cluster name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_aks_node_pools',
    description: 'List all node pools in an AKS cluster',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        cluster_name: { type: 'string', description: 'AKS cluster name' },
      },
      required: ['resource_group', 'cluster_name'],
    },
    annotations: { readOnlyHint: true },
  },

  // App Service
  {
    name: 'list_web_apps',
    description: 'List all App Service web apps across the subscription',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_web_app',
    description: 'Get details of a specific App Service web app',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Web app name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'restart_web_app',
    description: 'Restart an App Service web app',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Web app name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_web_app_logs',
    description: 'Get the logging configuration for an App Service web app',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Web app name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: true },
  },

  // Key Vault
  {
    name: 'list_key_vaults',
    description: 'List all Key Vaults in the subscription',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_key_vault',
    description: 'Get details of a specific Key Vault including access policies and SKU',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Key Vault name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_vault_secrets',
    description: 'List secret names (not values) in a Key Vault. Requires Key Vault data plane access.',
    inputSchema: {
      type: 'object',
      properties: {
        vault_name: { type: 'string', description: 'Key Vault name (e.g. my-vault → my-vault.vault.azure.net)' },
      },
      required: ['vault_name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_vault_secret',
    description: 'Get the current value of a secret from Key Vault. Requires Key Vault data plane access.',
    inputSchema: {
      type: 'object',
      properties: {
        vault_name: { type: 'string', description: 'Key Vault name' },
        secret_name: { type: 'string', description: 'Secret name' },
      },
      required: ['vault_name', 'secret_name'],
    },
    annotations: { readOnlyHint: true },
  },

  // Storage
  {
    name: 'list_storage_accounts',
    description: 'List all storage accounts in the subscription',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_storage_containers',
    description: 'List blob containers in a specific storage account',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        account_name: { type: 'string', description: 'Storage account name' },
      },
      required: ['resource_group', 'account_name'],
    },
    annotations: { readOnlyHint: true },
  },

  // Monitor / Alerts
  {
    name: 'list_alert_rules',
    description: 'List all metric alert rules in the subscription',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_activity_log',
    description: 'List Azure activity log events from the past 24 hours',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },

  // Container Instances
  {
    name: 'list_container_groups',
    description: 'List all Azure Container Instance groups in the subscription',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_container_group',
    description: 'Get details of a specific Azure Container Instance group',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Container group name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'start_container_group',
    description: 'Start a stopped Azure Container Instance group',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Container group name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'stop_container_group',
    description: 'Stop a running Azure Container Instance group',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Container group name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: false },
  },

  // Azure Functions
  {
    name: 'list_function_apps',
    description: 'List all Azure Function Apps across the subscription',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_function_app',
    description: 'Get details of a specific Azure Function App',
    inputSchema: {
      type: 'object',
      properties: {
        resource_group: { type: 'string', description: 'Resource group name' },
        name: { type: 'string', description: 'Function App name' },
      },
      required: ['resource_group', 'name'],
    },
    annotations: { readOnlyHint: true },
  },
];

// ── Tool Handlers ─────────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>, creds: Credentials): Promise<unknown> {
  const { clientId, clientSecret, tenantId, subscriptionId } = creds;
  const sub = subscriptionId;

  switch (name) {
    // Auth
    case '_ping': {
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}`, token, { 'api-version': '2022-12-01' });
    }

    // Resource Groups
    case 'list_resource_groups': {
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourcegroups`, token, { 'api-version': '2021-04-01', '$top': '100' });
    }
    case 'get_resource_group': {
      validateRequired(args, ['name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourcegroups/${args.name}`, token, { 'api-version': '2021-04-01' });
    }
    case 'create_resource_group': {
      validateRequired(args, ['name', 'location']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      const body: Record<string, unknown> = { location: args.location };
      if (args.tags) body.tags = args.tags;
      return azurePut(`/subscriptions/${sub}/resourcegroups/${args.name}`, token, body, { 'api-version': '2021-04-01' });
    }
    case 'list_resources': {
      validateRequired(args, ['resource_group']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourcegroups/${args.resource_group}/resources`, token, { 'api-version': '2021-04-01', '$top': '100' });
    }

    // Virtual Machines
    case 'list_vms': {
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/providers/Microsoft.Compute/virtualMachines`, token, { 'api-version': '2023-07-01', '$top': '100' });
    }
    case 'list_vms_in_rg': {
      validateRequired(args, ['resource_group']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.Compute/virtualMachines`, token, { 'api-version': '2023-07-01', '$top': '100' });
    }
    case 'get_vm': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.Compute/virtualMachines/${args.name}`, token, { 'api-version': '2023-07-01' });
    }
    case 'start_vm': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azurePost(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.Compute/virtualMachines/${args.name}/start`, token, {}, { 'api-version': '2023-07-01' });
    }
    case 'stop_vm': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azurePost(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.Compute/virtualMachines/${args.name}/deallocate`, token, {}, { 'api-version': '2023-07-01' });
    }
    case 'restart_vm': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azurePost(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.Compute/virtualMachines/${args.name}/restart`, token, {}, { 'api-version': '2023-07-01' });
    }
    case 'get_vm_status': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.Compute/virtualMachines/${args.name}/instanceView`, token, { 'api-version': '2023-07-01' });
    }

    // AKS
    case 'list_aks_clusters': {
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/providers/Microsoft.ContainerService/managedClusters`, token, { 'api-version': '2023-07-02-preview', '$top': '100' });
    }
    case 'get_aks_cluster': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.ContainerService/managedClusters/${args.name}`, token, { 'api-version': '2023-07-02-preview' });
    }
    case 'list_aks_node_pools': {
      validateRequired(args, ['resource_group', 'cluster_name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.ContainerService/managedClusters/${args.cluster_name}/agentPools`, token, { 'api-version': '2023-07-02-preview' });
    }

    // App Service
    case 'list_web_apps': {
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/providers/Microsoft.Web/sites`, token, { 'api-version': '2022-09-01', '$top': '100' });
    }
    case 'get_web_app': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.Web/sites/${args.name}`, token, { 'api-version': '2022-09-01' });
    }
    case 'restart_web_app': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azurePost(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.Web/sites/${args.name}/restart`, token, {}, { 'api-version': '2022-09-01' });
    }
    case 'get_web_app_logs': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.Web/sites/${args.name}/logs`, token, { 'api-version': '2022-09-01' });
    }

    // Key Vault (management plane)
    case 'list_key_vaults': {
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/providers/Microsoft.KeyVault/vaults`, token, { 'api-version': '2023-02-01', '$top': '100' });
    }
    case 'get_key_vault': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.KeyVault/vaults/${args.name}`, token, { 'api-version': '2023-02-01' });
    }

    // Key Vault (data plane — separate token scope)
    case 'list_vault_secrets': {
      validateRequired(args, ['vault_name']);
      const token = await getKeyVaultToken(clientId, clientSecret, tenantId);
      const url = `https://${args.vault_name}.vault.azure.net/secrets?api-version=7.4&$top=100`;
      return kvGet(url, token);
    }
    case 'get_vault_secret': {
      validateRequired(args, ['vault_name', 'secret_name']);
      const token = await getKeyVaultToken(clientId, clientSecret, tenantId);
      const url = `https://${args.vault_name}.vault.azure.net/secrets/${args.secret_name}?api-version=7.4`;
      return kvGet(url, token);
    }

    // Storage
    case 'list_storage_accounts': {
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/providers/Microsoft.Storage/storageAccounts`, token, { 'api-version': '2023-01-01', '$top': '100' });
    }
    case 'list_storage_containers': {
      validateRequired(args, ['resource_group', 'account_name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.Storage/storageAccounts/${args.account_name}/blobServices/default/containers`, token, { 'api-version': '2023-01-01', '$top': '100' });
    }

    // Monitor / Alerts
    case 'list_alert_rules': {
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/providers/Microsoft.Insights/metricalerts`, token, { 'api-version': '2018-03-01', '$top': '100' });
    }
    case 'list_activity_log': {
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      return azureGet(`/subscriptions/${sub}/providers/Microsoft.Insights/eventtypes/management/values`, token, {
        'api-version': '2015-04-01',
        '$filter': `eventTimestamp ge '${start}'`,
        '$top': '100',
      });
    }

    // Container Instances
    case 'list_container_groups': {
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/providers/Microsoft.ContainerInstance/containerGroups`, token, { 'api-version': '2023-05-01', '$top': '100' });
    }
    case 'get_container_group': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.ContainerInstance/containerGroups/${args.name}`, token, { 'api-version': '2023-05-01' });
    }
    case 'start_container_group': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azurePost(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.ContainerInstance/containerGroups/${args.name}/start`, token, {}, { 'api-version': '2023-05-01' });
    }
    case 'stop_container_group': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azurePost(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.ContainerInstance/containerGroups/${args.name}/stop`, token, {}, { 'api-version': '2023-05-01' });
    }

    // Azure Functions
    case 'list_function_apps': {
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/providers/Microsoft.Web/sites`, token, { 'api-version': '2022-09-01', '$filter': "kind eq 'functionapp'", '$top': '100' });
    }
    case 'get_function_app': {
      validateRequired(args, ['resource_group', 'name']);
      const token = await getAzureToken(clientId, clientSecret, tenantId);
      return azureGet(`/subscriptions/${sub}/resourceGroups/${args.resource_group}/providers/Microsoft.Web/sites/${args.name}`, token, { 'api-version': '2022-09-01' });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Worker Entry ──────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(
        JSON.stringify({ status: 'ok', server: 'mcp-azure', version: '1.0.0', tools: TOOLS.length }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    let body: { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
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
        serverInfo: { name: 'mcp-azure', version: '1.0.0' },
      });
    }

    if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });

    if (method === 'tools/call') {
      const creds = getCredentials(request);
      if (!creds) {
        return rpcErr(id, -32001, 'Missing Azure credentials — add AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID, and AZURE_SUBSCRIPTION_ID to workspace secrets');
      }

      try {
        const result = await callTool(params?.name ?? '', (params?.arguments ?? {}) as Record<string, unknown>, creds);
        return rpcOk(id, toolOk(result));
      } catch (e: unknown) {
        return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
      }
    }

    return rpcErr(id, -32601, `Method not found: ${method}`);
  },
};
