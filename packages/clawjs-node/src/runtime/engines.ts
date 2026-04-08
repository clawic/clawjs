import type {
  ChannelCatalog,
  MemoryCatalog,
  PluginCatalog,
  RuntimeCapabilityMap,
  RuntimeCapabilitySupport,
  SchedulerCatalog,
  SkillCatalog,
} from "@clawjs/core";

import type {
  CommandRunner,
  RuntimeAdapter,
  RuntimeAdapterOptions,
  RuntimeConversationAdapter,
  RuntimeProbeStatus,
} from "./contracts.ts";
import { buildRuntimeCapabilityMap } from "./adapters/shared.ts";

function mergeCapabilitySupport(
  described: RuntimeCapabilitySupport | undefined,
  probed: RuntimeCapabilitySupport | undefined,
): Partial<RuntimeCapabilitySupport> {
  const limitations = Array.from(new Set([
    ...(described?.limitations ?? []),
    ...(probed?.limitations ?? []),
  ]));

  return {
    supported: probed?.supported ?? described?.supported ?? false,
    status: probed?.status ?? described?.status,
    strategy: probed?.strategy ?? described?.strategy,
    diagnostics: {
      ...(described?.diagnostics ?? {}),
      ...(probed?.diagnostics ?? {}),
    },
    ...(limitations.length > 0 ? { limitations } : {}),
  };
}

export function mergeRuntimeCapabilityMaps(
  described: RuntimeCapabilityMap | undefined,
  probed: RuntimeCapabilityMap | undefined,
): RuntimeCapabilityMap {
  const keys = new Set<string>([
    ...Object.keys(described ?? {}),
    ...Object.keys(probed ?? {}),
  ]);
  return buildRuntimeCapabilityMap(
    Object.fromEntries(
      Array.from(keys).map((key) => [
        key,
        mergeCapabilitySupport(described?.[key], probed?.[key]),
      ]),
    ),
  );
}

export function describeRuntimeCapabilities(
  adapter: RuntimeAdapter,
  options: RuntimeAdapterOptions,
): RuntimeCapabilityMap | undefined {
  return adapter.capabilities?.describe(options);
}

export async function probeRuntimeCapabilities(
  adapter: RuntimeAdapter,
  runner: CommandRunner,
  options: RuntimeAdapterOptions,
): Promise<{ capabilityMap: RuntimeCapabilityMap; diagnostics?: Record<string, unknown> }> {
  if (adapter.capabilities?.probe) {
    return adapter.capabilities.probe(runner, options);
  }

  const status = await adapter.getStatus(runner, options);
  return {
    capabilityMap: status.capabilityMap,
    diagnostics: status.diagnostics,
  };
}

export async function getRuntimeStatusReport(
  adapter: RuntimeAdapter,
  runner: CommandRunner,
  options: RuntimeAdapterOptions,
): Promise<RuntimeProbeStatus> {
  const status = await adapter.getStatus(runner, options);
  const described = describeRuntimeCapabilities(adapter, options);
  const probed = adapter.capabilities?.probe
    ? await adapter.capabilities.probe(runner, options)
    : { capabilityMap: status.capabilityMap, diagnostics: status.diagnostics };

  return {
    ...status,
    capabilityMap: mergeRuntimeCapabilityMaps(described, probed.capabilityMap),
    diagnostics: {
      ...status.diagnostics,
      ...(probed.diagnostics ?? {}),
    },
  };
}

export interface RuntimeResourceCatalogs {
  providers: Awaited<ReturnType<RuntimeAdapter["getProviderCatalog"]>>;
  models: Awaited<ReturnType<RuntimeAdapter["getModelCatalog"]>>;
  auth: Awaited<ReturnType<RuntimeAdapter["getAuthState"]>>;
  schedulers: SchedulerCatalog;
  memory: MemoryCatalog;
  skills: SkillCatalog;
  channels: ChannelCatalog;
  plugins: PluginCatalog;
}

