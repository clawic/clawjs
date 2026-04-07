import { createHash } from "node:crypto";

export interface ProjectResourceRef {
  id: string;
  label?: string;
  uri?: string;
  mode?: "allow" | "deny";
  metadata?: Record<string, unknown>;
}

export interface ProjectSecretRef {
  id: string;
  label?: string;
  secretName?: string;
  mode?: "allow" | "deny";
  metadata?: Record<string, unknown>;
}

export interface EffectiveAccessPolicy {
  resources: ProjectResourceRef[];
  secrets: ProjectSecretRef[];
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "default";
}

function stableHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function buildStableId(value: string, maxLength = 64): string {
  const normalized = slugify(value);
  if (normalized.length <= maxLength) return normalized;
  const suffix = stableHash(value);
  return `${normalized.slice(0, Math.max(1, maxLength - suffix.length - 1))}-${suffix}`;
}

export function deriveAssignmentWorkspaceId(projectId: string, agentId: string): string {
  return buildStableId(`${projectId}--${agentId}`);
}

export function deriveRuntimeAgentId(projectId: string, agentId: string): string {
  return buildStableId(`${agentId}--${projectId}`);
}

function mergeAccessRefs<T extends { id: string; mode?: "allow" | "deny" }>(
  baseRefs: T[] = [],
  overlayRefs: T[] = [],
): T[] {
  const merged = new Map<string, T>();

  for (const ref of [...baseRefs, ...overlayRefs]) {
    const current = merged.get(ref.id);
    if (!current) {
      merged.set(ref.id, { ...ref });
      continue;
    }

    const nextMode = current.mode === "deny" || ref.mode === "deny"
      ? "deny"
      : ref.mode ?? current.mode;
    merged.set(ref.id, {
      ...current,
      ...ref,
      mode: nextMode,
    });
  }

  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function buildEffectiveAccessPolicy(input: {
  projectResourceRefs?: ProjectResourceRef[];
  agentResourceRefs?: ProjectResourceRef[];
  assignmentResourceRefs?: ProjectResourceRef[];
  projectSecretRefs?: ProjectSecretRef[];
  agentSecretRefs?: ProjectSecretRef[];
  assignmentSecretRefs?: ProjectSecretRef[];
}): EffectiveAccessPolicy {
  return {
    resources: mergeAccessRefs(
      mergeAccessRefs(input.projectResourceRefs, input.agentResourceRefs),
      input.assignmentResourceRefs,
    ),
    secrets: mergeAccessRefs(
      mergeAccessRefs(input.projectSecretRefs, input.agentSecretRefs),
      input.assignmentSecretRefs,
    ),
  };
}
