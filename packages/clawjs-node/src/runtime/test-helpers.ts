import type { RuntimeAdapterId } from "@clawjs/core";

import type { RuntimeCompatReport, RuntimeProbeStatus } from "./contracts.ts";
import { buildRuntimeCapabilityMap, buildRuntimeCompatReport } from "./adapters/shared.ts";

export function createMockRuntimeProbeStatus(input: {
  adapter: RuntimeAdapterId;
  runtimeName: string;
  version: string | null;
  cliAvailable: boolean;
  gatewayAvailable: boolean;
  capabilities: Record<string, boolean>;
  diagnostics?: Record<string, unknown>;
}): RuntimeProbeStatus {
  const pluginsSupported = input.capabilities.pluginsList === true;
  return {
    ...input,
    diagnostics: input.diagnostics ?? {},
    capabilityMap: buildRuntimeCapabilityMap({
      runtime: { supported: true, status: input.cliAvailable ? "ready" : "error", strategy: "cli" },
      workspace: { supported: true, status: "ready", strategy: "native" },
      auth: { supported: true, status: input.cliAvailable ? "ready" : "degraded", strategy: "cli" },
      models: { supported: true, status: input.cliAvailable ? "ready" : "degraded", strategy: "cli" },
      conversation_cli: { supported: true, status: input.cliAvailable ? "ready" : "error", strategy: "cli" },
      conversation_gateway: { supported: input.gatewayAvailable, status: input.gatewayAvailable ? "ready" : "unsupported", strategy: input.gatewayAvailable ? "gateway" : "unsupported" },
      streaming: { supported: true, status: input.cliAvailable ? "ready" : "degraded", strategy: input.gatewayAvailable ? "gateway" : "cli" },
      scheduler: { supported: true, status: "degraded", strategy: "derived" },
      memory: { supported: true, status: "degraded", strategy: "derived" },
      skills: { supported: true, status: "degraded", strategy: "derived" },
      channels: { supported: false, status: "unsupported", strategy: "unsupported" },
      sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
      plugins: {
        supported: pluginsSupported,
        status: pluginsSupported ? "ready" : "unsupported",
        strategy: pluginsSupported ? "native" : "unsupported",
      },
      doctor: { supported: true, status: "ready", strategy: "native" },
      compat: { supported: true, status: "ready", strategy: "native" },
    }),
  };
}

export function createMockRuntimeCompatReport(input: {
  runtimeAdapter: RuntimeAdapterId;
  runtimeVersion: string | null;
  capabilities: Record<string, boolean>;
  degraded: boolean;
  issues: string[];
  diagnostics?: Record<string, unknown>;
}): RuntimeCompatReport {
  const pluginsSupported = input.capabilities.pluginsList === true;
  return buildRuntimeCompatReport({
    ...input,
    diagnostics: input.diagnostics ?? {},
    capabilityMap: buildRuntimeCapabilityMap({
      runtime: { supported: true, status: input.degraded ? "degraded" : "ready", strategy: "cli" },
      workspace: { supported: true, status: "ready", strategy: "native" },
      auth: { supported: true, status: "degraded", strategy: "cli" },
      models: { supported: true, status: "degraded", strategy: "cli" },
      conversation_cli: { supported: true, status: "ready", strategy: "cli" },
      conversation_gateway: { supported: false, status: "unsupported", strategy: "unsupported" },
      streaming: { supported: true, status: "degraded", strategy: "cli" },
      scheduler: { supported: true, status: "degraded", strategy: "derived" },
      memory: { supported: true, status: "degraded", strategy: "derived" },
      skills: { supported: true, status: "degraded", strategy: "derived" },
      channels: { supported: false, status: "unsupported", strategy: "unsupported" },
      sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
      plugins: {
        supported: pluginsSupported,
        status: pluginsSupported ? "ready" : "unsupported",
        strategy: pluginsSupported ? "native" : "unsupported",
      },
      doctor: { supported: true, status: "ready", strategy: "native" },
      compat: { supported: true, status: "ready", strategy: "native" },
    }),
  });
}
