import type { CapabilityName, CompatSnapshot } from "@clawjs/core";
import type { ProviderAuthSummary } from "@clawjs/core";

import type { CompatDriftReport } from "../compat/drift.ts";
import type { RuntimeCompatReport, RuntimeDoctorReport, RuntimeProbeStatus } from "../runtime/contracts.ts";
import type { WorkspaceValidationResult } from "../workspace/manager.ts";
import type { ManagedBlockProblem } from "../files/managed-blocks.ts";

export interface CombinedDoctorIssue {
  capability: CapabilityName;
  message: string;
}

export interface CombinedDoctorReport {
  ok: boolean;
  runtime: RuntimeProbeStatus;
  compat: RuntimeCompatReport;
  runtimeDoctor: RuntimeDoctorReport;
  workspace: WorkspaceValidationResult;
  compatSnapshot: CompatSnapshot | null;
  compatDrift: CompatDriftReport;
  managedBlockProblems?: ManagedBlockProblem[];
  missingProvidersInUse?: string[];
  providerSummaries?: Record<string, ProviderAuthSummary>;
  issues: CombinedDoctorIssue[];
  suggestedRepairs: string[];
}

export function buildCombinedDoctorReport(input: {
  runtime: RuntimeProbeStatus;
  compat: RuntimeCompatReport;
  runtimeDoctor: RuntimeDoctorReport;
  workspace: WorkspaceValidationResult;
  compatSnapshot: CompatSnapshot | null;
  compatDrift: CompatDriftReport;
  managedBlockProblems?: ManagedBlockProblem[];
  missingProvidersInUse?: string[];
  providerSummaries?: Record<string, ProviderAuthSummary>;
}): CombinedDoctorReport {
  const issues: CombinedDoctorIssue[] = [
    ...input.runtimeDoctor.issues.map((message) => ({ capability: "runtime" as const, message })),
    ...input.compatDrift.issues.map((issue) => ({ capability: "compat" as const, message: issue.message })),
    ...(input.missingProvidersInUse ?? []).map((provider) => ({ capability: "auth" as const, message: `Provider required by the runtime is not authenticated: ${provider}` })),
    ...(input.managedBlockProblems ?? []).map((problem) => ({ capability: "file_sync" as const, message: problem.message })),
    ...input.workspace.missingDirectories.map((directory) => ({ capability: "workspace" as const, message: `Missing directory: ${directory}` })),
    ...input.workspace.missingFiles.map((fileName) => ({ capability: "workspace" as const, message: `Missing runtime file: ${fileName}` })),
    ...(input.workspace.manifest ? [] : [{ capability: "workspace" as const, message: "Missing ClawJS workspace manifest." }]),
  ];

  const suggestedRepairs = [
    ...input.runtimeDoctor.suggestedRepairs,
    ...(input.compatSnapshot && input.compatDrift.drifted ? ["Refresh the compat snapshot after verifying the current runtime state."] : []),
    ...(input.compatDrift.issues.some((issue) => issue.code === "version_family")
      ? ["Review adapter compatibility for the new runtime version family before proceeding."]
      : []),
    ...((input.missingProvidersInUse ?? []).length > 0 ? ["Authenticate the providers currently required by the runtime model selection."] : []),
    ...((input.managedBlockProblems ?? []).length > 0 ? ["Repair malformed managed blocks before the next sync or rerender the affected bindings."] : []),
    ...(input.workspace.manifest ? [] : ["Initialize the workspace to create .clawjs/manifest.json."]),
    ...(input.workspace.missingFiles.length > 0 ? [`Restore missing runtime files: ${input.workspace.missingFiles.join(", ")}.`] : []),
    ...(input.workspace.missingDirectories.length > 0 ? ["Recreate missing .clawjs directories via workspace init or repair."] : []),
  ];

  const uniqueIssues = issues.filter((issue, index, all) => index === all.findIndex((candidate) => candidate.capability === issue.capability && candidate.message === issue.message));
  const uniqueRepairs = suggestedRepairs.filter((repair, index, all) => all.indexOf(repair) === index);

  return {
    ok: uniqueIssues.length === 0,
    runtime: input.runtime,
    compat: input.compat,
    runtimeDoctor: input.runtimeDoctor,
    workspace: input.workspace,
    compatSnapshot: input.compatSnapshot,
    compatDrift: input.compatDrift,
    ...(input.managedBlockProblems ? { managedBlockProblems: input.managedBlockProblems } : {}),
    ...(input.missingProvidersInUse ? { missingProvidersInUse: input.missingProvidersInUse } : {}),
    ...(input.providerSummaries ? { providerSummaries: input.providerSummaries } : {}),
    issues: uniqueIssues,
    suggestedRepairs: uniqueRepairs,
  };
}
