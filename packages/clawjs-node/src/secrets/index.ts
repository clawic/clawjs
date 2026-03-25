import os from "os";
import path from "path";

import type { CommandRunner } from "../runtime/contracts.ts";

export const DEFAULT_SECRETS_PROXY_PATH = path.join(os.homedir(), "bin", "secrets-proxy");
export const DEFAULT_SECRETS_VAULT_APP_PATH = path.join(os.homedir(), "Applications", "Secrets Vault.app");

export interface SecretProxyMetadata {
  name: string;
  kind?: string;
  notes?: string;
  allowedHosts: string[];
  allowedHeaderNames: string[];
  readOnly: boolean;
  allowInURL: boolean;
  allowInRequestBody: boolean;
  allowInsecureTransport: boolean;
  allowLocalNetwork: boolean;
  requiresVPN?: boolean;
  updatedAt?: string;
  raw: Record<string, unknown>;
}

export interface SecretDoctorResult {
  ok: boolean;
  output: string;
}

export interface EnsureSecretReferenceInput {
  name: string;
  kind?: string;
  notes?: string;
  allowedHosts: string[];
  allowedHeaderNames?: string[];
  readOnly?: boolean;
  allowInURL?: boolean;
  allowInRequestBody?: boolean;
  allowInsecureTransport?: boolean;
  allowLocalNetwork?: boolean;
}

export interface EnsureSecretReferenceResult {
  status: "configured" | "missing" | "update_required";
  secretName: string;
  requirement: Required<EnsureSecretReferenceInput>;
  existing: SecretProxyMetadata | null;
  missingHosts: string[];
  missingHeaderNames: string[];
  mismatched: Array<"kind" | "readOnly" | "allowInURL" | "allowInRequestBody" | "allowInsecureTransport" | "allowLocalNetwork">;
  instructions: {
    openAppPath: string;
    summary: string;
  };
}

export interface EnsureTelegramBotSecretReferenceInput {
  name: string;
  apiBaseUrl?: string;
  notes?: string;
  readOnly?: boolean;
}

function normalizeArray(values: unknown): string[] {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function resolveSecretsProxyPath(env?: NodeJS.ProcessEnv): string {
  return env?.CLAWJS_SECRETS_PROXY_PATH?.trim()
    || process.env.CLAWJS_SECRETS_PROXY_PATH?.trim()
    || DEFAULT_SECRETS_PROXY_PATH;
}

function buildRunnerEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(env ?? {}),
  };
}

function normalizeSecretMetadata(raw: Record<string, unknown>): SecretProxyMetadata {
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    kind: typeof raw.kind === "string" ? raw.kind : undefined,
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
    allowedHosts: normalizeArray(raw.allowedHosts),
    allowedHeaderNames: normalizeArray(raw.allowedHeaderNames),
    readOnly: raw.readOnly === true,
    allowInURL: raw.allowInURL === true,
    allowInRequestBody: raw.allowInRequestBody === true,
    allowInsecureTransport: raw.allowInsecureTransport === true,
    allowLocalNetwork: raw.allowLocalNetwork === true,
    requiresVPN: typeof raw.requiresVPN === "boolean" ? raw.requiresVPN : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    raw,
  };
}

