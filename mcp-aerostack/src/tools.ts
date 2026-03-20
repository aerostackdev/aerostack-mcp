/**
 * Tool definitions for the Aerostack MCP.
 *
 * Design: 10 tools max to stay under LLM token budgets.
 * Heavy documentation lives in MCP Resources (fetched on-demand).
 */

export const TOOLS = [
  // ── 1. guide ─────────────────────────────────────────────────────
  {
    name: "guide",
    description:
      "Get contextual help on building with Aerostack. Topics: start, telegram_setup, discord_setup, whatsapp_setup, slack_setup, llm_keys, workspace_tools, functions, credentials, node:<type> (e.g. node:llm_call). Returns setup instructions, credential requirements, and architecture guidance.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            'Help topic. Use "start" for overview, "credentials" to check what\'s configured, "node:llm_call" for a specific workflow node type, or a platform name for setup instructions.',
        },
      },
      required: ["topic"],
    },
  },

  // ── 2. list ──────────────────────────────────────────────────────
  {
    name: "list",
    description:
      "List resources in the user's account: bots, workflows, endpoints, webhooks, functions, workspace_tools, templates.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "bots",
            "workflows",
            "endpoints",
            "webhooks",
            "functions",
            "workspace_tools",
            "templates",
          ],
          description: "Resource type to list",
        },
        template_type: {
          type: "string",
          enum: [
            "bot",
            "ai-endpoint",
            "webhook",
            "ai-gateway",
            "workflow",
            "bot-team",
          ],
          description: "Filter templates by type (only for type=templates)",
        },
      },
      required: ["type"],
    },
  },

  // ── 3. get ───────────────────────────────────────────────────────
  {
    name: "get",
    description:
      "Get full details of a specific resource by type and ID. Returns config, status, workflow graph (for bots/workflows), and credential status.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "bot",
            "workflow",
            "endpoint",
            "webhook",
            "function",
            "template",
          ],
          description: "Resource type",
        },
        id: { type: "string", description: "Resource ID" },
      },
      required: ["type", "id"],
    },
  },

  // ── 4. create ────────────────────────────────────────────────────
  {
    name: "create",
    description:
      "Create a new resource: bot, workflow, endpoint, webhook, or function. For bots, include platform + platform_config (credentials validated and encrypted). For functions, code is deployed to the edge automatically.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["bot", "workflow", "endpoint", "webhook", "function"],
          description: "Resource type to create",
        },
        config: {
          type: "object",
          description:
            "Resource configuration. Use guide tool to learn required fields for each type.",
        },
      },
      required: ["type", "config"],
    },
  },

  // ── 5. update ────────────────────────────────────────────────────
  {
    name: "update",
    description:
      "Update an existing resource. Supports partial updates — only send fields that changed. For functions, updated code is auto-redeployed.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "bot",
            "workflow",
            "endpoint",
            "webhook",
            "function",
            "workspace_secret",
          ],
          description: "Resource type",
        },
        id: {
          type: "string",
          description:
            "Resource ID. For workspace_secret, use the secret key name.",
        },
        config: {
          type: "object",
          description: "Fields to update",
        },
      },
      required: ["type", "id", "config"],
    },
  },

  // ── 6. delete ────────────────────────────────────────────────────
  {
    name: "delete",
    description:
      "Delete a resource. Checks for references first (e.g. a workflow used by a bot cannot be deleted).",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["bot", "workflow", "endpoint", "webhook", "function"],
          description: "Resource type",
        },
        id: { type: "string", description: "Resource ID" },
      },
      required: ["type", "id"],
    },
  },

  // ── 7. validate ──────────────────────────────────────────────────
  {
    name: "validate",
    description:
      "Validate a resource config before creating/deploying. Checks workflow graphs for disconnected nodes, missing fields, invalid edges. Checks bot configs for required credentials. Checks function code for syntax errors.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["workflow", "bot", "function", "endpoint"],
          description: "Resource type to validate",
        },
        config: {
          type: "object",
          description: "The config to validate (same shape as create)",
        },
      },
      required: ["type", "config"],
    },
  },

  // ── 8. test ──────────────────────────────────────────────────────
  {
    name: "test",
    description:
      "Test-run a resource. For workflows: execute with a test message, returns per-node execution log. For bots: send a test message. For functions: invoke with a test payload. For endpoints: send a test request.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["workflow", "bot", "function", "endpoint"],
          description: "Resource type to test",
        },
        id: { type: "string", description: "Resource ID" },
        input: {
          type: "string",
          description:
            "Test input: message text for bots/workflows, JSON payload string for functions/endpoints",
        },
      },
      required: ["type", "id", "input"],
    },
  },

  // ── 9. deploy ────────────────────────────────────────────────────
  {
    name: "deploy",
    description:
      "Deploy/publish a resource to live. For bots: registers webhook with platform (Telegram/Discord/WhatsApp/Slack). For workflows: sets status to published. For functions: pushes to edge network.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["bot", "workflow", "function", "endpoint"],
          description: "Resource type to deploy",
        },
        id: { type: "string", description: "Resource ID" },
      },
      required: ["type", "id"],
    },
  },

  // ── 10. scaffold ─────────────────────────────────────────────────
  {
    name: "scaffold",
    description:
      "Generate a complete resource from a natural language description. Checks what workspace tools exist, identifies missing integrations, generates custom function code if needed, and produces a ready-to-create config. Returns a plan, generated configs, and list of missing credentials.",
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description:
            'What you want to build, e.g. "Telegram bot that answers customer questions from Notion docs" or "Function that processes Stripe webhooks and caches results"',
        },
        type: {
          type: "string",
          enum: ["bot", "workflow", "function", "endpoint", "webhook"],
          description:
            "Primary resource type to generate. Defaults to auto-detect from description.",
        },
      },
      required: ["description"],
    },
  },
];
