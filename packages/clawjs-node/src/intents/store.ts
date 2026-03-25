import path from "path";

import type {
  ChannelsIntentState,
  ConversationsIntentState,
  FilesIntentState,
  IntentDomain,
  ModelsIntentState,
  PluginsIntentState,
  ProvidersIntentState,
  RuntimeIntentState,
  SpeechIntentState,
  SkillsIntentState,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";

export type IntentStateByDomain = {
  runtime: RuntimeIntentState;
  models: ModelsIntentState;
  providers: ProvidersIntentState;
  channels: ChannelsIntentState;
  skills: SkillsIntentState;
  plugins: PluginsIntentState;
  files: FilesIntentState;
  conversations: ConversationsIntentState;
  speech: SpeechIntentState;
};

export const INTENT_DOMAINS: IntentDomain[] = [
  "runtime",
  "models",
  "providers",
  "channels",
  "skills",
  "plugins",
  "files",
  "conversations",
  "speech",
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

export function resolveIntentsDir(workspaceDir: string): string {
  return path.join(workspaceDir, ".clawjs", "intents");
}

export function resolveIntentDomainPath(workspaceDir: string, domain: IntentDomain): string {
  return path.join(resolveIntentsDir(workspaceDir), `${domain}.json`);
}

export function readIntentDomain<TDomain extends IntentDomain>(
  workspaceDir: string,
  domain: TDomain,
  filesystem = new NodeFileSystemHost(),
): IntentStateByDomain[TDomain] | null {
  return readJsonFile<IntentStateByDomain[TDomain]>(resolveIntentDomainPath(workspaceDir, domain), filesystem);
}

export function writeIntentDomain<TDomain extends IntentDomain>(
  workspaceDir: string,
  domain: TDomain,
  value: Omit<IntentStateByDomain[TDomain], "schemaVersion" | "updatedAt"> & Partial<Pick<IntentStateByDomain[TDomain], "schemaVersion" | "updatedAt">>,
  filesystem = new NodeFileSystemHost(),
): IntentStateByDomain[TDomain] {
  const filePath = resolveIntentDomainPath(workspaceDir, domain);
  filesystem.ensureDir(path.dirname(filePath));
  const next = {
    schemaVersion: 1,
    updatedAt: nowIso(),
    ...value,
  } as IntentStateByDomain[TDomain];
  writeJsonFile(filePath, next, filesystem);
  return next;
}

export function patchIntentDomain<TDomain extends IntentDomain>(
  workspaceDir: string,
  domain: TDomain,
  patch: Partial<IntentStateByDomain[TDomain]>,
  defaults: Omit<IntentStateByDomain[TDomain], "schemaVersion" | "updatedAt">,
  filesystem = new NodeFileSystemHost(),
): IntentStateByDomain[TDomain] {
  const current = readIntentDomain(workspaceDir, domain, filesystem) ?? ({
    schemaVersion: 1,
    updatedAt: nowIso(),
    ...defaults,
  } as IntentStateByDomain[TDomain]);
  return writeIntentDomain(workspaceDir, domain, {
    ...current,
    ...patch,
  }, filesystem);
}

export function readAllIntentDomains(workspaceDir: string, filesystem = new NodeFileSystemHost()): Partial<IntentStateByDomain> {
  return Object.fromEntries(
    INTENT_DOMAINS
      .map((domain) => [domain, readIntentDomain(workspaceDir, domain, filesystem)] as const)
      .filter(([, value]) => value !== null),
  ) as Partial<IntentStateByDomain>;
}