async function runProxyJsonCommand<TResult>(
  runner: CommandRunner,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<TResult> {
  const result = await runner.exec(resolveSecretsProxyPath(env), args, {
    env: buildRunnerEnv(env),
    timeoutMs: 15_000,
  });
  return JSON.parse(result.stdout || "null") as TResult;
}

export async function listSecrets(
  runner: CommandRunner,
  options: { search?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<SecretProxyMetadata[]> {
  const args = ["list-secrets"];
  if (options.search?.trim()) {
    args.push("--search", options.search.trim());
  }
  const payload = await runProxyJsonCommand<unknown[]>(runner, args, options.env);
  return Array.isArray(payload)
    ? payload
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map(normalizeSecretMetadata)
    : [];
}

export async function describeSecret(
  runner: CommandRunner,
  options: { name: string; env?: NodeJS.ProcessEnv },
): Promise<SecretProxyMetadata | null> {
  const payload = await runProxyJsonCommand<unknown[]>(
    runner,
    ["describe-secret", "--name", options.name.trim()],
    options.env,
  );
  if (!Array.isArray(payload) || payload.length === 0 || !payload[0] || typeof payload[0] !== "object") {
    return null;
  }
  return normalizeSecretMetadata(payload[0] as Record<string, unknown>);
}

export async function doctorKeychain(
  runner: CommandRunner,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<SecretDoctorResult> {
  try {
    const result = await runner.exec(resolveSecretsProxyPath(options.env), ["doctor-keychain"], {
      env: buildRunnerEnv(options.env),
      timeoutMs: 10_000,
    });
    return {
      ok: true,
      output: (result.stdout || result.stderr || "").trim(),
    };
  } catch (error) {
    const detail = (error as { result?: { stdout?: string; stderr?: string } }).result;
    return {
      ok: false,
      output: (detail?.stderr || detail?.stdout || (error instanceof Error ? error.message : String(error))).trim(),
    };
  }
}

function normalizeRequirement(input: EnsureSecretReferenceInput): Required<EnsureSecretReferenceInput> {
  return {
    name: input.name.trim(),
    kind: input.kind?.trim() || "",
    notes: input.notes?.trim() || "",
    allowedHosts: [...new Set(input.allowedHosts.map((value) => value.trim()).filter(Boolean))],
    allowedHeaderNames: [...new Set((input.allowedHeaderNames ?? []).map((value) => value.trim()).filter(Boolean))],
    readOnly: input.readOnly ?? false,
    allowInURL: input.allowInURL ?? false,
    allowInRequestBody: input.allowInRequestBody ?? false,
    allowInsecureTransport: input.allowInsecureTransport ?? false,
    allowLocalNetwork: input.allowLocalNetwork ?? false,
  };
}

function summarizeEnsureResult(
  status: EnsureSecretReferenceResult["status"],
  secretName: string,
  missingHosts: string[],
  missingHeaderNames: string[],
  mismatched: EnsureSecretReferenceResult["mismatched"],
): string {
  if (status === "configured") {
    return `Secret ${secretName} already matches the required metadata.`;
  }
  if (status === "missing") {
    return `Secret ${secretName} does not exist in Secrets Vault yet.`;
  }
  const parts: string[] = [];
  if (missingHosts.length > 0) parts.push(`missing hosts: ${missingHosts.join(", ")}`);
  if (missingHeaderNames.length > 0) parts.push(`missing headers: ${missingHeaderNames.join(", ")}`);
  if (mismatched.length > 0) parts.push(`mismatched flags: ${mismatched.join(", ")}`);
  return `Secret ${secretName} exists but needs an update (${parts.join("; ")}).`;
}

export async function ensureSecretReference(
  runner: CommandRunner,
  input: EnsureSecretReferenceInput,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<EnsureSecretReferenceResult> {
  const requirement = normalizeRequirement(input);
  const existing = await describeSecret(runner, {
    name: requirement.name,
    env: options.env,
  });

  const missingHosts = existing
    ? requirement.allowedHosts.filter((host) => !existing.allowedHosts.includes(host))
    : [...requirement.allowedHosts];
  const missingHeaderNames = existing
    ? requirement.allowedHeaderNames.filter((header) => !existing.allowedHeaderNames.includes(header))
    : [...requirement.allowedHeaderNames];
  const mismatched: EnsureSecretReferenceResult["mismatched"] = [];

  if (existing) {
    if (requirement.kind && existing.kind && existing.kind !== requirement.kind) {
      mismatched.push("kind");
    }
    if (existing.readOnly !== requirement.readOnly) mismatched.push("readOnly");
    if (existing.allowInURL !== requirement.allowInURL) mismatched.push("allowInURL");
    if (existing.allowInRequestBody !== requirement.allowInRequestBody) mismatched.push("allowInRequestBody");
    if (existing.allowInsecureTransport !== requirement.allowInsecureTransport) mismatched.push("allowInsecureTransport");
    if (existing.allowLocalNetwork !== requirement.allowLocalNetwork) mismatched.push("allowLocalNetwork");
  }

  const status: EnsureSecretReferenceResult["status"] = !existing
    ? "missing"
    : missingHosts.length > 0 || missingHeaderNames.length > 0 || mismatched.length > 0
      ? "update_required"
      : "configured";

  return {
    status,
    secretName: requirement.name,
    requirement,
    existing,
    missingHosts,
    missingHeaderNames,
    mismatched,
    instructions: {
      openAppPath: DEFAULT_SECRETS_VAULT_APP_PATH,
      summary: summarizeEnsureResult(status, requirement.name, missingHosts, missingHeaderNames, mismatched),
    },
  };
}

export async function ensureHttpSecretReference(
  runner: CommandRunner,
  input: EnsureSecretReferenceInput,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<EnsureSecretReferenceResult> {
  return ensureSecretReference(runner, input, options);
}

function resolveTelegramHost(apiBaseUrl?: string): string {
  const url = new URL((apiBaseUrl?.trim() || "https://api.telegram.org").replace(/\/+$/, ""));
  return url.host;
}

export async function ensureTelegramBotSecretReference(
  runner: CommandRunner,
  input: EnsureTelegramBotSecretReferenceInput,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<EnsureSecretReferenceResult> {
  return ensureSecretReference(runner, {
    name: input.name,
    notes: input.notes ?? "Telegram bot token for ClawJS.",
    allowedHosts: [resolveTelegramHost(input.apiBaseUrl)],
    allowedHeaderNames: [],
    readOnly: input.readOnly ?? false,
    allowInURL: true,
    allowInRequestBody: false,
    allowInsecureTransport: false,
    allowLocalNetwork: false,
  }, options);
}

export { resolveSecretsProxyPath };
