import path from "path";

import type {
  ConversationsObservedState,
  ModelsObservedState,
  ObservedDomain,
  PluginsObservedState,
  RuntimeObservedState,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";

export type ObservedStateByDomain = {
  runtime: RuntimeObservedState;
  workspace: unknown;
  models: ModelsObservedState;
  providers: unknown;
  channels: unknown;
  skills: unknown;
  plugins: PluginsObservedState;
  memory: unknown;
  scheduler: unknown;
  conversations: ConversationsObservedState;
};

export const OBSERVED_DOMAINS: ObservedDomain[] = [
  "runtime",
  "workspace",
  "models",
  "providers",
  "channels",
  "skills",
  "plugins",
  "memory",
  "scheduler",
  "conversations",
];

function nowIso(): string {
  return new Date().toISOString();
}

function writeJsonFile(filePath: string, payload: unknown, filesystem = new NodeFileSystemHost()): void {
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => {
    filesystem.writeTextAtomic(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  });
}

function readJsonFile<T>(filePath: string, filesystem = new NodeFileSystemHost()): T | null {
  try {
    return JSON.parse(filesystem.readText(filePath)) as T;
  } catch {
    return null;
  }
}

export function resolveObservedDir(workspaceDir: string): string {
  return path.join(workspaceDir, ".clawjs", "observed");
}

export function resolveObservedDomainPath(workspaceDir: string, domain: ObservedDomain): string {
  return path.join(resolveObservedDir(workspaceDir), `${domain}.json`);
}

export function readObservedDomain<TDomain extends ObservedDomain>(
  workspaceDir: string,
  domain: TDomain,
  filesystem = new NodeFileSystemHost(),
): ObservedStateByDomain[TDomain] | null {
  return readJsonFile<ObservedStateByDomain[TDomain]>(resolveObservedDomainPath(workspaceDir, domain), filesystem);
}

export function writeObservedDomain<TDomain extends ObservedDomain>(
  workspaceDir: string,
  domain: TDomain,
  value: Record<string, unknown>,
  filesystem = new NodeFileSystemHost(),
): ObservedStateByDomain[TDomain] {
  const filePath = resolveObservedDomainPath(workspaceDir, domain);
  filesystem.ensureDir(path.dirname(filePath));
  const next = {
    schemaVersion: 1,
    updatedAt: nowIso(),
    ...value,
  } as ObservedStateByDomain[TDomain];
  writeJsonFile(filePath, next, filesystem);
  return next;
}

export function readAllObservedDomains(workspaceDir: string, filesystem = new NodeFileSystemHost()): Partial<ObservedStateByDomain> {
  return Object.fromEntries(
    OBSERVED_DOMAINS
      .map((domain) => [domain, readObservedDomain(workspaceDir, domain, filesystem)] as const)
      .filter(([, value]) => value !== null),
  ) as Partial<ObservedStateByDomain>;
}
