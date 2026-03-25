import fs from "fs";
import path from "path";
import { compatSnapshotSchema, type CompatSnapshot } from "@clawjs/core";

import type { RuntimeCompatReport, RuntimeProbeStatus } from "../runtime/contracts.ts";
import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";

export const COMPAT_SNAPSHOT_FILE = "runtime-snapshot.json";
const LEGACY_SNAPSHOT_WRAPPER_KEYS = ["snapshot", "compat", "compatSnapshot", "payload", "data"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    switch (value.trim().toLowerCase()) {
      case "true":
      case "1":
      case "yes":
      case "on":
        return true;
      case "false":
      case "0":
      case "no":
      case "off":
        return false;
    }
  }
  return null;
}

function normalizeCapabilities(value: unknown): Record<string, boolean> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.flatMap((capability) => {
        if (typeof capability === "string" && capability.trim()) {
          return [[capability, true] as const];
        }

        if (Array.isArray(capability) && capability.length >= 2 && typeof capability[0] === "string") {
          const normalized = normalizeBoolean(capability[1]);
          if (normalized !== null) {
            return [[capability[0], normalized] as const];
          }
        }

        return [];
      }),
    ) as Record<string, boolean>;
  }

  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([capability, rawValue]) => {
      const normalized = normalizeBoolean(rawValue);
      if (normalized !== null) {
        return [[capability, normalized] as const];
      }

      if (isRecord(rawValue)) {
        const explicitState = normalizeBoolean(
          rawValue.enabled ?? rawValue.available ?? rawValue.present ?? rawValue.value ?? rawValue.ready,
        );
        if (explicitState !== null) {
          return [[capability, explicitState] as const];
        }

        if (typeof rawValue.status === "string") {
          const status = rawValue.status.trim().toLowerCase();
          if (["ready", "installed", "detected", "available", "enabled"].includes(status)) {
            return [[capability, true] as const];
          }
          if (["unsupported", "unavailable", "missing", "absent", "disabled", "error"].includes(status)) {
            return [[capability, false] as const];
          }
        }
      }

      return [];
    }),
  ) as Record<string, boolean>;
}

function normalizeDiagnostics(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return { ...value };
}

function normalizeSchemaVersion(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0 && String(parsed) === value.trim()) {
      return parsed;
    }
  }

  return 1;
}

function normalizeRuntimeAdapter(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "unknown";
}

