import type { CapabilityState, ClawManifest, OrchestrationReadiness, WorkspaceConfig } from "./types.ts";

export function createManifest(config: WorkspaceConfig, runtimeAdapter: string, templatePackPath?: string): ClawManifest {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    appId: config.appId,
    workspaceId: config.workspaceId,
    agentId: config.agentId,
    runtimeAdapter,
    rootDir: config.rootDir,
    createdAt: now,
    updatedAt: now,
    ...(templatePackPath ? { templatePackPath } : {}),
    ...(config.projectId ? { projectId: config.projectId } : {}),
    ...(config.logicalAgentId ? { logicalAgentId: config.logicalAgentId } : {}),
    ...(config.runtimeAgentId ? { runtimeAgentId: config.runtimeAgentId } : {}),
    ...(typeof config.materializationVersion === "number" ? { materializationVersion: config.materializationVersion } : {}),
  };
}

export function maskCredential(secret: string | null | undefined, visibleTail = 4): string | null {
  const trimmed = secret?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= visibleTail) return "*".repeat(trimmed.length);
  return `${"*".repeat(Math.max(4, trimmed.length - visibleTail))}${trimmed.slice(-visibleTail)}`;
}

export function summarizeReadiness(states: Partial<Record<string, CapabilityState>>): OrchestrationReadiness {
  const runtimeReady = states.runtime?.status === "ready";
  const workspaceReady = states.workspace?.status === "ready";
  const authReady = states.auth?.status === "ready";
  const modelReady = states.models?.status === "ready";
  const fileSyncReady = states.file_sync?.status === "ready";
  const recommendedActions = Object.values(states)
    .flatMap((state) => state?.recommendedActions ?? []);

  const overallStatus = [runtimeReady, workspaceReady, authReady, modelReady, fileSyncReady].every(Boolean)
    ? "ready"
    : Object.values(states).some((state) => state?.status === "error")
      ? "error"
      : "degraded";

  return {
    overallStatus,
    runtimeReady,
    workspaceReady,
    authReady,
    modelReady,
    fileSyncReady,
    recommendedActions,
  };
}
