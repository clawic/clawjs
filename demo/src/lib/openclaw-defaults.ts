export const DEFAULT_CLAWJS_OPENCLAW_AGENT_ID = "clawjs-demo";

export function defaultClawJsWorkspacePath(
  agentId: string = DEFAULT_CLAWJS_OPENCLAW_AGENT_ID,
): string {
  return `~/.openclaw/workspaces/${agentId}`;
}

export function defaultClawJsWorkspaceConfigPath(
  agentId: string = DEFAULT_CLAWJS_OPENCLAW_AGENT_ID,
): string {
  return `${defaultClawJsWorkspacePath(agentId)}/config`;
}

export function defaultClawJsWorkspaceDataPath(
  agentId: string = DEFAULT_CLAWJS_OPENCLAW_AGENT_ID,
): string {
  return `${defaultClawJsWorkspacePath(agentId)}/data`;
}

export function defaultClawJsTranscriptionDbPath(
  agentId: string = DEFAULT_CLAWJS_OPENCLAW_AGENT_ID,
): string {
  return `${defaultClawJsWorkspacePath(agentId)}/transcriptions.sqlite`;
}

export function defaultClawJsActivityStoreDbPath(
  agentId: string = DEFAULT_CLAWJS_OPENCLAW_AGENT_ID,
): string {
  return `${defaultClawJsWorkspaceDataPath(agentId)}/activity-store.sqlite`;
}

export function defaultClawJsLocalSettingsPath(
  agentId: string = DEFAULT_CLAWJS_OPENCLAW_AGENT_ID,
): string {
  return `${defaultClawJsWorkspacePath(agentId)}/settings.json`;
}
