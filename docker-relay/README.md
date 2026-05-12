# docker-relay

> Lightweight HTTP relay that runs on your servers and accepts signed Docker commands from the `mcp-docker-engine-cf` Cloudflare Worker via Cloudflare Tunnel.

One `docker-relay` process per environment (dev, stg, prod). Binds to `127.0.0.1` only — never exposed to the public internet. Cloudflare Tunnel handles the HTTPS endpoint.

---

## Architecture

```
Claude Code / Aerostack Agent
        │
        ▼
mcp-docker-engine-cf (Cloudflare Worker)
        │  HTTPS + Bearer token
        ▼
Cloudflare Tunnel  ──────────────────────────────────────────────────────────┐
                                                                              │
[dev server]                   [stg server]                [prod server]     │
  cloudflared daemon ◄───────────────────────────────────────────────────────┘
       │
       ▼
  docker-relay  (127.0.0.1:4242)
       │
       ▼
  Docker Engine (local socket)
```

No Docker ports exposed. No inbound firewall rules needed.

---

## Setup: Each Server

### 1. Install docker-relay

```bash
# On the server
git clone https://github.com/aerostackdev/aerostack-mcp
cd aerostack-mcp/MCP/docker-relay
npm install && npm run build

# Create systemd service
sudo tee /etc/systemd/system/docker-relay.service <<EOF
[Unit]
Description=Docker Relay for Aerostack
After=network.target docker.service

[Service]
ExecStart=/usr/bin/node /opt/docker-relay/dist/index.js
WorkingDirectory=/opt/docker-relay
Environment=RELAY_SECRET=your-shared-secret
Environment=PORT=4242
Environment=BIND=127.0.0.1
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now docker-relay
```

### 2. Install Cloudflare Tunnel

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Authenticate (once per Cloudflare account)
cloudflared tunnel login

# Create a tunnel
cloudflared tunnel create docker-dev

# Configure the tunnel
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <your-tunnel-id>
credentials-file: /home/ubuntu/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: docker-dev.yourdomain.com
    service: http://127.0.0.1:4242
  - service: http_status:404
EOF

# Add DNS record
cloudflared tunnel route dns docker-dev docker-dev.yourdomain.com

# Run as a service
cloudflared service install
sudo systemctl enable --now cloudflared
```

### 3. Verify

```bash
curl https://docker-dev.yourdomain.com/health
# → {"status":"ok","time":"..."}

curl -X POST https://docker-dev.yourdomain.com/docker \
  -H 'Authorization: Bearer your-shared-secret' \
  -H 'Content-Type: application/json' \
  -d '{"args":"ps -a --format \"table {{.Names}}\\t{{.Status}}\""}'
```

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `RELAY_SECRET` | Yes | Shared Bearer token — must match `DOCKER_RELAY_SECRET` secret in Aerostack |
| `PORT` | No | Listen port (default: 4242) |
| `BIND` | No | Bind address (default: `127.0.0.1` — localhost only) |

---

## Security

- Relay binds to `127.0.0.1` by default — not reachable from the network
- All requests require a valid `Bearer` token matching `RELAY_SECRET`
- Only `docker` subcommands in the allowlist are accepted: `ps`, `inspect`, `logs`, `stats`, `images`, `pull`, `rmi`, `network`, `volume`, `system`, `start`, `stop`, `restart`, `rm`, `exec`, `compose`
- Cloudflare Tunnel provides TLS termination and DDoS protection
- Token rotation: update `RELAY_SECRET` on relay + `DOCKER_RELAY_SECRET` in Aerostack secrets

---

## Development

```bash
RELAY_SECRET=test npm run dev
# Listening on 127.0.0.1:4242

curl -X POST http://127.0.0.1:4242/docker \
  -H 'Authorization: Bearer test' \
  -H 'Content-Type: application/json' \
  -d '{"args":"ps"}'
```

## License

MIT