export async function getRuntimeResourceCatalogs(
  adapter: RuntimeAdapter,
  runner: CommandRunner,
  options: RuntimeAdapterOptions,
): Promise<RuntimeResourceCatalogs> {
  const resources = adapter.resources;
  const schedulers = resources?.getSchedulerCatalog
    ? await resources.getSchedulerCatalog(runner, options)
    : { schedulers: await adapter.listSchedulers(runner, options) };
  const memory = resources?.getMemoryCatalog
    ? await resources.getMemoryCatalog(runner, options)
    : { memory: await adapter.listMemory(runner, options) };
  const skills = resources?.getSkillCatalog
    ? await resources.getSkillCatalog(runner, options)
    : { skills: await adapter.listSkills(runner, options) };
  const channels = resources?.getChannelCatalog
    ? await resources.getChannelCatalog(runner, options)
    : { channels: await adapter.listChannels(runner, options) };
  const plugins = resources?.getPluginCatalog
    ? await resources.getPluginCatalog(runner, options)
    : { plugins: [] };

  return {
    providers: resources?.getProviderCatalog
      ? await resources.getProviderCatalog(runner, options)
      : await adapter.getProviderCatalog(runner, options),
    models: resources?.getModelCatalog
      ? await resources.getModelCatalog(runner, options)
      : await adapter.getModelCatalog(runner, options),
    auth: resources?.getAuthState
      ? await resources.getAuthState(runner, options)
      : await adapter.getAuthState(runner, options),
    schedulers,
    memory,
    skills,
    channels,
    plugins,
  };
}

export function normalizeRuntimeConversationAdapter(
  adapter: RuntimeConversationAdapter,
): RuntimeConversationAdapter {
  const primaryTransport = adapter.primaryTransport
    ?? adapter.transport.primaryTransport
    ?? (adapter.transport.kind === "cli" ? "cli" : "gateway");
  const fallbackTransport = adapter.fallbackTransport
    ?? adapter.transport.fallbackTransport
    ?? (adapter.transport.kind === "hybrid" ? "cli" : "none");
  const sessionPersistence = adapter.sessionPersistence
    ?? adapter.transport.sessionPersistence
    ?? "ephemeral";
  const streamingMode = adapter.streamingMode
    ?? adapter.transport.streamingMode
    ?? (adapter.transport.streaming
      ? adapter.transport.kind === "hybrid"
        ? "hybrid"
        : adapter.transport.kind
      : "none");

  return {
    ...adapter,
    primaryTransport,
    fallbackTransport,
    sessionPersistence,
    streamingMode,
    transport: {
      ...adapter.transport,
      primaryTransport,
      fallbackTransport,
      sessionPersistence,
      streamingMode,
    },
  };
}

export function getRuntimeConversationDescriptor(
  adapter: RuntimeAdapter,
  options: RuntimeAdapterOptions,
): RuntimeConversationAdapter {
  const conversation = adapter.conversation?.create(options) ?? adapter.createConversationAdapter(options);
  return normalizeRuntimeConversationAdapter(conversation);
}

export function getRuntimeOperationHandlers(adapter: RuntimeAdapter) {
  return adapter.operations ?? {
    buildInstallCommand: adapter.buildInstallCommand.bind(adapter),
    buildUninstallCommand: adapter.buildUninstallCommand.bind(adapter),
    buildRepairCommand: adapter.buildRepairCommand.bind(adapter),
    buildWorkspaceSetupCommand: adapter.buildWorkspaceSetupCommand.bind(adapter),
    buildProgressPlan: adapter.buildProgressPlan.bind(adapter),
    install: adapter.install.bind(adapter),
    uninstall: adapter.uninstall.bind(adapter),
    repair: adapter.repair.bind(adapter),
    setupWorkspace: adapter.setupWorkspace.bind(adapter),
  };
}
