/**
 * Aerostack MCP Worker
 * Implements MCP protocol over HTTP for building bots, workflows, AI endpoints, and functions.
 * Receives AEROSTACK_API_KEY via X-Mcp-Secret-AEROSTACK-API-KEY header from the workspace gateway.
 *
 * Design: 10 tools, heavy docs in guide responses. No schema bloat.
 */

import { TOOLS } from "./tools";
import { GUIDES } from "./guides";

const SERVER_NAME = "mcp-aerostack";
const SERVER_VERSION = "1.0.0";

// ── JSON-RPC helpers ─────────────────────────────────────────────

function rpcOk(id: number | string, result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "Content-Type": "application/json" },
  });
}

function rpcErr(id: number | string | null, code: number, message: string) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function textResult(text: string) {
  return { content: [{ type: "text", text }] };
}

function jsonResult(data: unknown) {
  return textResult(JSON.stringify(data, null, 2));
}

// ── API client ───────────────────────────────────────────────────

class AerostackAPI {
  constructor(
    private apiKey: string,
    private baseUrl: string
  ) {}

  async request(method: string, path: string, body?: unknown) {
    // Account keys (ak_*) use X-API-Key header; JWTs use Authorization: Bearer
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey.startsWith("ak_")) {
      headers["X-API-Key"] = this.apiKey;
    } else {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }
}

