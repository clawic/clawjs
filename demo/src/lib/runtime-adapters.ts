/**
 * Generic runtime adapter status for the demo settings UI.
 * Uses the SDK's adapter registry to probe all available runtimes.
 */
import {
  NodeProcessHost,
  listRuntimeAdapters,
  getRuntimeAdapter,
  type RuntimeAdapterId,
  type RuntimeAdapterStability,
  type RuntimeAdapterSupportLevel,
} from "@clawjs/node";

export interface AdapterCapability {
  key: string;
  supported: boolean;
  status: string;
  strategy: string;
}

export interface AdapterProviderInfo {
  id: string;
  label: string;
}

export interface AdapterChannelInfo {
  id: string;
  label: string;
  kind: string;
}

export interface AdapterStatusSummary {
  id: RuntimeAdapterId;
  runtimeName: string;
  stability: RuntimeAdapterStability;
  supportLevel: RuntimeAdapterSupportLevel;
  cliAvailable: boolean;
  version: string | null;
  recommended?: boolean;
  capabilities: AdapterCapability[];
  providers: AdapterProviderInfo[];
  channels: AdapterChannelInfo[];
  workspaceFiles: string[];
  hasScheduler: boolean;
  hasMemory: boolean;
  hasSandbox: boolean;
  hasGateway: boolean;
}

const runner = new NodeProcessHost();

export function getVisibleAdapters() {
  return listRuntimeAdapters().filter((a) => a.supportLevel !== "demo");
}

export async function getAdapterStatus(adapterId: RuntimeAdapterId): Promise<AdapterStatusSummary> {
  const adapter = getRuntimeAdapter(adapterId);
  const base = {
    id: adapter.id,
    runtimeName: adapter.runtimeName,
    stability: adapter.stability,
    supportLevel: adapter.supportLevel,
    recommended: adapter.recommended,
    workspaceFiles: adapter.workspaceFiles.filter((f) => f.visibleToUser).map((f) => f.key),
  };

  try {
    const status = await adapter.getStatus(runner, { adapter: adapterId });
    const capMap = status.capabilityMap ?? {};
    const capabilities: AdapterCapability[] = Object.entries(capMap)
      .filter(([, v]) => v.supported)
      .map(([key, v]) => ({ key, supported: v.supported, status: v.status, strategy: v.strategy }));

    let providers: AdapterProviderInfo[] = [];
    let channels: AdapterChannelInfo[] = [];
    if (status.cliAvailable) {
      try {
        const provList = await adapter.listProviders(runner, { adapter: adapterId });
        providers = provList.map((p) => ({ id: p.id, label: p.label }));
      } catch { /* best effort */ }
      try {
        const chanList = await adapter.listChannels(runner, { adapter: adapterId });
        channels = chanList.map((c) => ({ id: c.id, label: c.label, kind: c.kind }));
      } catch { /* best effort */ }
    }

    return {
      ...base,
      cliAvailable: status.cliAvailable,
      version: status.version,
      capabilities,
      providers,
      channels,
      hasScheduler: !!capMap.scheduler?.supported,
      hasMemory: !!capMap.memory?.supported,
      hasSandbox: !!capMap.sandbox?.supported,
      hasGateway: !!capMap.conversation_gateway?.supported,
    };
  } catch {
    return {
      ...base,
      cliAvailable: false,
      version: null,
      capabilities: [],
      providers: [],
      channels: [],
      hasScheduler: false,
      hasMemory: false,
      hasSandbox: false,
      hasGateway: false,
    };
  }
}

export async function getAllAdapterStatuses(): Promise<AdapterStatusSummary[]> {
  const adapters = getVisibleAdapters();
  return Promise.all(adapters.map((a) => getAdapterStatus(a.id)));
}

export async function installAdapter(adapterId: RuntimeAdapterId): Promise<{ success: boolean; error?: string }> {
  const adapter = getRuntimeAdapter(adapterId);
  try {
    await adapter.install(runner);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Install failed" };
  }
}

export async function uninstallAdapter(adapterId: RuntimeAdapterId): Promise<{ success: boolean; error?: string }> {
  const adapter = getRuntimeAdapter(adapterId);
  try {
    await adapter.uninstall(runner);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Uninstall failed" };
  }
}
