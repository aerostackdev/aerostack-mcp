#!/usr/bin/env node
/**
 * Patch all aerostack.toml files with compelling descriptions, categories, and tags.
 * Run once: node scripts/patch-metadata.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const METADATA = {
  'mcp-aerostack-registry': {
    description: 'Discover and invoke any MCP, Function, or Skill published to the Aerostack marketplace — the universal AI capability hub.',
    category: 'Developer Tools',
    tags: ['registry', 'discovery', 'marketplace', 'aerostack'],
  },
  'mcp-airtable': {
    description: 'Turn your Airtable bases into an AI-queryable database — create, update, search, and analyze records with natural language.',
    category: 'Database',
    tags: ['database', 'spreadsheet', 'records', 'no-code'],
  },
  'mcp-amplitude': {
    description: 'Query product analytics, build audience cohorts, and surface funnel insights from Amplitude with AI-powered analysis.',
    category: 'Analytics',
    tags: ['analytics', 'product', 'events', 'funnels', 'cohorts'],
  },
  'mcp-anthropic': {
    description: 'Call Claude models directly — run AI conversations, tool-use chains, batch jobs, and model comparisons from any agent.',
    category: 'AI Platform',
    tags: ['ai', 'llm', 'claude', 'anthropic', 'completions'],
  },
  'mcp-cal-com': {
    description: 'Book meetings, check availability, and manage your entire scheduling workflow programmatically via Cal.com.',
    category: 'Scheduling',
    tags: ['scheduling', 'calendar', 'bookings', 'meetings'],
  },
  'mcp-calendly': {
    description: 'Access scheduled events, invitee data, and availability windows from Calendly — automate your booking workflows.',
    category: 'Scheduling',
    tags: ['scheduling', 'calendar', 'bookings', 'meetings'],
  },
  'mcp-chargebee': {
    description: 'Manage subscriptions, billing cycles, invoices, and customer plans — bring AI to your recurring revenue operations.',
    category: 'Billing',
    tags: ['billing', 'subscriptions', 'payments', 'saas', 'revenue'],
  },
  'mcp-discord': {
    description: 'Read and send Discord messages, manage channels, roles, and members — automate your community from AI agents.',
    category: 'Communication',
    tags: ['discord', 'messaging', 'community', 'channels'],
  },
  'mcp-firebase': {
    description: 'Query Firestore collections, manage Firebase Auth users, and send FCM push notifications from any AI workflow.',
    category: 'Database',
    tags: ['firebase', 'firestore', 'database', 'auth', 'notifications'],
  },
  'mcp-freshdesk': {
    description: 'Create tickets, manage contacts, and resolve support issues faster — give your AI agents full Freshdesk access.',
    category: 'Customer Support',
    tags: ['support', 'helpdesk', 'tickets', 'crm', 'freshdesk'],
  },
  'mcp-ghost': {
    description: 'Publish posts, manage members, and control your Ghost content platform — AI-powered editorial workflows.',
    category: 'CMS',
    tags: ['cms', 'blogging', 'content', 'publishing', 'ghost'],
  },
  'mcp-gmail': {
    description: 'Read, send, and search Gmail messages — manage labels, drafts, and attachments with full inbox control.',
    category: 'Email',
    tags: ['email', 'gmail', 'google', 'inbox', 'messaging'],
  },
  'mcp-google-calendar': {
    description: 'Create events, check availability, and manage calendars across Google Calendar — automate your scheduling.',
    category: 'Scheduling',
    tags: ['calendar', 'google', 'scheduling', 'events', 'meetings'],
  },
  'mcp-google-drive': {
    description: 'List, search, upload, share, and organize files in Google Drive — AI-native document and storage management.',
    category: 'File Storage',
    tags: ['google', 'storage', 'files', 'documents', 'drive'],
  },
  'mcp-google-sheets': {
    description: 'Read, write, and format Google Sheets data — use your spreadsheets as a live AI-accessible data source.',
    category: 'Database',
    tags: ['google', 'spreadsheet', 'data', 'sheets', 'database'],
  },
  'mcp-klaviyo': {
    description: 'Manage email/SMS campaigns, sync customer profiles, and trigger flows — AI-powered lifecycle marketing automation.',
    category: 'Marketing',
    tags: ['email', 'marketing', 'sms', 'campaigns', 'ecommerce'],
  },
  'mcp-mailchimp': {
    description: 'Manage audiences, campaigns, and subscriber tags in Mailchimp — automate your email marketing with AI.',
    category: 'Marketing',
    tags: ['email', 'marketing', 'campaigns', 'audiences', 'newsletters'],
  },
  'mcp-microsoft-graph': {
    description: 'Access Microsoft 365 from one API — Teams messages, Outlook email, Calendar events, and OneDrive files.',
    category: 'Productivity',
    tags: ['microsoft', 'office365', 'teams', 'outlook', 'enterprise'],
  },
  'mcp-mixpanel': {
    description: 'Track events, analyze user journeys, and export cohort data from Mixpanel — AI-driven product intelligence.',
    category: 'Analytics',
    tags: ['analytics', 'product', 'events', 'funnels', 'cohorts'],
  },
  'mcp-openai': {
    description: 'Run chat completions, generate embeddings, create images, and moderate content via the OpenAI API.',
    category: 'AI Platform',
    tags: ['ai', 'llm', 'openai', 'gpt', 'embeddings', 'images'],
  },
  'mcp-pipedrive': {
    description: 'Manage deals, contacts, and sales pipelines in Pipedrive — give AI agents full access to your CRM.',
    category: 'CRM',
    tags: ['crm', 'sales', 'deals', 'pipeline', 'contacts'],
  },
  'mcp-planetscale': {
    description: 'Execute queries, inspect schemas, and manage deploy requests on PlanetScale MySQL databases.',
    category: 'Database',
    tags: ['database', 'mysql', 'planetscale', 'sql', 'serverless'],
  },
  'mcp-posthog': {
    description: 'Capture events, manage feature flags, and run experiments in PostHog — AI-driven product analytics and A/B testing.',
    category: 'Analytics',
    tags: ['analytics', 'feature-flags', 'experiments', 'product', 'posthog'],
  },
  'mcp-pusher': {
    description: 'Trigger real-time events to browser and mobile clients, manage presence channels, and authenticate sockets via Pusher.',
    category: 'Real-time',
    tags: ['realtime', 'websockets', 'events', 'channels', 'pusher'],
  },
  'mcp-railway': {
    description: 'Deploy services, inspect logs, manage environments, and control your Railway infrastructure with AI.',
    category: 'DevOps',
    tags: ['devops', 'deployment', 'infrastructure', 'railway', 'hosting'],
  },
  'mcp-resend': {
    description: 'Send transactional emails with developer-grade deliverability — manage domains, API keys, and sending stats via Resend.',
    category: 'Email',
    tags: ['email', 'transactional', 'resend', 'smtp', 'deliverability'],
  },
  'mcp-salesforce': {
    description: 'Query leads, contacts, opportunities, and accounts in Salesforce — full SOQL support for enterprise CRM automation.',
    category: 'CRM',
    tags: ['crm', 'salesforce', 'leads', 'opportunities', 'enterprise'],
  },
  'mcp-segment': {
    description: 'Send track, identify, group, and page events to Segment — unify your customer data pipeline with AI.',
    category: 'Analytics',
    tags: ['analytics', 'cdp', 'segment', 'events', 'tracking'],
  },
  'mcp-sendgrid': {
    description: 'Send emails at scale, manage dynamic templates, and track delivery stats via SendGrid\'s email infrastructure.',
    category: 'Email',
    tags: ['email', 'sendgrid', 'transactional', 'marketing', 'templates'],
  },
  'mcp-slack': {
    description: 'Send messages, search conversations, and manage channels in Slack — connect AI agents to your team workspace.',
    category: 'Communication',
    tags: ['slack', 'messaging', 'team', 'channels', 'notifications'],
  },
  'mcp-supabase': {
    description: 'Query Postgres tables, manage storage buckets, and interact with your Supabase backend — AI-native database access.',
    category: 'Database',
    tags: ['database', 'postgres', 'supabase', 'storage', 'backend'],
  },
  'mcp-telegram': {
    description: 'Send messages, manage groups, run polls, and moderate Telegram communities — full Bot API access for AI agents.',
    category: 'Messaging',
    tags: ['telegram', 'messaging', 'bots', 'community', 'notifications'],
  },
  'mcp-twilio': {
    description: 'Send SMS, make calls, and manage phone numbers via Twilio — add programmable communications to any AI workflow.',
    category: 'Communication',
    tags: ['sms', 'twilio', 'phone', 'communications', 'voice'],
  },
  'mcp-typeform': {
    description: 'Create forms, collect responses, and manage workspaces in Typeform — conversational data collection at scale.',
    category: 'Forms',
    tags: ['forms', 'surveys', 'typeform', 'data-collection', 'responses'],
  },
  'mcp-webflow': {
    description: 'Manage CMS collections, publish content, and control site deployments in Webflow — AI-powered web publishing.',
    category: 'CMS',
    tags: ['cms', 'webflow', 'website', 'content', 'publishing'],
  },
  'mcp-whatsapp': {
    description: 'Send WhatsApp messages, templates, interactive menus, and media — automate business messaging at scale.',
    category: 'Messaging',
    tags: ['whatsapp', 'messaging', 'sms', 'business', 'notifications'],
  },
  'mcp-zendesk': {
    description: 'Manage support tickets, users, and knowledge base articles in Zendesk — AI-powered customer service automation.',
    category: 'Customer Support',
    tags: ['support', 'zendesk', 'helpdesk', 'tickets', 'knowledge-base'],
  },
};

let updated = 0;

for (const [slug, meta] of Object.entries(METADATA)) {
  const tomlPath = join(ROOT, slug, 'aerostack.toml');
  let content;
  try {
    content = readFileSync(tomlPath, 'utf8');
  } catch {
    console.log(`⏭  ${slug} — no aerostack.toml, skipping`);
    continue;
  }

  // Replace description
  content = content.replace(
    /^description\s*=\s*".+"/m,
    `description = "${meta.description}"`
  );

  // Add or replace category
  if (/^category\s*=/m.test(content)) {
    content = content.replace(/^category\s*=\s*".+"/m, `category = "${meta.category}"`);
  } else {
    content = content.replace(/^(description\s*=\s*".+")/m, `$1\ncategory = "${meta.category}"`);
  }

  // Add or replace tags
  const tagsLine = `tags = [${meta.tags.map(t => `"${t}"`).join(', ')}]`;
  if (/^tags\s*=/m.test(content)) {
    content = content.replace(/^tags\s*=\s*\[.+\]/m, tagsLine);
  } else {
    content = content.replace(/^(category\s*=\s*".+")/m, `$1\n${tagsLine}`);
  }

  writeFileSync(tomlPath, content);
  console.log(`✅ ${slug} — ${meta.category}`);
  updated++;
}

console.log(`\nUpdated ${updated} aerostack.toml files`);
