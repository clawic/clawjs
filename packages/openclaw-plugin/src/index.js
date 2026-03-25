import {
  configureState,
  getHealthSnapshot,
  inspectSession,
  listEvents,
  markServiceStarted,
  markServiceStopped,
  rememberRegistration,
  recordEvent,
  resetClawJsPluginStateForTests,
} from "./state.js";

const PLUGIN_VERSION = "0.1.0";
const HOOKS = [
  "session_start",
  "session_end",
  "llm_input",
  "llm_output",
  "before_tool_call",
  "after_tool_call",
  "before_prompt_build",
  "before_compaction",
  "after_compaction",
  "subagent_spawning",
  "subagent_spawned",
  "subagent_ended",
  "gateway_start",
  "gateway_stop",
];

function readPluginConfig(api) {
  const pluginConfig = api?.pluginConfig;
  if (pluginConfig && typeof pluginConfig === "object" && !Array.isArray(pluginConfig)) {
    return pluginConfig;
  }
  return {};
}

function readMainConfig(api) {
  try {
    return api.runtime.config.loadConfig();
  } catch {
    return api.config || {};
  }
}

function getPromptInjectionAllowed(api) {
  const config = readMainConfig(api);
  return config?.plugins?.entries?.clawjs?.hooks?.allowPromptInjection !== false;
}

function getContextSelection(api) {
  const config = readMainConfig(api);
  const selectedEngineId = config?.plugins?.slots?.contextEngine || "legacy";
  const configured = !!config?.plugins?.entries?.["clawjs-context"];
  const enabled = config?.plugins?.entries?.["clawjs-context"]?.enabled !== false;
  return {
    configured,
    enabled,
    selected: selectedEngineId === "clawjs-context",
    selectedEngineId,
  };
}

function buildStatusPayload(api) {
  const health = getHealthSnapshot();
  const pluginConfig = readPluginConfig(api);
  return {
    ok: true,
    plugin: {
      id: "clawjs",
      name: "ClawJS",
      version: PLUGIN_VERSION,
      runtimeVersion: api.runtime.version,
    },
    features: {
      observability: pluginConfig?.observability?.enabled !== false,
      promptMutation: !!pluginConfig?.promptMutation?.enabled,
      toolControl: Array.isArray(pluginConfig?.toolControl?.blockedTools) && pluginConfig.toolControl.blockedTools.length > 0,
      subagentControl: !!pluginConfig?.subagentControl?.denySpawn,
    },
    promptInjectionAllowed: getPromptInjectionAllowed(api),
    health,
  };
}

function buildHooksPayload(api) {
  const pluginConfig = readPluginConfig(api);
  const health = getHealthSnapshot();
  return {
    ok: true,
    registeredHooks: health.hooks.registered,
    handledHooks: health.hooks.handled,
    promptMutationEnabled: !!pluginConfig?.promptMutation?.enabled,
    promptInjectionAllowed: getPromptInjectionAllowed(api),
    blockedTools: pluginConfig?.toolControl?.blockedTools || [],
    denySubagentSpawn: !!pluginConfig?.subagentControl?.denySpawn,
  };
}

function buildDoctorPayload(api) {
  const issues = [];
  const pluginConfig = readPluginConfig(api);
  const health = getHealthSnapshot();

  if (!health.service.healthy) {
    issues.push("observability service is not marked healthy");
  }
  if (pluginConfig?.promptMutation?.enabled && !getPromptInjectionAllowed(api)) {
    issues.push("prompt mutation is enabled in plugin config but blocked by OpenClaw hook policy");
  }

  return {
    ok: issues.length === 0,
    issues,
    status: buildStatusPayload(api),
    context: getContextSelection(api),
  };
}

function respondWithJsonText(payload) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(payload, null, 2),
    }],
  };
}

