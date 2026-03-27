import { NextRequest, NextResponse } from "next/server";

import { invalidateOpenClawAvailabilityCache } from "@/app/api/chat/route";
import { ensureClawWorkspaceReady, getClaw } from "@/lib/claw";
import {
  getE2EAiAuthStatus,
  getE2EIntegrationStatus,
  isE2EEnabled,
  setE2EAiAuthStatus,
  setE2EIntegrationStatus,
  syncAuthIntoIntegrationStatus,
  updateProviderAuth,
} from "@/lib/e2e";
import {
  getClawJSOpenClawAgentId,
} from "@/lib/openclaw-agent";
import { findCommand } from "@/lib/platform";

interface ProviderAuthInfo {
  provider: string;
  hasAuth: boolean;
  hasSubscription: boolean;
  hasApiKey: boolean;
  hasProfileApiKey: boolean;
  hasEnvKey: boolean;
  authType: "oauth" | "token" | "api_key" | "env" | null;
}

const ALL_PROVIDER_KEYS = [
  "anthropic", "openai", "openai-codex", "google", "google-gemini-cli",
  "deepseek", "mistral", "xai", "groq", "openrouter",
  "kimi-coding", "qwen",
] as const;

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  "openai-codex": "openai-codex/gpt-5.4",
  "openai": "openai/gpt-5.4",
  "anthropic": "anthropic/claude-opus-4-6",
  "google": "google/gemini-2.5-pro",
  "google-gemini-cli": "google-gemini-cli/gemini-2.5-pro",
  "deepseek": "deepseek/deepseek-chat",
  "mistral": "mistral/codestral-latest",
  "xai": "xai/grok-3",
  "groq": "groq/llama-3.3-70b-versatile",
  "openrouter": "openrouter/anthropic/claude-opus-4-6",
  "kimi-coding": "kimi-coding/k2p5",
  "qwen": "qwen/qwen3-coder",
};

function emptyProvider(provider: string): ProviderAuthInfo {
  return {
    provider,
    hasAuth: false,
    hasSubscription: false,
    hasApiKey: false,
    hasProfileApiKey: false,
    hasEnvKey: false,
    authType: null,
  };
}

function resolveModelId(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("/")) return trimmed;
  return PROVIDER_DEFAULT_MODELS[trimmed] ?? trimmed;
}

