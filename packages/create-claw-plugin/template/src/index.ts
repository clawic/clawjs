import {
  configSchema,
  type __APP_PASCAL__PluginConfig,
  validatePluginConfig,
} from "./config.js";
import {
  afterAssistantReply,
  beforeSessionStart,
  type HookContext,
} from "./hooks.js";
import { runTriageSkill, type TriageInput } from "./skills/triage.js";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  compatibility: {
    runtimeAdapters: string[];
    requiresWorkspace: boolean;
    supportLevel: string;
  };
}

export const pluginManifest: PluginManifest = {
  id: "__APP_SLUG__",
  name: "__APP_TITLE__",
  version: "0.1.0",
  description: "Distributed plugin scaffold for __APP_TITLE__.",
  compatibility: {
    runtimeAdapters: ["openclaw", "demo"],
    requiresWorkspace: false,
    supportLevel: "experimental",
  },
};

export { configSchema, validatePluginConfig, beforeSessionStart, afterAssistantReply, runTriageSkill };
export type PluginConfig = __APP_PASCAL__PluginConfig;

export async function activatePlugin(rawConfig: unknown) {
  const config = validatePluginConfig(rawConfig);

  return {
    manifest: pluginManifest,
    config,
    hooks: {
      beforeSessionStart: (context: HookContext) => beforeSessionStart(config, context),
      afterAssistantReply: (context: HookContext) => afterAssistantReply(config, context),
    },
    skills: {
      triage: (input: TriageInput) => runTriageSkill(config, input),
    },
  };
}