function normalizeRuntimeVersion(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function normalizeProbedAt(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return new Date().toISOString();
}

function findLegacySnapshotPayload(value: Record<string, unknown>): Record<string, unknown> | null {
  for (const key of LEGACY_SNAPSHOT_WRAPPER_KEYS) {
    const candidate = value[key];
    if (isRecord(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeCompatSnapshotRecord(value: Record<string, unknown>): CompatSnapshot | null {
  const legacyPayload = findLegacySnapshotPayload(value);
  if (legacyPayload) {
    const normalizedLegacy = normalizeCompatSnapshotRecord(legacyPayload);
    if (normalizedLegacy) {
      return normalizedLegacy;
    }
  }

  const runtime = isRecord(value.runtime) ? value.runtime : undefined;
  const diagnostics = normalizeDiagnostics(value.diagnostics ?? runtime?.diagnostics);
  const normalized = {
    schemaVersion: normalizeSchemaVersion(value.schemaVersion ?? runtime?.schemaVersion),
    runtimeAdapter: normalizeRuntimeAdapter(value.runtimeAdapter ?? runtime?.runtimeAdapter ?? runtime?.adapter),
    runtimeVersion: normalizeRuntimeVersion(value.runtimeVersion ?? runtime?.runtimeVersion ?? runtime?.version),
    probedAt: normalizeProbedAt(value.probedAt ?? runtime?.probedAt),
    capabilities: normalizeCapabilities(value.capabilities ?? runtime?.capabilities),
    ...(diagnostics ? { diagnostics } : {}),
  };

  const parsed = compatSnapshotSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data as CompatSnapshot;
  }

  return null;
}

export function resolveCompatSnapshotPath(workspaceDir: string): string {
  return path.join(workspaceDir, ".clawjs", "compat", COMPAT_SNAPSHOT_FILE);
}

function resolveLegacyCompatSnapshotPaths(workspaceDir: string): string[] {
  return [
    path.join(workspaceDir, ".clawjs", "compat.json"),
    path.join(workspaceDir, ".clawjs", "runtime-snapshot.json"),
  ];
}

function serializeCompatSnapshot(snapshot: CompatSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function normalizeCompatSnapshot(value: unknown): CompatSnapshot | null {
  if (isRecord(value)) {
    const normalized = normalizeCompatSnapshotRecord(value);
    if (normalized) {
      return normalized;
    }
  }

  const parsed = compatSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data as CompatSnapshot : null;
}

export function readCompatSnapshot(workspaceDir: string, filesystem = new NodeFileSystemHost()): CompatSnapshot | null {
  try {
    return normalizeCompatSnapshot(JSON.parse(filesystem.readText(resolveCompatSnapshotPath(workspaceDir))));
  } catch {
    return null;
  }
}

export interface CompatSnapshotMigrationResult {
  snapshot: CompatSnapshot | null;
  sourcePath: string | null;
  targetPath: string;
  migrated: boolean;
}

export function migrateCompatSnapshot(workspaceDir: string, filesystem = new NodeFileSystemHost()): CompatSnapshotMigrationResult {
  const targetPath = resolveCompatSnapshotPath(workspaceDir);
  const currentSnapshot = readCompatSnapshot(workspaceDir, filesystem);
  if (currentSnapshot) {
      const serialized = serializeCompatSnapshot(currentSnapshot);
      const existing = filesystem.tryReadText(targetPath).replace(/\r\n/g, "\n");
      if (existing !== serialized) {
        filesystem.withLockRetry(resolveFileLockPath(targetPath), () => filesystem.writeTextAtomic(targetPath, serialized));
        return {
          snapshot: currentSnapshot,
          sourcePath: targetPath,
        targetPath,
        migrated: true,
      };
    }

    return {
      snapshot: currentSnapshot,
      sourcePath: targetPath,
      targetPath,
      migrated: false,
    };
  }

  for (const sourcePath of resolveLegacyCompatSnapshotPaths(workspaceDir)) {
    if (!filesystem.exists(sourcePath)) continue;

    try {
      const snapshot = normalizeCompatSnapshot(JSON.parse(filesystem.readText(sourcePath)));
      if (!snapshot) continue;

      filesystem.withLockRetry(resolveFileLockPath(targetPath), () => filesystem.writeTextAtomic(targetPath, serializeCompatSnapshot(snapshot)));
      return {
        snapshot,
        sourcePath,
        targetPath,
        migrated: true,
      };
    } catch {
      continue;
    }
  }

  return {
    snapshot: null,
    sourcePath: null,
    targetPath,
    migrated: false,
  };
}

export function writeCompatSnapshot(workspaceDir: string, status: RuntimeProbeStatus, compat: RuntimeCompatReport, filesystem = new NodeFileSystemHost()): CompatSnapshot {
  const snapshot: CompatSnapshot = {
    schemaVersion: 1,
    runtimeAdapter: compat.runtimeAdapter || status.adapter || "unknown",
    runtimeVersion: status.version,
    probedAt: new Date().toISOString(),
    capabilities: compat.capabilities,
    diagnostics: {
      degraded: compat.degraded,
      issues: compat.issues,
      ...status.diagnostics,
      ...(compat.diagnostics ?? {}),
    },
  };

  const filePath = resolveCompatSnapshotPath(workspaceDir);
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => {
    filesystem.writeTextAtomic(filePath, serializeCompatSnapshot(snapshot));
  });

  return snapshot;
}

export function compatSnapshotExists(workspaceDir: string): boolean {
  return fs.existsSync(resolveCompatSnapshotPath(workspaceDir));
}
