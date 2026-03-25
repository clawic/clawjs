import fs from "fs";
import path from "path";

import { NodeFileSystemHost } from "../host/filesystem.ts";
import {
  readOpenClawRuntimeConfig,
  resolveOpenClawContext,
  writeOpenClawRuntimeConfig,
  type OpenClawConfigFile,
  type OpenClawRuntimeContext,
  type ResolveOpenClawContextOptions,
} from "./openclaw-context.ts";

export type OpenClawLegacyMigrationStrategy = "none" | "copy_merge_if_missing" | "move_if_missing";

export interface OpenClawLegacyMigrationOptions {
  strategy?: OpenClawLegacyMigrationStrategy;
  workspaceDirCandidates?: string[];
  agentDirCandidates?: string[];
  conversationsDirCandidates?: string[];
}

export interface DiscoverOpenClawAppContextOptions extends ResolveOpenClawContextOptions {
  agentIds?: string[];
  migrateLegacy?: OpenClawLegacyMigrationOptions;
}

export interface OpenClawPathMigrationAction {
  kind: "workspace" | "agent" | "conversations";
  sourcePath: string | null;
  targetPath: string;
  strategy: OpenClawLegacyMigrationStrategy;
  performed: boolean;
  reason: "migrated" | "missing_source" | "target_exists" | "disabled";
}

export interface OpenClawLegacyMigrationResult {
  strategy: OpenClawLegacyMigrationStrategy;
  actions: OpenClawPathMigrationAction[];
}

export interface OpenClawAppContext extends OpenClawRuntimeContext {
  requestedAgentIds: string[];
  matchedAgentId: string | null;
  migration: OpenClawLegacyMigrationResult | null;
}

export interface DetachOpenClawAppContextOptions extends ResolveOpenClawContextOptions {
  agentIds?: string[];
  removeConfiguredAgent?: boolean;
  clearDefaultWorkspaceIfMatches?: boolean;
  removeWorkspaceDir?: boolean;
  removeAgentDir?: boolean;
  removeConversationsDir?: boolean;
  filesystem?: NodeFileSystemHost;
}

export interface DetachOpenClawAppContextResult {
  context: OpenClawRuntimeContext;
  removedAgentIds: string[];
  removedPaths: string[];
  updatedConfig: boolean;
  config: OpenClawConfigFile | null;
}

function normalizeCandidateList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function selectAgentId(
  options: DiscoverOpenClawAppContextOptions,
  config: OpenClawConfigFile | null,
): { requestedAgentIds: string[]; agentId: string; matchedAgentId: string | null } {
  const env = options.env ?? process.env;
  const requestedAgentIds = normalizeCandidateList([
    options.agentId,
    env.OPENCLAW_AGENT_ID,
    ...(options.agentIds ?? []),
  ]);
  const configuredIds = new Set(
    Array.isArray(config?.agents?.list)
      ? config!.agents!.list!
        .map((agent) => agent?.id?.trim())
        .filter((value): value is string => !!value)
      : [],
  );
  const matchedAgentId = requestedAgentIds.find((candidate) => configuredIds.has(candidate)) ?? null;
  const configuredFallback = config?.agents?.list?.find((agent) => typeof agent?.id === "string" && agent.id.trim())?.id?.trim() ?? null;
  const agentId = matchedAgentId
    || requestedAgentIds[0]
    || configuredFallback
    || "default";
  return {
    requestedAgentIds,
    agentId,
    matchedAgentId,
  };
}