// ── Tool implementations ─────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, unknown>,
  api: AerostackAPI
): Promise<unknown> {
  switch (name) {
    // ── guide ────────────────────────────────────────────────────
    case "guide": {
      const topic = (args.topic as string) ?? "start";

      // Live credentials check
      if (topic === "credentials") {
        const [bots, workspaces] = await Promise.all([
          api.request("GET", "/api/bots"),
          api.request("GET", "/api/community/mcp/workspaces"),
        ]);

        const botList = Array.isArray((bots.data as any)?.bots)
          ? (bots.data as any).bots
          : [];
        const wsList = Array.isArray((workspaces.data as any)?.workspaces)
          ? (workspaces.data as any).workspaces
          : [];

        const platforms = botList.map(
          (b: any) =>
            `${b.has_platform_config ? "✅" : "❌"} ${b.platform}: ${b.name} (${b.status})`
        );
        const ws = wsList.map(
          (w: any) => `- ${w.name}: ${w.mcp_count ?? 0} MCP servers`
        );

        return textResult(
          [
            "# Your Aerostack Status\n",
            "## Bots",
            platforms.length ? platforms.join("\n") : "No bots created yet.",
            "\n## Workspaces",
            ws.length ? ws.join("\n") : "No workspaces yet.",
            '\n→ Use guide("telegram_setup") etc. for platform credential setup.',
          ].join("\n")
        );
      }

      // Static guide lookup
      const guide = GUIDES[topic];
      if (guide) return textResult(guide);

      // Fuzzy match for node: prefix
      if (topic.startsWith("node:")) {
        const nodeType = topic.replace("node:", "");
        const key = `node:${nodeType}`;
        if (GUIDES[key]) return textResult(GUIDES[key]);
        return textResult(
          `Unknown node type "${nodeType}". Available: trigger, llm_call, logic, mcp_tool, send_message, action, loop, code_block, auth_gate, schedule_message, delegate_to_bot, send_proactive, error_handler, parallel`
        );
      }

      return textResult(
        `Unknown topic "${topic}". Available: start, telegram_setup, discord_setup, whatsapp_setup, slack_setup, llm_keys, workspace_tools, functions, credentials, node:<type>`
      );
    }

    // ── list ─────────────────────────────────────────────────────
    case "list": {
      const type = args.type as string;
      const routeMap: Record<string, string> = {
        bots: "/api/bots",
        workflows: "/api/workflows",
        endpoints: "/api/agent-endpoints",
        webhooks: "/api/smart-webhooks",
        functions: "/api/community/functions/my",
        workspace_tools: "/api/community/mcp/workspaces",
        templates: "/api/community/templates",
      };

      const path = routeMap[type];
      if (!path) return textResult(`Unknown type "${type}". Use: ${Object.keys(routeMap).join(", ")}`);

      let url = path;
      if (type === "templates" && args.template_type) {
        url += `?type=${args.template_type}`;
      }

      const res = await api.request("GET", url);
      if (!res.ok) return textResult(`Error ${res.status}: ${JSON.stringify(res.data)}`);
      return jsonResult(res.data);
    }

    // ── get ──────────────────────────────────────────────────────
    case "get": {
      const type = args.type as string;
      const id = args.id as string;
      const routeMap: Record<string, string> = {
        bot: "/api/bots",
        workflow: "/api/workflows",
        endpoint: "/api/agent-endpoints",
        webhook: "/api/smart-webhooks",
        function: "/api/community/functions",
        template: "/api/community/templates",
      };

      const base = routeMap[type];
      if (!base) return textResult(`Unknown type "${type}".`);

      const res = await api.request("GET", `${base}/${id}`);
      if (!res.ok) return textResult(`Error ${res.status}: ${JSON.stringify(res.data)}`);
      return jsonResult(res.data);
    }

    // ── create ───────────────────────────────────────────────────
    case "create": {
      const type = args.type as string;
      const config = (args.config ?? {}) as Record<string, unknown>;

      const routeMap: Record<string, string> = {
        bot: "/api/bots",
        workflow: "/api/workflows",
        endpoint: "/api/agent-endpoints",
        webhook: "/api/smart-webhooks",
        function: "/api/community/functions",
      };

      const base = routeMap[type];
      if (!base) return textResult(`Unknown type "${type}".`);

      const res = await api.request("POST", base, config);
      if (!res.ok) return textResult(`Create failed (${res.status}): ${JSON.stringify(res.data)}`);

      // Auto-deploy functions after creation
      if (type === "function") {
        const fnId = (res.data as any)?.id ?? (res.data as any)?.function?.id;
        if (fnId) {
          const deploy = await api.request("POST", `/api/community/functions/${fnId}/deploy`);
          return jsonResult({
            created: res.data,
            deployed: deploy.ok,
            deploy_result: deploy.data,
          });
        }
      }

      return jsonResult(res.data);
    }

    // ── update ───────────────────────────────────────────────────
    case "update": {
      const type = args.type as string;
      const id = args.id as string;
      const config = (args.config ?? {}) as Record<string, unknown>;

      if (type === "workspace_secret") {
        // id = workspace ID, config = { key, value }
        const res = await api.request(
          "POST",
          `/api/community/mcp/workspaces/${id}/secrets`,
          config
        );
        if (!res.ok) return textResult(`Secret update failed (${res.status}): ${JSON.stringify(res.data)}`);
        return jsonResult({ success: true, message: "Secret stored (encrypted)" });
      }

      const routeMap: Record<string, { path: string; method: string }> = {
        bot: { path: "/api/bots", method: "PATCH" },
        workflow: { path: "/api/workflows", method: "PATCH" },
        endpoint: { path: "/api/agent-endpoints", method: "PATCH" },
        webhook: { path: "/api/webhooks", method: "PATCH" },
        function: { path: "/api/community/functions", method: "PATCH" },
      };

      const route = routeMap[type];
      if (!route) return textResult(`Unknown type "${type}".`);

      const res = await api.request(route.method, `${route.path}/${id}`, config);
      if (!res.ok) return textResult(`Update failed (${res.status}): ${JSON.stringify(res.data)}`);

      // Auto-redeploy functions after update
      if (type === "function") {
        const deploy = await api.request("POST", `/api/community/functions/${id}/deploy`);
        return jsonResult({
          updated: res.data,
          redeployed: deploy.ok,
        });
      }

      return jsonResult(res.data);
    }

    // ── delete ───────────────────────────────────────────────────
    case "delete": {
      const type = args.type as string;
      const id = args.id as string;

      const routeMap: Record<string, string> = {
        bot: "/api/bots",
        workflow: "/api/workflows",
        endpoint: "/api/agent-endpoints",
        webhook: "/api/smart-webhooks",
        function: "/api/community/functions",
      };

      const base = routeMap[type];
      if (!base) return textResult(`Unknown type "${type}".`);

      const res = await api.request("DELETE", `${base}/${id}`);
      if (!res.ok) return textResult(`Delete failed (${res.status}): ${JSON.stringify(res.data)}`);
      return jsonResult({ deleted: true, type, id });
    }

    // ── validate ─────────────────────────────────────────────────
    case "validate": {
      const type = args.type as string;
      const config = (args.config ?? {}) as Record<string, unknown>;
      const errors: string[] = [];
      const warnings: string[] = [];

      if (type === "workflow") {
        const nodes = (config.nodes ?? config.nodes_json ?? []) as any[];
        const edges = (config.edges ?? config.edges_json ?? []) as any[];

        if (!Array.isArray(nodes) || nodes.length === 0) {
          errors.push("Workflow must have at least one node");
        }
        if (nodes.length > 50) {
          errors.push("Workflow exceeds 50-node limit");
        }

        // Check for trigger node
        const hasTrigger = nodes.some((n: any) => n.type === "trigger");
        if (!hasTrigger) errors.push("Workflow must have a trigger node");

        // Check for disconnected nodes
        const connectedIds = new Set<string>();
        for (const e of edges) {
          connectedIds.add(e.source);
          connectedIds.add(e.target);
        }
        for (const n of nodes) {
          if (!connectedIds.has(n.id) && nodes.length > 1) {
            warnings.push(`Node "${n.id}" (${n.type}) is disconnected`);
          }
        }

        // Check required fields per node type
        const requiredFields: Record<string, string[]> = {
          llm_call: ["prompt"],
          mcp_tool: ["toolName", "arguments"],
          send_message: [],
          action: ["action_type"],
          loop: ["mode"],
          code_block: ["code"],
          delegate_to_bot: ["target_bot_id"],
        };

        for (const n of nodes) {
          const req = requiredFields[n.type];
          if (req) {
            for (const field of req) {
              if (!n.data?.[field]) {
                errors.push(`Node "${n.id}" (${n.type}): missing required field "${field}"`);
              }
            }
          }
        }

        // Validate edge handles for logic/loop nodes
        for (const n of nodes) {
          if (n.type === "logic") {
            const outEdges = edges.filter((e: any) => e.source === n.id);
            const handles = outEdges.map((e: any) => e.sourceHandle);
            if (n.data?.mode === "if_else") {
              if (!handles.includes("true") && !handles.includes("false")) {
                warnings.push(`Logic node "${n.id}": missing "true"/"false" edge handles`);
              }
            }
          }
          if (n.type === "loop") {
            const outEdges = edges.filter((e: any) => e.source === n.id);
            const handles = outEdges.map((e: any) => e.sourceHandle);
            if (!handles.includes("loop_body")) {
              warnings.push(`Loop node "${n.id}": missing "loop_body" edge`);
            }
            if (!handles.includes("loop_done")) {
              warnings.push(`Loop node "${n.id}": missing "loop_done" edge`);
            }
          }
        }
      }

      if (type === "bot") {
        if (!config.platform) errors.push("Bot must have a platform (telegram, discord, whatsapp, slack)");
        if (!config.platform_config) errors.push("Bot must have platform_config with credentials");
        if (!config.name) errors.push("Bot must have a name");
      }

      if (type === "function") {
        if (!config.code && !config.source_code) errors.push("Function must have code");
        if (!config.name) errors.push("Function must have a name");
        const code = (config.code ?? config.source_code ?? "") as string;
        if (code.includes("eval(") || code.includes("new Function(")) {
          errors.push("Function code must not use eval() or new Function() — security restriction");
        }
      }

      return jsonResult({
        valid: errors.length === 0,
        errors,
        warnings,
      });
    }

    // ── test ─────────────────────────────────────────────────────
    case "test": {
      const type = args.type as string;
      const id = args.id as string;
      const input = (args.input ?? "") as string;

      if (type === "workflow") {
        const res = await api.request("POST", `/api/workflows/${id}/test-run`, {
          message: input,
        });
        if (!res.ok) return textResult(`Test failed (${res.status}): ${JSON.stringify(res.data)}`);
        return jsonResult(res.data);
      }

      if (type === "bot") {
        const res = await api.request("POST", `/api/bots/${id}/test`, {
          message: input,
        });
        if (!res.ok) return textResult(`Test failed (${res.status}): ${JSON.stringify(res.data)}`);
        return jsonResult(res.data);
      }

      if (type === "function") {
        // No direct test endpoint — ensure deployed, then call via MCP registry
        const deployRes = await api.request("POST", `/api/community/functions/${id}/deploy`);
        if (!deployRes.ok) {
          return textResult(`Deploy before test failed (${deployRes.status}): ${JSON.stringify(deployRes.data)}`);
        }

        // Get function slug for call_function
        const fnRes = await api.request("GET", `/api/community/functions/${id}`);
        const slug = (fnRes.data as any)?.function?.slug ?? (fnRes.data as any)?.slug;
        if (!slug) return textResult("Could not determine function slug for testing");

        let parsedArgs: unknown;
        try {
          parsedArgs = JSON.parse(input);
        } catch {
          parsedArgs = { input };
        }

        // Call via MCP registry JSON-RPC
        const callRes = await api.request("POST", "/api/mcp/aerostack/registry", {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "call_function", arguments: { slug, args: parsedArgs } },
        });
        if (!callRes.ok) return textResult(`Function call failed (${callRes.status}): ${JSON.stringify(callRes.data)}`);
        return jsonResult(callRes.data);
      }

      if (type === "endpoint") {
        const res = await api.request("POST", `/api/agent-endpoints/${id}/test`, {
          input,
        });
        if (!res.ok) return textResult(`Test failed (${res.status}): ${JSON.stringify(res.data)}`);
        return jsonResult(res.data);
      }

      return textResult(`Unknown type "${type}".`);
    }

    // ── deploy ───────────────────────────────────────────────────
    case "deploy": {
      const type = args.type as string;
      const id = args.id as string;

      if (type === "bot") {
        const res = await api.request("POST", `/api/bots/${id}/go-live`);
        if (!res.ok) return textResult(`Deploy failed (${res.status}): ${JSON.stringify(res.data)}`);
        return jsonResult({ deployed: true, ...((res.data as any) ?? {}) });
      }

      if (type === "workflow") {
        const res = await api.request("PATCH", `/api/workflows/${id}`, {
          status: "published",
        });
        if (!res.ok) return textResult(`Deploy failed (${res.status}): ${JSON.stringify(res.data)}`);
        return jsonResult({ deployed: true, status: "published" });
      }

      if (type === "function") {
        const res = await api.request("POST", `/api/community/functions/${id}/deploy`);
        if (!res.ok) return textResult(`Deploy failed (${res.status}): ${JSON.stringify(res.data)}`);
        return jsonResult(res.data);
      }

      if (type === "endpoint") {
        const res = await api.request("PATCH", `/api/agent-endpoints/${id}`, {
          status: "active",
        });
        if (!res.ok) return textResult(`Deploy failed (${res.status}): ${JSON.stringify(res.data)}`);
        return jsonResult({ deployed: true, status: "active" });
      }

      return textResult(`Unknown type "${type}".`);
    }

    // ── scaffold ─────────────────────────────────────────────────
    case "scaffold": {
      const description = args.description as string;
      const requestedType = args.type as string | undefined;

      // Detect platform from description
      const desc = description.toLowerCase();
      const platform =
        desc.includes("telegram") ? "telegram" :
        desc.includes("discord") ? "discord" :
        desc.includes("whatsapp") ? "whatsapp" :
        desc.includes("slack") ? "slack" :
        null;

      // Detect resource type
      const type =
        requestedType ??
        (platform ? "bot" :
        desc.includes("webhook") ? "webhook" :
        desc.includes("endpoint") || desc.includes("api") ? "endpoint" :
        desc.includes("function") ? "function" :
        "workflow");

      // Check available workspace tools
      const wsRes = await api.request("GET", "/api/community/mcp/workspaces");
      const workspaces = Array.isArray((wsRes.data as any)?.workspaces)
        ? (wsRes.data as any).workspaces
        : [];

      // Detect integrations needed from description
      const integrationKeywords: Record<string, string[]> = {
        notion: ["notion", "wiki", "docs", "knowledge base"],
        github: ["github", "repo", "pull request", "pr", "issue"],
        slack: ["slack", "channel", "message"],
        stripe: ["stripe", "payment", "billing", "refund", "invoice"],
        google_calendar: ["calendar", "meeting", "schedule", "event"],
        discord: ["discord", "server"],
        jira: ["jira", "ticket", "sprint"],
        linear: ["linear", "issue"],
        gmail: ["gmail", "email"],
      };

      const neededIntegrations: string[] = [];
      for (const [integration, keywords] of Object.entries(integrationKeywords)) {
        if (keywords.some((k) => desc.includes(k))) {
          neededIntegrations.push(integration);
        }
      }

      // Detect runtime APIs needed
      const runtimeKeywords: Record<string, string[]> = {
        cache: ["cache", "store", "remember", "ttl"],
        database: ["database", "sql", "query", "table", "db"],
        storage: ["file", "upload", "image", "pdf", "storage"],
        ai: ["ai", "llm", "classify", "summarize", "extract", "embed", "gpt", "claude"],
        queue: ["queue", "async", "background", "batch", "job"],
        vector_search: ["vector", "semantic", "search", "rag", "similarity", "embedding"],
      };

      const runtimeApis: string[] = [];
      for (const [api, keywords] of Object.entries(runtimeKeywords)) {
        if (keywords.some((k) => desc.includes(k))) {
          runtimeApis.push(api);
        }
      }

      // Build plan
      const plan: string[] = [`# Scaffold Plan\n`, `**Description:** ${description}`, `**Type:** ${type}`];

      if (platform) plan.push(`**Platform:** ${platform}`);
      if (neededIntegrations.length) plan.push(`**Integrations:** ${neededIntegrations.join(", ")}`);
      if (runtimeApis.length) plan.push(`**Runtime APIs:** ${runtimeApis.join(", ")}`);

      plan.push("\n## Next Steps");
      plan.push("1. Review this plan");

      const missingCredentials: Array<{ type: string; guide: string }> = [];

      if (platform) {
        missingCredentials.push({ type: `${platform}_token`, guide: `${platform}_setup` });
        plan.push(`2. Set up ${platform} credentials → use guide("${platform}_setup")`);
      }

      if (neededIntegrations.length) {
        plan.push(`3. Verify workspace has these MCP servers: ${neededIntegrations.join(", ")}`);
        plan.push('   → Use list({ type: "workspace_tools" }) to check');
      }

      plan.push(`4. Use create({ type: "${type}", config: ... }) with the config below`);
      plan.push('5. Use test() to verify');
      plan.push('6. Use deploy() to go live');

      // Generate a starter workflow
      const nodes: any[] = [{ id: "t1", type: "trigger", data: {} }];
      const edges: any[] = [];
      let lastNodeId = "t1";
      let nodeCounter = 1;

      // Add MCP tool nodes for each integration
      for (const integration of neededIntegrations) {
        const nodeId = `mcp${nodeCounter++}`;
        nodes.push({
          id: nodeId,
          type: "mcp_tool",
          data: {
            toolName: `${integration}_search`,
            arguments: `{ "query": "{{user_message}}" }`,
            outputVariable: `${integration}_result`,
          },
        });
        edges.push({ id: `e_${lastNodeId}_${nodeId}`, source: lastNodeId, target: nodeId });
        lastNodeId = nodeId;
      }

      // Add LLM call if AI is needed or it's a bot
      if (runtimeApis.includes("ai") || type === "bot") {
        const nodeId = `llm${nodeCounter++}`;
        const contextVars = neededIntegrations.map((i) => `{{${i}_result}}`).join("\n");
        nodes.push({
          id: nodeId,
          type: "llm_call",
          data: {
            prompt: contextVars
              ? `Context:\n${contextVars}\n\nUser question: {{user_message}}\n\nProvide a helpful response based on the context above.`
              : "User: {{user_message}}\n\nRespond helpfully.",
            outputVariable: "ai_response",
          },
        });
        edges.push({ id: `e_${lastNodeId}_${nodeId}`, source: lastNodeId, target: nodeId });
        lastNodeId = nodeId;
      }

      // Add send_message for bots
      if (type === "bot") {
        const nodeId = `msg${nodeCounter++}`;
        nodes.push({
          id: nodeId,
          type: "send_message",
          data: { message: "{{ai_response}}" },
        });
        edges.push({ id: `e_${lastNodeId}_${nodeId}`, source: lastNodeId, target: nodeId });
      }

      const result: Record<string, unknown> = {
        plan: plan.join("\n"),
        missing_credentials: missingCredentials,
        workflow: { nodes, edges },
        available_workspaces: workspaces.map((w: any) => ({
          id: w.id,
          name: w.name,
          mcp_count: w.mcp_count,
        })),
      };

      if (type === "bot" && platform) {
        result.bot_config = {
          name: `${description.slice(0, 40)} Bot`,
          platform,
          platform_config: {},
          llm_provider: "azure",
          llm_model: "gpt-4o",
          workflow_enabled: true,
        };
      }

      if (runtimeApis.length) {
        result.runtime_apis_needed = runtimeApis;
        result.function_template = [
          "export default {",
          "  async fetch(request: Request, env: any): Promise<Response> {",
          "    const body = await request.json();",
          "",
          "    // Available runtime APIs:",
          ...runtimeApis.map((a) => `    // - env.${a.toUpperCase()}`),
          "",
          "    // Your logic here",
          "",
          '    return Response.json({ success: true, data: { result: "..." } });',
          "  }",
          "};",
        ].join("\n");
      }

      return jsonResult(result);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Worker fetch handler ─────────────────────────────────────────

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Parse JSON-RPC
    let body: {
      jsonrpc: string;
      id: number | string;
      method: string;
      params?: Record<string, unknown>;
    };
    try {
      body = await request.json();
    } catch {
      return rpcErr(null, -32700, "Parse error");
    }

    const { id, method, params } = body;

    // ── initialize ───────────────────────────────────────────────
    if (method === "initialize") {
      return rpcOk(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
    }

    // ── tools/list ───────────────────────────────────────────────
    if (method === "tools/list") {
      return rpcOk(id, { tools: TOOLS });
    }

    // ── tools/call ───────────────────────────────────────────────
    if (method === "tools/call") {
      const toolName = params?.name as string;
      const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

      // Read API key from workspace-injected header
      const apiKey = request.headers.get("X-Mcp-Secret-AEROSTACK-API-KEY");
      if (!apiKey) {
        return rpcErr(
          id,
          -32001,
          "Missing AEROSTACK_API_KEY secret — add it to your workspace secrets"
        );
      }

      // API URL: default to production, allow override
      const apiUrl =
        request.headers.get("X-Mcp-Secret-AEROSTACK-API-URL") ??
        "https://aerostack-api-prod.nyburs.workers.dev";

      const api = new AerostackAPI(apiKey, apiUrl);

      try {
        const result = await callTool(toolName, toolArgs, api);
        // result is already in { content: [...] } format
        if (
          typeof result === "object" &&
          result !== null &&
          "content" in result
        ) {
          return rpcOk(id, result);
        }
        return rpcOk(id, textResult(JSON.stringify(result)));
      } catch (e: any) {
        return rpcErr(id, -32603, e.message ?? "Tool execution failed");
      }
    }

    return rpcErr(id, -32601, `Method not found: ${method}`);
  },
};
