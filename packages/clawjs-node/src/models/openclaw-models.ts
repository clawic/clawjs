import type { ModelSummary } from "@clawjs/core";

export interface OpenClawModelsRunner {
  exec(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export interface OpenClawModelsProviderRecord {
  provider: string;
  effective?: { kind?: string };
  profiles?: { count?: number; oauth?: number; token?: number; apiKey?: number };
  env?: { value?: string | null; source?: string };
}

export interface OpenClawModelsStatusJson {
  defaultModel?: string;
  auth?: {
    missingProvidersInUse?: string[];
    providersWithOAuth?: string[];
    providers?: OpenClawModelsProviderRecord[];
    oauth?: {
      providers?: Array<{
        provider: string;
        status: string;
        profiles: Array<{ profileId: string }>;
      }>;
    };
  };
}

export interface SetDefaultModelCommand {
  modelId: string;
  args: string[];
}

const FLAGSHIP_MODELS: Record<string, string> = {
  "openai-codex": "openai-codex/chatgpt-4o-latest",
  openai: "openai/gpt-4.1",
  anthropic: "anthropic/claude-sonnet-4-5-20250929",
  google: "google/gemini-2.5-pro",
  "google-gemini-cli": "google-gemini-cli/gemini-2.5-pro",
  deepseek: "deepseek/deepseek-chat",
  mistral: "mistral/codestral-latest",
  xai: "xai/grok-3",
  groq: "groq/llama-3.3-70b-versatile",
  openrouter: "openrouter/anthropic/claude-sonnet-4-5",
  "kimi-coding": "kimi-coding/k2p5",
  qwen: "qwen/qwen3-coder",
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseOpenClawModelsStatus(raw: string): OpenClawModelsStatusJson {
  const parsed = JSON.parse(raw) as Partial<OpenClawModelsStatusJson>;
  return {
    ...(normalizeString(parsed.defaultModel) ? { defaultModel: normalizeString(parsed.defaultModel) } : {}),
    ...(parsed.auth ? {
      auth: {
        ...(Array.isArray(parsed.auth.missingProvidersInUse) ? { missingProvidersInUse: parsed.auth.missingProvidersInUse.filter((value) => typeof value === "string") } : {}),
        ...(Array.isArray(parsed.auth.providersWithOAuth) ? { providersWithOAuth: parsed.auth.providersWithOAuth.filter((value) => typeof value === "string") } : {}),
        ...(Array.isArray(parsed.auth.providers) ? { providers: parsed.auth.providers.map((provider) => ({
          provider: normalizeString(provider?.provider),
          ...(provider?.effective ? { effective: { kind: normalizeString(provider.effective.kind) || undefined } } : {}),
          ...(provider?.profiles ? { profiles: {
            ...(typeof provider.profiles.count === "number" ? { count: provider.profiles.count } : {}),
            ...(typeof provider.profiles.oauth === "number" ? { oauth: provider.profiles.oauth } : {}),
            ...(typeof provider.profiles.token === "number" ? { token: provider.profiles.token } : {}),
            ...(typeof provider.profiles.apiKey === "number" ? { apiKey: provider.profiles.apiKey } : {}),
          } } : {}),
          ...(provider?.env ? { env: {
            ...(typeof provider.env.value === "string" ? { value: provider.env.value } : {}),
            ...(normalizeString(provider.env.source) ? { source: normalizeString(provider.env.source) } : {}),
          } } : {}),
        })) } : {}),
        ...(parsed.auth.oauth?.providers ? { oauth: {
          providers: parsed.auth.oauth.providers
            .map((provider) => ({
              provider: normalizeString(provider?.provider),
              status: normalizeString(provider?.status),
              profiles: Array.isArray(provider?.profiles)
                ? provider.profiles
                    .filter((profile) => normalizeString(profile?.profileId))
                    .map((profile) => ({ profileId: normalizeString(profile.profileId) }))
                : [],
            }))
            .filter((provider) => provider.provider.length > 0),
        } } : {}),
      },
    } : {}),
  };
}

export function providerHasAuth(provider?: OpenClawModelsProviderRecord | null): boolean {
  if (!provider) return false;
  const kind = normalizeString(provider.effective?.kind);
  if (kind && kind !== "none") return true;
  if ((provider.profiles?.oauth ?? 0) > 0) return true;
  if ((provider.profiles?.token ?? 0) > 0) return true;
  if ((provider.profiles?.apiKey ?? 0) > 0) return true;
  return !!normalizeString(provider.env?.value);
}

export function providerHasSubscription(provider?: OpenClawModelsProviderRecord | null): boolean {
  if (!provider) return false;
  const kind = normalizeString(provider.effective?.kind);
  if (kind === "oauth" || kind === "token") return true;
  return (provider.profiles?.oauth ?? 0) > 0 || (provider.profiles?.token ?? 0) > 0;
}

export function providerHasApiKey(provider?: OpenClawModelsProviderRecord | null): boolean {
  if (!provider) return false;
  return (provider.profiles?.apiKey ?? 0) > 0 || !!normalizeString(provider.env?.value);
}

export function resolveModelId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.includes("/")) return trimmed;
  return FLAGSHIP_MODELS[trimmed] ?? trimmed;
}

export function buildSetDefaultModelCommand(model: string, agentId?: string): SetDefaultModelCommand {
  const modelId = resolveModelId(model);
  if (!modelId) {
    throw new Error("model is required");
  }

  return {
    modelId,
    args: [
      "models",
      ...(agentId ? ["--agent", agentId] : []),
      "set",
      modelId,
    ],
  };
}

export function listOpenClawModels(status: OpenClawModelsStatusJson): ModelSummary[] {
  const providers = status.auth?.providers ?? [];
  return providers
    .filter((provider) => provider.provider.length > 0)
    .map((provider) => {
      const modelId = resolveModelId(provider.provider);
      return {
        id: modelId,
        provider: provider.provider,
        label: provider.provider,
        available: providerHasAuth(provider),
        ...(status.defaultModel ? { isDefault: status.defaultModel === modelId || status.defaultModel === provider.provider } : {}),
      };
    });
}

export function getDefaultOpenClawModel(status: OpenClawModelsStatusJson): ModelSummary | null {
  const defaultModel = status.defaultModel?.trim();
  if (!defaultModel) return null;

  const models = listOpenClawModels(status);
  return models.find((model) => model.id === defaultModel || model.provider === defaultModel) ?? {
    id: defaultModel,
    provider: defaultModel,
    label: defaultModel,
    available: true,
    isDefault: true,
  };
}

export async function readOpenClawModelsStatus(runner: OpenClawModelsRunner, agentId?: string): Promise<OpenClawModelsStatusJson> {
  const args = [
    "models",
    ...(agentId ? ["--agent", agentId] : []),
    "status",
    "--json",
  ];
  const result = await runner.exec("openclaw", args, { timeoutMs: 20_000 });
  return parseOpenClawModelsStatus(result.stdout || "{}");
}