function registerGatewayMethods(api) {
  const methodMap = {
    "clawjs.status": ({ respond }) => {
      respond(true, buildStatusPayload(api));
    },
    "clawjs.events.list": ({ params, respond }) => {
      const limit = typeof params?.limit === "number" ? Math.max(1, Math.min(params.limit, 500)) : 50;
      const items = listEvents({
        kind: typeof params?.kind === "string" ? params.kind : undefined,
        name: typeof params?.name === "string" ? params.name : undefined,
        sessionKey: typeof params?.sessionKey === "string" ? params.sessionKey : undefined,
        runId: typeof params?.runId === "string" ? params.runId : undefined,
      }).slice(-limit);
      respond(true, { ok: true, items, total: items.length });
    },
    "clawjs.sessions.inspect": ({ params, respond }) => {
      const sessionKey = typeof params?.sessionKey === "string" ? params.sessionKey.trim() : "";
      if (!sessionKey) {
        respond(false, { error: "sessionKey required" });
        return;
      }
      const session = inspectSession(sessionKey);
      respond(true, { ok: true, found: !!session, session });
    },
    "clawjs.subagent.run": async ({ params, respond }) => {
      const sessionKey = typeof params?.sessionKey === "string" ? params.sessionKey.trim() : "";
      const message = typeof params?.message === "string" ? params.message.trim() : "";
      if (!sessionKey || !message) {
        respond(false, { error: "sessionKey and message are required" });
        return;
      }
      try {
        const result = await api.runtime.subagent.run({
          sessionKey,
          message,
          extraSystemPrompt: typeof params?.extraSystemPrompt === "string" ? params.extraSystemPrompt : undefined,
          lane: typeof params?.lane === "string" ? params.lane : undefined,
          deliver: typeof params?.deliver === "boolean" ? params.deliver : undefined,
          idempotencyKey: typeof params?.idempotencyKey === "string" ? params.idempotencyKey : undefined,
        });
        respond(true, { ok: true, ...result });
      } catch (error) {
        respond(false, { error: error instanceof Error ? error.message : String(error) });
      }
    },
    "clawjs.subagent.wait": async ({ params, respond }) => {
      const runId = typeof params?.runId === "string" ? params.runId.trim() : "";
      if (!runId) {
        respond(false, { error: "runId required" });
        return;
      }
      try {
        const result = await api.runtime.subagent.waitForRun({
          runId,
          timeoutMs: typeof params?.timeoutMs === "number" ? params.timeoutMs : undefined,
        });
        respond(true, { ok: true, ...result });
      } catch (error) {
        respond(false, { error: error instanceof Error ? error.message : String(error) });
      }
    },
    "clawjs.subagent.messages": async ({ params, respond }) => {
      const sessionKey = typeof params?.sessionKey === "string" ? params.sessionKey.trim() : "";
      if (!sessionKey) {
        respond(false, { error: "sessionKey required" });
        return;
      }
      try {
        const result = await api.runtime.subagent.getSessionMessages({
          sessionKey,
          limit: typeof params?.limit === "number" ? params.limit : undefined,
        });
        respond(true, { ok: true, ...result });
      } catch (error) {
        respond(false, { error: error instanceof Error ? error.message : String(error) });
      }
    },
    "clawjs.hooks.status": ({ respond }) => {
      respond(true, buildHooksPayload(api));
    },
    "clawjs.context.status": ({ respond }) => {
      respond(true, { ok: true, ...getContextSelection(api) });
    },
    "clawjs.doctor": ({ respond }) => {
      respond(true, buildDoctorPayload(api));
    },
  };

  for (const [method, handler] of Object.entries(methodMap)) {
    rememberRegistration("gatewayMethod", method);
    api.registerGatewayMethod(method, handler);
  }
}

function registerCommands(api) {
  const commands = [
    {
      name: "clawjs-status",
      description: "Show ClawJS plugin status",
      handler: () => ({ text: JSON.stringify(buildStatusPayload(api), null, 2) }),
    },
    {
      name: "clawjs-events",
      description: "Show recent ClawJS plugin events",
      handler: () => ({ text: JSON.stringify({ items: listEvents({}).slice(-20) }, null, 2) }),
    },
    {
      name: "clawjs-context",
      description: "Show ClawJS context engine selection",
      handler: () => ({ text: JSON.stringify(getContextSelection(api), null, 2) }),
    },
  ];

  for (const command of commands) {
    rememberRegistration("command", command.name);
    api.registerCommand(command);
  }
}

