const ENGINE_ID = "clawjs-context";

function getGlobalState() {
  const globalObject = globalThis;
  if (!globalObject.__clawjsContextEngineState) {
    globalObject.__clawjsContextEngineState = {
      bootstrapCount: 0,
      ingestCount: 0,
      ingestBatchCount: 0,
      assembleCount: 0,
      compactCount: 0,
      prepareSubagentSpawnCount: 0,
      rollbackCount: 0,
      subagentEndedCount: 0,
      disposed: false,
    };
  }
  return globalObject.__clawjsContextEngineState;
}

function resetClawJsContextEngineStateForTests() {
  globalThis.__clawjsContextEngineState = undefined;
  return getGlobalState();
}

function readPluginConfig(api) {
  const pluginConfig = api?.pluginConfig;
  if (pluginConfig && typeof pluginConfig === "object" && !Array.isArray(pluginConfig)) {
    return pluginConfig;
  }
  return {};
}

function createContextEngine(api) {
  const state = getGlobalState();
  const pluginConfig = readPluginConfig(api);

  return {
    info: {
      id: ENGINE_ID,
      name: "ClawJS Context",
      version: "0.1.0",
      ownsCompaction: false,
    },
    async bootstrap() {
      state.bootstrapCount += 1;
      return { bootstrapped: true, importedMessages: 0 };
    },
    async ingest() {
      state.ingestCount += 1;
      return { ingested: true };
    },
    async ingestBatch({ messages = [] }) {
      state.ingestBatchCount += 1;
      return { ingestedCount: Array.isArray(messages) ? messages.length : 0 };
    },
    async afterTurn() {
      return undefined;
    },
    async assemble({ messages = [] }) {
      state.assembleCount += 1;
      return {
        messages,
        estimatedTokens: Array.isArray(messages) ? messages.length * 64 : 0,
        systemPromptAddition: typeof pluginConfig.systemPromptAddition === "string"
          ? pluginConfig.systemPromptAddition
          : undefined,
      };
    },
    async compact() {
      state.compactCount += 1;
      return {
        ok: true,
        compacted: false,
        reason: "clawjs-context pass-through compaction",
      };
    },
    async prepareSubagentSpawn() {
      state.prepareSubagentSpawnCount += 1;
      return {
        rollback() {
          state.rollbackCount += 1;
        },
      };
    },
    async onSubagentEnded() {
      state.subagentEndedCount += 1;
    },
    async dispose() {
      state.disposed = true;
    },
  };
}

const plugin = {
  id: ENGINE_ID,
  name: "ClawJS Context",
  description: "Experimental context engine for ClawJS on OpenClaw.",
  version: "0.1.0",
  kind: "context-engine",
  configSchema: {
    validate(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, errors: ["plugin config must be an object"] };
      }
      return { ok: true, value };
    },
  },
  register(api) {
    api.registerContextEngine(ENGINE_ID, () => createContextEngine(api));
  },
};

export { ENGINE_ID, createContextEngine, getGlobalState as getClawJsContextEngineState, resetClawJsContextEngineStateForTests };
export default plugin;
