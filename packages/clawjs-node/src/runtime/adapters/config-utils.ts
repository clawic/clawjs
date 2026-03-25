import fs from "fs";
import os from "os";
import path from "path";

import { maskCredential, type ProviderAuthSummary } from "@clawjs/core";

export function resolveHomeDir(explicitHome?: string): string {
  return explicitHome?.trim() || os.homedir();
}

export function readJsonFile<TValue>(filePath: string): TValue | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as TValue;
  } catch {
    return null;
  }
}

export function readTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

export function parseTomlStringValue(raw: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = raw.match(new RegExp(`^\\s*${escaped}\\s*=\\s*"([^"]*)"\\s*$`, "m"));
  return match?.[1]?.trim() || null;
}

export function normalizeProviderAuthSummary(input: {
  provider: string;
  hasAuth?: boolean;
  hasSubscription?: boolean;
  hasApiKey?: boolean;
  hasProfileApiKey?: boolean;
  hasEnvKey?: boolean;
  authType?: ProviderAuthSummary["authType"];
  maskedCredential?: string | null;
}): ProviderAuthSummary {
  return {
    provider: input.provider,
    hasAuth: input.hasAuth ?? false,
    hasSubscription: input.hasSubscription ?? false,
    hasApiKey: input.hasApiKey ?? false,
    hasProfileApiKey: input.hasProfileApiKey ?? false,
    hasEnvKey: input.hasEnvKey ?? false,
    authType: input.authType ?? null,
    maskedCredential: input.maskedCredential ?? null,
  };
}

export function providerSummaryFromApiKey(provider: string, apiKey?: string | null): ProviderAuthSummary {
  const trimmed = apiKey?.trim() || "";
  return normalizeProviderAuthSummary({
    provider,
    hasAuth: !!trimmed,
    hasApiKey: !!trimmed,
    hasProfileApiKey: !!trimmed,
    authType: trimmed ? "api_key" : null,
    maskedCredential: maskCredential(trimmed),
  });
}

export function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
