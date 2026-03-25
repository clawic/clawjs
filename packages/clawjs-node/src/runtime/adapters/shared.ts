import type {
  CommandRunner,
  RuntimeCommandSpec,
  RuntimeCompatReport,
  RuntimeOperation,
  RuntimeProgressEvent,
  RuntimeProgressPlan,
  RuntimeProgressSink,
  RuntimeProgressStep,
} from "../contracts.ts";
import type {
  CapabilityName,
  ConversationPolicy,
  FeatureOwnership,
  RuntimeFeatureDescriptor,
  RuntimeCapabilityKey,
  RuntimeCapabilityMap,
  RuntimeCapabilitySupport,
} from "@clawjs/core";

export function buildProgressStep(
  phase: string,
  message: string,
  percent: number,
  command?: RuntimeCommandSpec,
): RuntimeProgressStep {
  return {
    phase,
    message,
    percent,
    ...(command ? { command } : {}),
  };
}

export function emitRuntimeProgress(
  sink: RuntimeProgressSink | undefined,
  event: Omit<RuntimeProgressEvent, "timestamp">,
): void {
  sink?.({
    ...event,
    timestamp: new Date().toISOString(),
  });
}

export async function runRuntimeProgressPlan(
  plan: RuntimeProgressPlan,
  runner: CommandRunner,
  onProgress?: RuntimeProgressSink,
  timeoutMs = 30_000,
): Promise<void> {
  for (const step of plan.steps) {
    emitRuntimeProgress(onProgress, {
      operation: plan.operation,
      capability: plan.capability,
      phase: step.phase,
      message: step.message,
      percent: step.percent,
      status: "start",
      ...(step.command ? { command: step.command } : {}),
    });

    if (!step.command) {
      emitRuntimeProgress(onProgress, {
        operation: plan.operation,
        capability: plan.capability,
        phase: step.phase,
        message: step.message,
        percent: step.percent,
        status: "complete",
      });
      continue;
    }

    try {
      await runner.exec(step.command.command, step.command.args, {
        env: step.command.env,
        timeoutMs,
      });
      emitRuntimeProgress(onProgress, {
        operation: plan.operation,
        capability: plan.capability,
        phase: step.phase,
        message: step.message,
        percent: step.percent,
        status: "complete",
        command: step.command,
      });
    } catch (error) {
      emitRuntimeProgress(onProgress, {
        operation: plan.operation,
        capability: plan.capability,
        phase: step.phase,
        message: error instanceof Error ? error.message : "Runtime operation failed",
        percent: step.percent,
        status: "error",
        command: step.command,
      });
      throw error;
    }
  }
}

export function runtimeOperationCapability(operation: RuntimeOperation): CapabilityName {
  return operation === "setup" ? "workspace" : "runtime";
}

function normalizeCapabilitySupport(
  capability: RuntimeCapabilityKey,
  override: Partial<RuntimeCapabilitySupport>,
): RuntimeCapabilitySupport {
  const supported = override.supported ?? false;
  const status = override.status ?? (supported ? "detected" : "unsupported");
  const strategy = override.strategy ?? (supported ? "derived" : "unsupported");

  if (!supported || status === "unsupported") {
    return {
      supported: false,
      status: "unsupported",
      strategy: "unsupported",
      ...(override.diagnostics ? { diagnostics: override.diagnostics } : {}),
      ...(override.limitations ? { limitations: override.limitations } : {}),
    };
  }

  return {
    supported: true,
    status,
    strategy,
    ...(override.diagnostics ? { diagnostics: override.diagnostics } : {}),
    ...(override.limitations ? { limitations: override.limitations } : {}),
  };
}

const ALL_RUNTIME_CAPABILITIES: RuntimeCapabilityKey[] = [
  "runtime",
  "workspace",
  "auth",
  "models",
  "conversation_cli",
  "conversation_gateway",
  "streaming",
  "scheduler",
  "memory",
  "skills",
  "channels",
  "sandbox",
  "plugins",
  "doctor",
  "compat",
];

export function buildRuntimeCapabilityMap(
  overrides: Partial<Record<RuntimeCapabilityKey, Partial<RuntimeCapabilitySupport>>> = {},
): RuntimeCapabilityMap {
  return Object.fromEntries(
    ALL_RUNTIME_CAPABILITIES.map((capability) => {
      const override = overrides[capability] ?? {};
      return [capability, normalizeCapabilitySupport(capability, override)];
    }),
  ) as RuntimeCapabilityMap;
}

