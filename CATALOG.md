# Aerostack MCP Catalog

Single source of truth for all MCP servers in this repository.
**Last updated: 2026-03-29**

> Total: **135 MCPs** — 114 hosted + 21 proxy
> Before adding a new MCP, search this file first to avoid duplicates.

---

## Hosted MCPs (114)

These are fully implemented Cloudflare Worker MCP servers with source code, tests, and README.

### Analytics & Data
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-ahrefs | SEO/Analytics | API Key | ~15 |
| mcp-algolia | Search | API Key | ~15 |
| mcp-amplitude | Analytics | API Key | ~15 |
| mcp-bigquery | Data Warehouse | OAuth | ~15 |
| mcp-clickhouse | Database | API Key | ~15 |
| mcp-mixpanel | Analytics | API Key | ~15 |
| mcp-posthog | Analytics | API Key | ~15 |
| mcp-segment | CDP | API Key | ~15 |
| mcp-snowflake | Data Warehouse | OAuth | ~15 |

### CRM & Sales
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-apollo | Sales Intelligence | API Key | 21 |
| mcp-attio | CRM | Bearer | 22 |
| mcp-close | CRM | Basic (API Key) | 22 |
| mcp-pipedrive | CRM | API Key | ~15 |
| mcp-salesforce | CRM | OAuth Bearer | 25 |

### Communication & Messaging
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-discord | Chat | Bot Token | ~15 |
| mcp-gmail | Email | OAuth | ~15 |
| mcp-microsoft-graph | Microsoft 365 | OAuth | ~20 |
| mcp-outlook | Email | OAuth | ~15 |
| mcp-pusher | Realtime | API Key | ~10 |
| mcp-resend | Email | API Key | ~10 |
| mcp-sendgrid | Email | API Key | ~15 |
| mcp-slack | Chat | Bot Token | ~20 |
| mcp-telegram | Chat | Bot Token | ~15 |
| mcp-twilio | SMS/Voice | API Key | ~15 |
| mcp-whatsapp | Chat | API Token | ~15 |

### Databases
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-arangodb | Graph DB | API Key | ~10 |
| mcp-dynamodb | AWS DB | AWS Keys | ~15 |
| mcp-elasticsearch | Search DB | API Key | ~15 |
| mcp-firebase | BaaS | Service Account | ~15 |
| mcp-mongodb | Document DB | Connection String | ~15 |
| mcp-neon | Postgres | API Key | ~15 |
| mcp-pinecone | Vector DB | API Key | ~15 |
| mcp-planetscale | MySQL | API Key | ~15 |
| mcp-qdrant | Vector DB | API Key | ~15 |
| mcp-redis | Cache DB | URL | ~10 |
| mcp-supabase | BaaS | API Key | ~15 |
| mcp-turso | SQLite | API Key | ~15 |
| mcp-upstash-kafka | Kafka | API Key | ~10 |

### Developer Tools & DevOps
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-aws | AWS | Access Keys | ~20 |
| mcp-aws-s3 | Storage | Access Keys | ~10 |
| mcp-circleci | CI/CD | API Key | ~15 |
| mcp-docker | Containers | API Key | ~15 |
| mcp-gitlab | Git/CI | API Key | ~20 |
| mcp-newrelic | Observability | API Key (GraphQL) | 21 |
| mcp-pagerduty | Incident Mgmt | API Key | ~15 |
| mcp-playwright | Browser Testing | — | ~10 |
| mcp-railway | PaaS | API Key | ~15 |
| mcp-render | PaaS | API Key | ~15 |
| mcp-terraform | IaC | API Key | ~10 |

### Documents & Productivity
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-airtable | Database/Sheets | API Key | ~15 |
| mcp-basecamp | Project Mgmt | OAuth | ~15 |
| mcp-clickup | Project Mgmt | API Key | 23 |
| mcp-coda | Docs | API Key | ~15 |
| mcp-confluence | Docs | API Key | ~15 |
| mcp-docusign | eSignature | OAuth | 21 |
| mcp-dropbox | Storage | OAuth | ~15 |
| mcp-excel | Spreadsheet | OAuth | ~15 |
| mcp-google-docs | Docs | OAuth | ~15 |
| mcp-google-drive | Storage | OAuth | ~15 |
| mcp-google-sheets | Spreadsheet | OAuth | ~15 |
| mcp-loom | Video | API Key | ~10 |
| mcp-miro | Whiteboard | Bearer | 22 |
| mcp-notion | Docs/DB | API Key | ~20 |
| mcp-pandadoc | eSignature | API-Key | 20 |
| mcp-todoist | Tasks | Bearer | 22 |
| mcp-trello | Project Mgmt | API Key + Token | 21 |
| mcp-typeform | Forms | API Key | ~15 |

### E-Commerce
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-chargebee | Billing | API Key | ~15 |
| mcp-plaid | Finance | OAuth | ~15 |
| mcp-woocommerce | E-Commerce | Basic (Consumer Key) | 22 |