function registerTools(api) {
  const tools = [
    {
      name: "clawjs_status",
      description: "Return ClawJS plugin bridge status.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      async execute() {
        return respondWithJsonText(buildStatusPayload(api));
      },
    },
    {
      name: "clawjs_events",
      description: "Return recent structured events captured by the ClawJS plugin.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100 },
          kind: { type: "string" },
        },
      },
      async execute(_toolCallId, params = {}) {
        const items = listEvents({
          kind: typeof params.kind === "string" ? params.kind : undefined,
        }).slice(-(typeof params.limit === "number" ? params.limit : 20));
        return respondWithJsonText({ items });
      },
    },
    {
      name: "clawjs_subagent_run",
      description: "Start a subagent run through the ClawJS bridge.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          sessionKey: { type: "string" },
          message: { type: "string" },
        },
        required: ["sessionKey", "message"],
      },
      async execute(_toolCallId, params = {}) {
        const result = await api.runtime.subagent.run({
          sessionKey: params.sessionKey,
          message: params.message,
        });
        return respondWithJsonText(result);
      },
    },
    {
      name: "clawjs_session_inspect",
      description: "Inspect the current or provided session captured by the ClawJS plugin.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          sessionKey: { type: "string" },
        },
      },
      async execute(_toolCallId, params = {}) {
        const session = inspectSession(params.sessionKey);
        return respondWithJsonText({ found: !!session, session });
      },
    },
  ];

  for (const tool of tools) {
    rememberRegistration("tool", tool.name);
    api.registerTool(tool, { optional: true });
  }
}

function registerHooks(api) {
  const pluginConfig = readPluginConfig(api);

  for (const hookName of HOOKS) {
    rememberRegistration("hook", hookName);

    if (hookName === "before_prompt_build") {
      api.on(hookName, (event, ctx) => {
        recordEvent("context", hookName, event, ctx);
        if (pluginConfig?.promptMutation?.enabled && typeof pluginConfig?.promptMutation?.prependSystemContext === "string") {
          return {
            prependSystemContext: pluginConfig.promptMutation.prependSystemContext,
          };
        }
        return undefined;
      });
      continue;
    }

    if (hookName === "before_tool_call") {
      api.on(hookName, (event, ctx) => {
        recordEvent("tool", hookName, event, ctx);
        const blockedTools = Array.isArray(pluginConfig?.toolControl?.blockedTools)
          ? pluginConfig.toolControl.blockedTools
          : [];
        if (blockedTools.includes(event.toolName)) {
          return {
            block: true,
            blockReason: `blocked by clawjs plugin config: ${event.toolName}`,
          };
        }
        return undefined;
      });
      continue;
    }

    if (hookName === "subagent_spawning") {
      api.on(hookName, (event, ctx) => {
        recordEvent("subagent", hookName, event, ctx);
        if (pluginConfig?.subagentControl?.denySpawn) {
          return {
            status: "error",
            error: "subagent spawning blocked by clawjs plugin config",
          };
        }
        return {
          status: "ok",
        };
      });
      continue;
    }

    const kind = hookName === "llm_input" || hookName === "llm_output"
      ? "llm"
      : hookName.startsWith("subagent")
        ? "subagent"
        : hookName.startsWith("gateway")
          ? "gateway"
          : hookName.includes("compaction") || hookName.includes("prompt")
            ? "context"
            : hookName.includes("tool")
              ? "tool"
              : "session";

    api.on(hookName, (event, ctx) => {
      recordEvent(kind, hookName, event, ctx);
      return undefined;
    });
  }
}

const clawJsPlugin = {
  id: "clawjs",
  name: "ClawJS",
  description: "Bridge plugin that exposes structured OpenClaw runtime capabilities to ClawJS.",
  version: PLUGIN_VERSION,
  configSchema: {
    validate(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, errors: ["plugin config must be an object"] };
      }
      return { ok: true, value };
    },
  },
  register(api) {
    const pluginConfig = readPluginConfig(api);
    configureState({
      maxEvents: pluginConfig?.observability?.bufferSize,
      maxSessionMessages: pluginConfig?.observability?.maxSessionMessages,
    });

    api.registerService({
      id: "clawjs-observability",
      start() {
        markServiceStarted();
      },
      stop() {
        markServiceStopped();
      },
    });

    registerGatewayMethods(api);
    registerCommands(api);
    registerTools(api);
    registerHooks(api);
  },
};

export { PLUGIN_VERSION, HOOKS, resetClawJsPluginStateForTests };
export default clawJsPlugin;
