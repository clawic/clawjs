import type { __APP_PASCAL__PluginConfig } from "./config.js";

export interface HookContext {
  sessionId: string;
  message: string;
}

export interface HookResult {
  ok: true;
  event: string;
  tags: string[];
  note: string;
}

export async function beforeSessionStart(
  config: __APP_PASCAL__PluginConfig,
  context: HookContext,
): Promise<HookResult> {
  return {
    ok: true,
    event: "beforeSessionStart",
    tags: [config.provider, config.projectKey],
    note: `Prepared session ${context.sessionId} for ${config.provider}.`,
  };
}

export async function afterAssistantReply(
  config: __APP_PASCAL__PluginConfig,
  context: HookContext,
): Promise<HookResult> {
  const mode = config.enableAutoTriage ? "auto-triage enabled" : "manual triage mode";
  return {
    ok: true,
    event: "afterAssistantReply",
    tags: [...config.defaultLabels, config.projectKey],
    note: `Processed reply for session ${context.sessionId} with ${mode}.`,
  };
}