### Finance & Accounting
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-quickbooks | Accounting | OAuth | 23 |
| mcp-xero | Accounting | OAuth Bearer + Tenant ID | 22 |

### HR & Payroll
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-bamboohr | HR | Basic (API Key) | 23 |
| mcp-greenhouse | Recruiting | Basic (API Key) | 23 |
| mcp-gusto | Payroll | Bearer | 22 |
| mcp-rippling | HR/IT | Bearer | 20 |

### Infrastructure & Cloud
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-cloudinary | Media CDN | API Key | ~15 |

### Marketing & Email
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-activecampaign | Marketing/CRM | API Key | 23 |
| mcp-ayrshare | Social Posting | API Key | ~10 |
| mcp-brevo | Email/SMS/Marketing | API Key | 21 |
| mcp-customer-io | Behavioral Marketing | Basic + Bearer | 20 |
| mcp-ghost | CMS/Newsletter | API Key | ~15 |
| mcp-klaviyo | Email Marketing | API Key | ~15 |
| mcp-mailchimp | Email Marketing | API Key | ~15 |
| mcp-ocoya | Social Marketing | API Key | ~10 |
| mcp-typefully | Twitter Scheduling | API Key | ~10 |

### Media & Content
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-huggingface | AI/ML | API Key | ~15 |
| mcp-rss | RSS Feeds | — | ~10 |
| mcp-twitch | Streaming | OAuth | ~15 |
| mcp-youtube | Video | API Key + OAuth | 21 |

### Scheduling
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-cal-com | Scheduling | API Key | ~15 |
| mcp-calendly | Scheduling | OAuth | ~15 |

### Social Media
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-buffer | Social Scheduling | Bearer | 18 |
| mcp-facebook-pages | Social | Page Access Token | 20 |
| mcp-instagram | Social | Meta Token | 17 |
| mcp-linkedin | Social/Sales | OAuth Bearer | 21 |
| mcp-reddit | Social | OAuth Bearer | 17 |
| mcp-tiktok | Social | Bearer | 15 |
| mcp-twitter | Social | Bearer + Access Token | 19 |

### Support & Customer Success
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-freshdesk | Support | API Key | ~15 |
| mcp-zendesk | Support | API Key | ~15 |

### Video & Communication Platforms
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-google-calendar | Calendar | OAuth | ~15 |
| mcp-google-meet | Video | OAuth | 16 |
| mcp-zoom | Video | Server-to-Server OAuth | 20 |

### Web & Development Tools
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-exa | AI Search | API Key | ~10 |
| mcp-firecrawl | Web Scraping | API Key | ~10 |
| mcp-n8n | Automation | API Key | ~15 |
| mcp-openai | AI | API Key | ~15 |
| mcp-webflow | CMS/Web | API Key | ~15 |

### Internal
| MCP | Category | Auth | Tools |
|-----|----------|------|-------|
| mcp-aerostack-registry | Internal | — | — |
| mcp-anthropic | AI | API Key | ~10 |

---

## Proxy MCPs (21)

These use Aerostack's proxy layer — hosted externally, surfaced via the proxy adapter.

| Name | Category |
|------|----------|
| asana | Project Management |
| atlassian | Jira/Confluence Cloud |
| box | Storage |
| canva | Design |
| cloudflare | Infrastructure |
| datadog | Observability |
| figma | Design |
| github | Git/Code |
| grafana | Observability |
| hubspot | CRM/Marketing |
| intercom | Customer Support |
| linear | Issue Tracking |
| monday | Project Management |
| notion | Docs/DB (also hosted) |
| paypal | Payments |
| razorpay | Payments (India) |
| sentry | Error Tracking |
| shopify | E-Commerce |
| stripe | Payments |
| vercel | Deployment |
| zapier | Automation |

---

## How to Add a New MCP

1. **Check this file first** — search for the service name. If it exists, don't rebuild it.
2. **Update this file** when you add a new MCP — add it to the correct category table.
3. **Build in** `/MCP/mcp-{name}/` following the Salesforce pattern (`mcp-salesforce` is the reference).
4. **Required files:** `src/index.ts`, `src/index.test.ts`, `aerostack.toml`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`
5. **Quality bar:** `_ping` tool, full JSON schema per tool, every tool tested, README with how-to-get for each secret.

---

## Build Batches History

| Batch | Date | MCPs Built | Tests |
|-------|------|------------|-------|
| Batch 1 — Tier 1 | 2026-03-29 | twitter, linkedin, instagram, tiktok, reddit, trello, clickup, zoom, google-meet, youtube, docusign, quickbooks, bamboohr, greenhouse, activecampaign | 1,005 |
| Batch 2 — Tier 2 | 2026-03-29 | xero, close, attio, apollo, brevo, customer-io, facebook-pages, buffer, gusto, rippling, miro, todoist, pandadoc, newrelic, woocommerce | ~944 |
