import type { CapabilityState, OrchestrationReadiness } from "@clawjs/core";
import { summarizeReadiness } from "@clawjs/core";

import type { RuntimeCompatReport, RuntimeDoctorReport, RuntimeProbeStatus } from "./runtime/contracts.ts";

export interface OrchestrationSnapshot {
  readiness: OrchestrationReadiness;
  states: Record<string, CapabilityState>;
}

export function buildOrchestrationSnapshot(input: {
  runtime: RuntimeProbeStatus;
  compat: RuntimeCompatReport;
  doctor: RuntimeDoctorReport;
  workspaceReady: boolean;
  authReady?: boolean;
  modelReady?: boolean;
  fileSyncReady?: boolean;
}): OrchestrationSnapshot {
  const states: Record<string, CapabilityState> = {
    runtime: {
      name: "runtime",
      status: input.runtime.cliAvailable ? (input.compat.degraded ? "degraded" : "ready") : "error",
      diagnostics: input.runtime.diagnostics,
      recommendedActions: input.doctor.suggestedRepairs,
    },
    workspace: {
      name: "workspace",
      status: input.workspaceReady ? "ready" : "degraded",
      recommendedActions: input.workspaceReady ? [] : ["Initialize or attach a workspace."],
    },
    auth: {
      name: "auth",
      status: input.authReady ? "ready" : "degraded",
      recommendedActions: input.authReady ? [] : ["Authenticate at least one provider."],
    },
    models: {
      name: "models",
      status: input.modelReady ? "ready" : "degraded",
      recommendedActions: input.modelReady ? [] : ["Set a default model."],
    },
    file_sync: {
      name: "file_sync",
      status: input.fileSyncReady ? "ready" : "degraded",
      recommendedActions: input.fileSyncReady ? [] : ["Sync template and binding content into workspace files."],
    },
  };

  return {
    states,
    readiness: summarizeReadiness(states),
  };
}
