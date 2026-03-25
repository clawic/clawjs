import type { CompatSnapshot } from "@clawjs/core";

import type { RuntimeCompatReport, RuntimeProbeStatus } from "../runtime/contracts.ts";

export interface CompatDriftIssue {
  code: "runtime_adapter" | "runtime_version" | "version_family" | "capability_signature";
  message: string;
}

export interface CompatDriftReport {
  drifted: boolean;
  issues: CompatDriftIssue[];
}

function readStringDiagnostic(source: Record<string, unknown> | undefined, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function buildCompatDriftReport(
  snapshot: CompatSnapshot | null,
  runtime: RuntimeProbeStatus,
  compat: RuntimeCompatReport,
): CompatDriftReport {
  if (!snapshot) {
    return {
      drifted: false,
      issues: [],
    };
  }

  const issues: CompatDriftIssue[] = [];
  if (snapshot.runtimeAdapter !== compat.runtimeAdapter) {
    issues.push({
      code: "runtime_adapter",
      message: `Compat snapshot adapter drifted from ${snapshot.runtimeAdapter} to ${compat.runtimeAdapter}.`,
    });
  }

  if (snapshot.runtimeVersion && compat.runtimeVersion && snapshot.runtimeVersion !== compat.runtimeVersion) {
    issues.push({
      code: "runtime_version",
      message: `Compat snapshot runtime version drifted from ${snapshot.runtimeVersion} to ${compat.runtimeVersion}.`,
    });
  }

  const snapshotVersionFamily = readStringDiagnostic(snapshot.diagnostics, "versionFamily");
  const currentVersionFamily = readStringDiagnostic({
    ...runtime.diagnostics,
    ...(compat.diagnostics ?? {}),
  }, "versionFamily");
  if (snapshotVersionFamily && currentVersionFamily && snapshotVersionFamily !== currentVersionFamily) {
    issues.push({
      code: "version_family",
      message: `Compat snapshot version family drifted from ${snapshotVersionFamily} to ${currentVersionFamily}.`,
    });
  }

  const snapshotCapabilitySignature = readStringDiagnostic(snapshot.diagnostics, "capabilitySignature");
  const currentCapabilitySignature = readStringDiagnostic({
    ...runtime.diagnostics,
    ...(compat.diagnostics ?? {}),
  }, "capabilitySignature");
  if (snapshotCapabilitySignature && currentCapabilitySignature && snapshotCapabilitySignature !== currentCapabilitySignature) {
    issues.push({
      code: "capability_signature",
      message: "Compat snapshot capability signature no longer matches the current runtime probe.",
    });
  }

  return {
    drifted: issues.length > 0,
    issues,
  };
}