export async function GET() {
  if (isE2EEnabled()) {
    return NextResponse.json(getE2EAiAuthStatus());
  }

  const cliAvailable = !!(await findCommand("openclaw"));
  const providers = Object.fromEntries(ALL_PROVIDER_KEYS.map((key) => [key, emptyProvider(key)]));

  if (!cliAvailable) {
    return NextResponse.json({ cliAvailable: false, providers });
  }

  try {
    const claw = await getClaw();
    const summaries = await claw.auth.status();
    const defaultModel = await claw.models.getDefault().catch(() => undefined);

    for (const summary of Object.values(summaries)) {
      providers[summary.provider] = {
        provider: summary.provider,
        hasAuth: summary.hasAuth,
        hasSubscription: summary.hasSubscription,
        hasApiKey: summary.hasApiKey,
        hasProfileApiKey: summary.hasProfileApiKey,
        hasEnvKey: summary.hasEnvKey,
        authType: summary.authType,
      };
    }

    return NextResponse.json({
      cliAvailable: true,
      defaultModel,
      providers,
    });
  } catch (error) {
    return NextResponse.json({
      cliAvailable: true,
      error: error instanceof Error ? error.message : "Failed to check auth",
      providers,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action as string;

    if (action === "oauth") {
      return handleOAuthLaunch(body.provider as string);
    }
    if (action === "apikey") {
      return handleApiKeySave(body.provider as string, body.key as string);
    }
    if (action === "remove") {
      return handleAuthRemove(body.provider as string);
    }
    if (action === "set-default") {
      return handleSetDefault(body.model as string);
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auth failed" },
      { status: 500 },
    );
  }
}

async function handleOAuthLaunch(provider: string): Promise<NextResponse> {
  if (isE2EEnabled()) {
    const next = updateProviderAuth(provider, {
      hasAuth: true,
      hasSubscription: true,
      authType: "oauth",
    }, `${provider}/gpt-5.4`);
    syncAuthIntoIntegrationStatus(next);
    return NextResponse.json({
      ok: true,
      message: "Hermetic OAuth flow completed.",
    });
  }

  await ensureClawWorkspaceReady();
  const claw = await getClaw();
  await claw.auth.login(provider, { setDefault: true });
  invalidateOpenClawAvailabilityCache();

  return NextResponse.json({
    ok: true,
    message: "Sign-in started. Complete the flow in your browser, then come back here.",
  });
}

async function handleApiKeySave(provider: string, key: string): Promise<NextResponse> {
  const allowedProviders = ["anthropic", "openai", "google", "deepseek", "mistral", "xai", "groq", "openrouter"];
  if (!allowedProviders.includes(provider)) {
    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  }
  if (!key?.trim()) {
    return NextResponse.json({ error: "API key is required" }, { status: 400 });
  }

  if (isE2EEnabled()) {
    const next = updateProviderAuth(provider, {
      hasAuth: true,
      hasSubscription: true,
      hasApiKey: true,
      hasProfileApiKey: true,
      authType: "api_key",
    }, `${provider}/gpt-5.4`);
    syncAuthIntoIntegrationStatus(next);
    return NextResponse.json({ ok: true, profileId: `${provider}:manual` });
  }

  await ensureClawWorkspaceReady();
  const claw = await getClaw();
  const profileId = `${provider}:manual`;
  await claw.auth.saveApiKey(provider, key.trim(), { profileId });
  invalidateOpenClawAvailabilityCache();

  return NextResponse.json({ ok: true, profileId });
}

async function handleAuthRemove(provider: string): Promise<NextResponse> {
  if (!provider?.trim()) {
    return NextResponse.json({ error: "Provider is required" }, { status: 400 });
  }

  if (isE2EEnabled()) {
    const auth = getE2EAiAuthStatus();
    const current = auth.providers[provider.trim()];
    if (current) {
      auth.providers[provider.trim()] = {
        ...current,
        hasAuth: false,
        hasSubscription: false,
        hasApiKey: false,
        hasProfileApiKey: false,
        authType: null,
      };
      if (auth.defaultModel?.startsWith(`${provider.trim()}/`)) {
        auth.defaultModel = undefined;
      }
      setE2EAiAuthStatus(auth);
      syncAuthIntoIntegrationStatus(auth);
    }
    return NextResponse.json({ ok: true, removed: true });
  }

  const claw = await getClaw();
  const removed = claw.auth.removeProvider(provider.trim());

  if (removed > 0) {
    invalidateOpenClawAvailabilityCache();
  }

  return NextResponse.json({ ok: true, removed: removed > 0 });
}

async function handleSetDefault(model: string): Promise<NextResponse> {
  if (!model?.trim()) {
    return NextResponse.json({ error: "Model identifier is required" }, { status: 400 });
  }

  if (isE2EEnabled()) {
    const auth = getE2EAiAuthStatus();
    auth.defaultModel = resolveModelId(model);
    setE2EAiAuthStatus(auth);
    const status = getE2EIntegrationStatus();
    setE2EIntegrationStatus({
      ...status,
      openClaw: {
        ...status.openClaw,
        defaultModel: auth.defaultModel,
      },
    });
    return NextResponse.json({ ok: true, model: auth.defaultModel, agentId: "clawjs-demo-e2e" });
  }

  try {
    await ensureClawWorkspaceReady();
    const claw = await getClaw();
    const modelId = resolveModelId(model);
    await claw.models.setDefault(modelId);
    invalidateOpenClawAvailabilityCache();
    return NextResponse.json({ ok: true, model: modelId, agentId: getClawJSOpenClawAgentId() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set default model" },
      { status: 500 },
    );
  }
}
