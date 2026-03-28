import type { DefaultModelRef, ProviderAuthSummary } from "@clawjs/core";

import type { OpenClawRuntimeContext } from "./openclaw-context.ts";

export interface OpenClawSetupStatus {
  agentConfigured: boolean;
  modelConfigured: boolean;
  authConfigured: boolean;
  ready: boolean;
  needsSetup: boolean;
  needsAuth: boolean;
  defaultModel: string | null;
  defaultModelRef: DefaultModelRef | null;
  provider: string | null;
}

export interface OpenClawSetupReader {
  runtime: {
    context: () => OpenClawRuntimeContext | null;
  };
  models: {
    getDefault: () => Promise<DefaultModelRef | null>;
  };
  auth: {
    status: () => Promise<Record<string, ProviderAuthSummary>>;
  };
}

export interface DeriveOpenClawSetupStatusInput {
  context: Pick<OpenClawRuntimeContext, "configuredAgent" | "workspaceDir"> | null;
  defaultModel: DefaultModelRef | null;
  providerAuth: Record<string, ProviderAuthSummary>;
}

export function getOpenClawModelProvider(defaultModel: DefaultModelRef | null): string | null {
  const modelId = defaultModel?.modelId?.trim();
  if (!modelId) return null;
  return modelId.includes("/") ? modelId.split("/")[0] || null : modelId;
}

export function hasOpenClawProviderAuth(
  provider: string | null,
  providerAuth: Record<string, ProviderAuthSummary>,
): boolean {
  if (!provider) return false;
  return Object.values(providerAuth).some((summary) => {
    if (!summary.hasAuth) return false;
    return summary.provider === provider
      || provider.startsWith(summary.provider + "-")
      || provider.startsWith(summary.provider + "/");
  });
}

export function deriveOpenClawSetupStatus(input: DeriveOpenClawSetupStatusInput): OpenClawSetupStatus {
  const defaultModelRef = input.defaultModel;
  const defaultModel = defaultModelRef?.modelId ?? null;
  const provider = getOpenClawModelProvider(defaultModelRef);
  const agentConfigured = !!input.context?.configuredAgent;
  const modelConfigured = !!defaultModel;
  const authConfigured = hasOpenClawProviderAuth(provider, input.providerAuth);
  const ready = agentConfigured && modelConfigured && authConfigured;

  return {
    agentConfigured,
    modelConfigured,
    authConfigured,
    ready,
    needsSetup: !agentConfigured,
    needsAuth: agentConfigured && (!modelConfigured || !authConfigured),
    defaultModel,
    defaultModelRef,
    provider,
  };
}

export async function getOpenClawSetupStatus(claw: OpenClawSetupReader): Promise<OpenClawSetupStatus> {
  return deriveOpenClawSetupStatus({
    context: claw.runtime.context(),
    defaultModel: await claw.models.getDefault(),
    providerAuth: await claw.auth.status(),
  });
}
