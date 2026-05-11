# mcp-hetzner — Hetzner Cloud MCP Server

> Manage Hetzner Cloud servers, networks, volumes, and firewalls from any AI agent.

Hetzner Cloud is a leading European cloud provider offering high-performance VPS, dedicated servers, and cloud infrastructure at highly competitive pricing — favored by developers and startups worldwide. This MCP server gives your AI agents full access to the Hetzner Cloud API: create and manage servers, private networks, block storage volumes, firewalls, and SSH keys. Ideal for automating infrastructure provisioning, self-healing deployments, and cloud operations workflows.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-hetzner`

---

## What You Can Do

- **Server lifecycle** — create, reboot, power on/off, rebuild with a new OS image, and delete Hetzner Cloud servers programmatically
- **Private networks** — create and manage VPC-style private networks to isolate your infrastructure
- **Block storage volumes** — provision volumes, attach or detach them from servers, and delete them when no longer needed
- **Firewalls** — define inbound/outbound rules and apply firewalls to servers to control network access
- **SSH keys** — manage project-level SSH keys for passwordless server access
- **Locations and server types** — discover available datacenters and server specs (CPU, RAM, disk, pricing) before provisioning
- **Load balancers** — create, inspect, and delete load balancers and manage their targets
- **Snapshots** — create and delete server snapshots for backups and image reuse
- **Floating IPs** — allocate static IP addresses, assign/unassign them to servers, and release them

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify Hetzner Cloud credentials (used by Aerostack to validate the token) |
| `list_servers` | List all servers with status, IPs, and server type |
| `get_server` | Get full details of a server by ID |
| `create_server` | Create a new server with specified type, image, location, and optional SSH keys |
| `delete_server` | Permanently delete a server |
| `reboot_server` | Reboot a server |
| `power_on_server` | Power on a stopped server |
| `power_off_server` | Power off a running server (hard shutdown) |
| `rebuild_server` | Reinstall a server with a different OS image (erases all data) |
| `list_networks` | List all private networks |
| `create_network` | Create a new private network with an IP range |
| `delete_network` | Delete a private network |
| `list_volumes` | List all block storage volumes |
| `create_volume` | Create a new volume (optionally attach to a server immediately) |
| `attach_volume` | Attach an existing volume to a server |
| `detach_volume` | Detach a volume from its current server |
| `delete_volume` | Delete a block storage volume |
| `list_firewalls` | List all firewalls |
| `create_firewall` | Create a firewall with inbound/outbound rules |
| `apply_firewall_to_server` | Apply a firewall to a server |
| `delete_firewall` | Delete a firewall |
| `list_ssh_keys` | List all SSH keys in the project |
| `create_ssh_key` | Add a new SSH public key to the project |
| `delete_ssh_key` | Remove an SSH key from the project |
| `list_locations` | List all available datacenter locations |
| `list_server_types` | List all server types with CPU, RAM, disk, and pricing |
| `list_load_balancers` | List all load balancers with targets, services, and health status |
| `get_load_balancer` | Get details of a specific load balancer including all targets and health checks |
| `create_load_balancer` | Create a new load balancer (type, location, optional algorithm) |
| `delete_load_balancer` | Delete a load balancer |
| `add_load_balancer_target` | Add a server or label-selector target to a load balancer |
| `list_snapshots` | List all server snapshots in the project |
| `create_server_snapshot` | Create a snapshot of a server |
| `delete_snapshot` | Delete a snapshot image |
| `list_floating_ips` | List all floating (static) IP addresses |
| `create_floating_ip` | Allocate a new floating IP address |
| `assign_floating_ip` | Assign a floating IP to a server |
| `unassign_floating_ip` | Remove a floating IP from its current server (IP remains allocated) |
| `delete_floating_ip` | Release a floating IP address (frees the IP) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `HETZNER_API_TOKEN` | Yes | Hetzner Cloud API Token | Go to [console.hetzner.cloud](https://console.hetzner.cloud) → select your Project → **Security** → **API Tokens** → **Generate API Token**. Choose **Read & Write** access. |

> Use a **Read & Write** token if you intend to create or modify resources. A **Read** token works for list/get operations only. Tokens are project-scoped — they can only access resources in the project they were created for.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Hetzner"** and click **Add to Workspace**
3. Add your `HETZNER_API_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can provision and manage Hetzner Cloud infrastructure automatically.

### Example Prompts

```
"Create a cx21 server called web-01 in Nuremberg running Ubuntu 22.04 with my default SSH key"
"List all my Hetzner servers and show their IPs and current status"
"Reboot the server with ID 12345678"
"Create a 50 GB volume called postgres-data in fsn1 and attach it to server 12345678"
"Set up a firewall that allows SSH (port 22) and HTTPS (port 443) from anywhere, then apply it to server 12345678"
"What server types are available in Helsinki and what do they cost?"
"Rebuild server 12345678 with Debian 12"
"Create a private network 10.0.0.0/16 called internal-vpc"
```

### Direct API Calls

```bash
# Ping / verify credentials
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-hetzner \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-HETZNER-API-TOKEN: your-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"_ping","arguments":{}}}'

# List all servers
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-hetzner \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-HETZNER-API-TOKEN: your-api-token' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_servers","arguments":{}}}'

# Create a server
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-hetzner \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-HETZNER-API-TOKEN: your-api-token' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_server","arguments":{"name":"web-01","server_type":"cx21","image":"ubuntu-22.04","location":"nbg1"}}}'

# List available server types
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-hetzner \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-HETZNER-API-TOKEN: your-api-token' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_server_types","arguments":{}}}'
```

## Technical Notes

- **Integer IDs.** All Hetzner Cloud resources (servers, volumes, networks, firewalls, SSH keys) are identified by integer IDs. Pass them as numbers, not strings.
- **Async actions.** Operations like `reboot_server`, `power_on_server`, `power_off_server`, `rebuild_server`, `attach_volume`, and `detach_volume` return an `action` object with `id`, `status`, and `command` fields. The status will be `"running"` while the operation is in progress and `"success"` once complete. Hetzner actions are typically fast (under 30 seconds).
- **Server types are strings.** Pass the slug, e.g. `"cx21"`, `"cx31"`, `"cpx11"`, `"cpx21"`. Use `list_server_types` to discover all available options.
- **Images are strings.** Pass the OS image name, e.g. `"ubuntu-22.04"`, `"debian-12"`, `"centos-9"`, `"fedora-41"`. You can also pass a snapshot ID as a number.
- **Locations are strings.** Available locations: `"nbg1"` (Nuremberg, Germany), `"fsn1"` (Falkenstein, Germany), `"hel1"` (Helsinki, Finland), `"ash"` (Ashburn, Virginia, US), `"hil"` (Hillsboro, Oregon, US), `"sin"` (Singapore). Use `list_locations` for the authoritative list.
- **Firewall rules.** Direction must be `"in"` or `"out"`. Protocol must be `"tcp"`, `"udp"`, `"icmp"`, or `"esp"`. For `icmp` and `esp`, omit the `port` field. For `tcp`/`udp`, port can be a single port (`"22"`) or a range (`"8000-9000"`). Use CIDR notation for `source_ips` and `destination_ips` (e.g. `["0.0.0.0/0", "::/0"]` for all traffic).
- **All list endpoints** return up to 50 resources per call.

## License

MIT