export function capabilityBooleansFromMap(capabilityMap: RuntimeCapabilityMap): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(capabilityMap).map(([key, capability]) => [key, capability.supported]),
  );
}

export function buildRuntimeCompatReport(input: Omit<RuntimeCompatReport, "capabilities"> & { capabilityMap: RuntimeCapabilityMap }): RuntimeCompatReport {
  return {
    ...input,
    capabilities: capabilityBooleansFromMap(input.capabilityMap),
  };
}

export function buildRuntimeFeatureDescriptor(
  featureId: string,
  ownership: FeatureOwnership,
  supported: boolean,
  options: {
    conversationPolicy?: ConversationPolicy;
    limitations?: string[];
  } = {},
): RuntimeFeatureDescriptor {
  return {
    featureId,
    ownership,
    supported,
    ...(options.conversationPolicy ? { conversationPolicy: options.conversationPolicy } : {}),
    ...(options.limitations && options.limitations.length > 0 ? { limitations: options.limitations } : {}),
  };
}

export function defaultManagedConversationFeatures(options: {
  channelsSupported?: boolean;
  skillsSupported?: boolean;
  pluginsSupported?: boolean;
  memorySupported?: boolean;
  schedulerSupported?: boolean;
  limitationsByFeature?: Partial<Record<string, string[]>>;
} = {}): RuntimeFeatureDescriptor[] {
  const limitationsByFeature = options.limitationsByFeature ?? {};
  return [
    buildRuntimeFeatureDescriptor("runtime", "sdk-owned", true, { limitations: limitationsByFeature.runtime }),
    buildRuntimeFeatureDescriptor("models", "sdk-owned", true, { limitations: limitationsByFeature.models }),
    buildRuntimeFeatureDescriptor("providers", "mirrored", true, { limitations: limitationsByFeature.providers }),
    buildRuntimeFeatureDescriptor("channels", "mirrored", options.channelsSupported ?? false, { limitations: limitationsByFeature.channels }),
    buildRuntimeFeatureDescriptor("skills", "mirrored", options.skillsSupported ?? false, { limitations: limitationsByFeature.skills }),
    buildRuntimeFeatureDescriptor("plugins", "mirrored", options.pluginsSupported ?? false, { limitations: limitationsByFeature.plugins }),
    buildRuntimeFeatureDescriptor("files", "sdk-owned", true, { limitations: limitationsByFeature.files }),
    buildRuntimeFeatureDescriptor("memory", "runtime-owned", options.memorySupported ?? false, { limitations: limitationsByFeature.memory }),
    buildRuntimeFeatureDescriptor("scheduler", "runtime-owned", options.schedulerSupported ?? false, { limitations: limitationsByFeature.scheduler }),
    buildRuntimeFeatureDescriptor("conversations", "mirrored", true, { conversationPolicy: "managed", limitations: limitationsByFeature.conversations }),
    buildRuntimeFeatureDescriptor("speech", "sdk-owned", true, { limitations: limitationsByFeature.speech }),
  ];
}

export function openClawMirrorFeatures(status: RuntimeCapabilityMap): RuntimeFeatureDescriptor[] {
  return [
    buildRuntimeFeatureDescriptor("runtime", "sdk-owned", true),
    buildRuntimeFeatureDescriptor("models", "sdk-owned", true),
    buildRuntimeFeatureDescriptor("providers", "mirrored", true),
    buildRuntimeFeatureDescriptor("channels", "mirrored", status.channels.supported, { limitations: status.channels.limitations }),
    buildRuntimeFeatureDescriptor("skills", "mirrored", status.skills.supported, { limitations: status.skills.limitations }),
    buildRuntimeFeatureDescriptor("plugins", "mirrored", status.plugins.supported, { limitations: status.plugins.limitations }),
    buildRuntimeFeatureDescriptor("files", "sdk-owned", true),
    buildRuntimeFeatureDescriptor("memory", "runtime-owned", status.memory.supported, { limitations: status.memory.limitations }),
    buildRuntimeFeatureDescriptor("scheduler", "runtime-owned", status.scheduler.supported, { limitations: status.scheduler.limitations }),
    buildRuntimeFeatureDescriptor("conversations", "mirrored", true, { conversationPolicy: "mirror" }),
    buildRuntimeFeatureDescriptor("speech", "sdk-owned", true),
  ];
}