function copyMergeIfMissing(sourcePath: string, targetPath: string): boolean {
  if (!fs.existsSync(sourcePath)) return false;
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    let changed = false;
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      const performed = copyMergeIfMissing(
        path.join(sourcePath, entry.name),
        path.join(targetPath, entry.name),
      );
      changed = changed || performed;
    }
    return changed;
  }
  if (fs.existsSync(targetPath)) return false;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function migratePath(
  kind: OpenClawPathMigrationAction["kind"],
  targetPath: string,
  sourceCandidates: string[] | undefined,
  strategy: OpenClawLegacyMigrationStrategy,
): OpenClawPathMigrationAction {
  const sourcePath = normalizeCandidateList(sourceCandidates ?? [])
    .find((candidate) => candidate !== targetPath && fs.existsSync(candidate)) ?? null;

  if (strategy === "none") {
    return {
      kind,
      sourcePath,
      targetPath,
      strategy,
      performed: false,
      reason: "disabled",
    };
  }

  if (!sourcePath) {
    return {
      kind,
      sourcePath: null,
      targetPath,
      strategy,
      performed: false,
      reason: "missing_source",
    };
  }

  if (strategy === "move_if_missing") {
    if (fs.existsSync(targetPath)) {
      return {
        kind,
        sourcePath,
        targetPath,
        strategy,
        performed: false,
        reason: "target_exists",
      };
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.renameSync(sourcePath, targetPath);
    return {
      kind,
      sourcePath,
      targetPath,
      strategy,
      performed: true,
      reason: "migrated",
    };
  }

  const performed = copyMergeIfMissing(sourcePath, targetPath);
  return {
    kind,
    sourcePath,
    targetPath,
    strategy,
    performed,
    reason: performed ? "migrated" : "target_exists",
  };
}

export function migrateOpenClawAppState(
  context: Pick<OpenClawRuntimeContext, "workspaceDir" | "agentDir" | "conversationsDir">,
  options: OpenClawLegacyMigrationOptions = {},
): OpenClawLegacyMigrationResult {
  const strategy = options.strategy ?? "copy_merge_if_missing";
  return {
    strategy,
    actions: [
      migratePath("workspace", context.workspaceDir, options.workspaceDirCandidates, strategy),
      migratePath("agent", context.agentDir, options.agentDirCandidates, strategy),
      migratePath("conversations", context.conversationsDir, options.conversationsDirCandidates, strategy),
    ],
  };
}

export function discoverOpenClawAppContext(options: DiscoverOpenClawAppContextOptions = {}): OpenClawAppContext {
  const config = readOpenClawRuntimeConfig({
    configPath: options.configPath,
    env: options.env,
  });
  const selection = selectAgentId(options, config);
  const context = resolveOpenClawContext({
    ...options,
    agentId: selection.agentId,
  });
  const migration = options.migrateLegacy
    ? migrateOpenClawAppState(context, options.migrateLegacy)
    : null;

  return {
    ...context,
    requestedAgentIds: selection.requestedAgentIds,
    matchedAgentId: selection.matchedAgentId,
    migration,
  };
}

export function detachOpenClawAppContext(options: DetachOpenClawAppContextOptions = {}): DetachOpenClawAppContextResult {
  const filesystem = options.filesystem ?? new NodeFileSystemHost();
  const context = resolveOpenClawContext(options);
  const effectiveAgentIds = normalizeCandidateList([context.agentId, ...(options.agentIds ?? [])]);
  const removeConfiguredAgent = options.removeConfiguredAgent ?? true;
  const clearDefaultWorkspaceIfMatches = options.clearDefaultWorkspaceIfMatches ?? true;
  let updatedConfig = false;
  let config = readOpenClawRuntimeConfig({
    configPath: options.configPath,
    env: options.env,
  });
  const removedAgentIds: string[] = [];

  if (config && removeConfiguredAgent) {
    const agents = config.agents?.list;
    if (Array.isArray(agents)) {
      const filtered = agents.filter((agent) => {
        const id = agent?.id?.trim();
        if (!id || !effectiveAgentIds.includes(id)) return true;
        removedAgentIds.push(id);
        return false;
      });
      if (filtered.length !== agents.length) {
        config = {
          ...config,
          agents: {
            ...config.agents,
            list: filtered,
          },
        };
        updatedConfig = true;
      }
    }

    if (clearDefaultWorkspaceIfMatches && config?.agents?.defaults?.workspace?.trim() === context.workspaceDir) {
      config = {
        ...config,
        agents: {
          ...config.agents,
          defaults: {
            ...config.agents?.defaults,
          },
        },
      };
      delete config.agents?.defaults?.workspace;
      updatedConfig = true;
    }

    if (updatedConfig) {
      writeOpenClawRuntimeConfig(config, {
        configPath: options.configPath,
        env: options.env,
      });
    }
  }

  const removedPaths: string[] = [];
  if (options.removeConversationsDir) {
    filesystem.remove(context.conversationsDir);
    removedPaths.push(context.conversationsDir);
  }
  if (options.removeAgentDir) {
    filesystem.remove(context.agentDir);
    removedPaths.push(context.agentDir);
  }
  if (options.removeWorkspaceDir) {
    filesystem.remove(context.workspaceDir);
    removedPaths.push(context.workspaceDir);
  }

  return {
    context,
    removedAgentIds,
    removedPaths,
    updatedConfig,
    config,
  };
}
