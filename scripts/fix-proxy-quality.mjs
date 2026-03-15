#!/usr/bin/env node
/**
 * Fix proxy quality gate issues:
 * 1. Names too short (< 10 chars) → use descriptive names
 * 2. Missing tags in proxy.json
 * 3. Proxy READMEs missing ## Overview, ## Usage, ## Configuration sections + code block
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'proxy');

const FIXES = {
  atlassian: {
    name: 'Atlassian Cloud',
    tags: ['jira', 'confluence', 'atlassian', 'project-management', 'issues'],
  },
  cloudflare: {
    name: 'Cloudflare Platform',
    tags: ['cloudflare', 'cdn', 'dns', 'workers', 'security'],
  },
  figma: {
    name: 'Figma Design',
    tags: ['figma', 'design', 'ui', 'prototyping', 'collaboration'],
  },
  github: {
    name: 'GitHub API',
    tags: ['github', 'git', 'repos', 'pull-requests', 'code'],
  },
  hubspot: {
    name: 'HubSpot CRM',
    tags: ['hubspot', 'crm', 'contacts', 'deals', 'marketing'],
  },
  intercom: {
    name: 'Intercom Messaging',
    tags: ['intercom', 'support', 'messaging', 'customers', 'chat'],
  },
  linear: {
    name: 'Linear Project Management',
    tags: ['linear', 'issues', 'project-management', 'engineering', 'sprints'],
  },
  notion: {
    name: 'Notion Workspace',
    tags: ['notion', 'docs', 'wiki', 'database', 'productivity'],
  },
  paypal: {
    name: 'PayPal Payments',
    tags: ['paypal', 'payments', 'checkout', 'invoices', 'ecommerce'],
  },
  razorpay: {
    name: 'Razorpay Billing',
    tags: ['razorpay', 'payments', 'india', 'billing', 'subscriptions'],
  },
  sentry: {
    name: 'Sentry Error Monitoring',
    tags: ['sentry', 'errors', 'monitoring', 'debugging', 'alerts'],
  },
  stripe: {
    name: 'Stripe Payments',
    tags: ['stripe', 'payments', 'subscriptions', 'invoices', 'billing'],
  },
  vercel: {
    name: 'Vercel Deployments',
    tags: ['vercel', 'deployments', 'hosting', 'frontend', 'ci-cd'],
  },
};

// Fix proxy.json files
for (const [id, fix] of Object.entries(FIXES)) {
  const path = join(ROOT, id, 'proxy.json');
  if (!existsSync(path)) continue;

  const proxy = JSON.parse(readFileSync(path, 'utf8'));
  proxy.name = fix.name;
  proxy.tags = fix.tags;
  writeFileSync(path, JSON.stringify(proxy, null, 2) + '\n');
  console.log(`✅ proxy.json patched: ${id} → "${fix.name}"`);
}

// Fix proxy READMEs — rewrite with proper sections
const README_TEMPLATE = (proxy, fix) => {
  const secretVar  = proxy.env_vars?.[0]?.key ?? 'API_KEY';
  const secretHeader = secretVar.replace(/_/g, '-');
  const firstTool  = proxy.tools?.[0]?.name ?? 'list_items';
  const slug = `mcp-${proxy.id}`;

  return `# ${fix.name} MCP

> Official proxy MCP — ${proxy.description}

**Live endpoint:** \`https://mcp.aerostack.dev/s/navin/${slug}\`

---

## Overview

${fix.name} is a proxy MCP server that forwards requests directly to the official ${proxy.name.split(' ')[0]} MCP endpoint at \`${proxy.proxy_url}\`. All tools are maintained by ${proxy.name.split(' ')[0]} — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by ${proxy.name.split(' ')[0]})
**Auth:** Bearer token via \`${secretVar}\`

## Available Tools

${(proxy.tools ?? []).map(t => `- **${t.name}** — ${t.description}`).join('\n')}

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
${(proxy.env_vars ?? []).map(v => `| \`${v.key}\` | ${v.required ? 'Yes' : 'No'} | ${v.description} | ${v.how_to_set} |`).join('\n')}

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"${fix.name}"**
3. Enter your \`${secretVar}\` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use ${proxy.name.split(' ')[0]} tools automatically.

## Usage

### Example Prompts

\`\`\`
"List all my ${proxy.name.split(' ')[0]} items and summarize the most recent ones"
"Find anything related to [keyword] in ${proxy.name.split(' ')[0]}"
"Create a new entry with the following details: ..."
\`\`\`

### Direct API Call

\`\`\`bash
curl -X POST https://mcp.aerostack.dev/s/navin/${slug} \\
  -H 'Content-Type: application/json' \\
  -H 'X-Mcp-Secret-${secretHeader}: your-key' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"${firstTool}","arguments":{}}}'
\`\`\`

## License

MIT
`;
};

for (const [id, fix] of Object.entries(FIXES)) {
  const proxyPath = join(ROOT, id, 'proxy.json');
  const readmePath = join(ROOT, id, 'README.md');
  if (!existsSync(proxyPath)) continue;

  const proxy = JSON.parse(readFileSync(proxyPath, 'utf8'));
  const content = README_TEMPLATE(proxy, fix);
  writeFileSync(readmePath, content);
  console.log(`📝 README written: ${id}`);
}

console.log('\nDone. Run: DEPLOY_ENV=staging node scripts/deploy-all.mjs --proxies-only');
