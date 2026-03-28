import { execSync } from "child_process";

import { NextRequest, NextResponse } from "next/server";

import {
  buildOpenClawAuthLoginCommand,
  getOpenClawOAuthProviderSummary,
  isOpenClawProviderEnabled,
  readDirectOpenClawAuthState,
  readOpenClawProviderIntentMap,
  requiresExplicitProviderEnable,
} from "@clawjs/claw";

import { invalidateOpenClawAvailabilityCache } from "@/app/api/chat/route";
import { buildOpenClawCommandEnv, ensureClawWorkspaceReady, getClaw, resolveClawJSAgentDir, resolveClawJSWorkspaceDir } from "@/lib/claw";
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
  ensureClawJSOpenClawAgent,
} from "@/lib/openclaw-agent";
import { findCommand, findCommandFresh } from "@/lib/platform";
import { launchInMacTerminal } from "@/lib/terminal-launch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ProviderAuthInfo {
  provider: string;
  hasAuth: boolean;
  hasSubscription: boolean;
  hasApiKey: boolean;
  hasProfileApiKey: boolean;
  hasEnvKey: boolean;
  authType: "oauth" | "token" | "api_key" | "env" | null;
  enabledForAgent: boolean;
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

const OPENCLAW_CALLBACK_PORT = 1455;
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };
let currentAuthPid: number | null = null;
const OPENCLAW_ENV_PREFIXES = ["OPENCLAW_", "CLAWJS_"] as const;

function emptyProvider(provider: string, providerIntents = {}): ProviderAuthInfo {
  return {
    provider,
    hasAuth: false,
    hasSubscription: false,
    hasApiKey: false,
    hasProfileApiKey: false,
    hasEnvKey: false,
    authType: null,
    enabledForAgent: isOpenClawProviderEnabled(provider, providerIntents),
  };
}

function resolveModelId(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("/")) return trimmed;
  return PROVIDER_DEFAULT_MODELS[trimmed] ?? trimmed;
}

function collectOpenClawLaunchEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const selected = buildOpenClawCommandEnv(env);

  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (!OPENCLAW_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    selected[key] = value;
  }

  return selected;
}

function readProviderIntents(claw: Awaited<ReturnType<typeof getClaw>>) {
  return readOpenClawProviderIntentMap(claw.intent.get("providers"));
}

async function setProviderEnabledForAgent(
  claw: Awaited<ReturnType<typeof getClaw>>,
  provider: string,
  enabled: boolean,
  preferredAuthMode: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null = "oauth",
): Promise<void> {
  const current = readProviderIntents(claw);
  claw.intent.patch("providers", {
    providers: {
      ...current,
      [provider]: {
        ...(current[provider] ?? {}),
        enabled,
        preferredAuthMode,
      },
    },
  });
  if (!enabled) {
    await claw.intent.apply({ domains: ["providers"] });
  }
}

async function launchOAuthInMacTerminal(provider: string): Promise<void> {
  const binaryPath = await findCommandFresh("openclaw");
  if (!binaryPath) {
    throw new Error("OpenClaw is not installed or is not responding.");
  }

  const loginCommand = buildOpenClawAuthLoginCommand(provider, getClawJSOpenClawAgentId(), {
    setDefault: true,
  });

  await launchInMacTerminal(binaryPath, loginCommand.args, {
    cwd: resolveClawJSWorkspaceDir(),
    env: collectOpenClawLaunchEnv(),
  });
}

function killProcess(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // ignore already exited or inaccessible processes
  }
}

function collectPids(command: string): number[] {
  try {
    const stdout = execSync(command, { timeout: 3_000, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (!stdout) return [];
    return stdout
      .split(/\r?\n/)
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

function cleanupStaleOAuthState(agentId: string): void {
  if (currentAuthPid) {
    killProcess(currentAuthPid);
    currentAuthPid = null;
  }

  if (process.platform === "win32") return;

  for (const pid of collectPids(`lsof -ti :${OPENCLAW_CALLBACK_PORT}`)) {
    killProcess(pid);
  }

  for (const pid of collectPids(`pgrep -f "openclaw models --agent ${agentId} auth login"`)) {
    killProcess(pid);
  }
}

export async function GET() {
  if (isE2EEnabled()) {
    return NextResponse.json(getE2EAiAuthStatus(), { headers: NO_STORE_HEADERS });
  }

  const cliAvailable = !!(await findCommandFresh("openclaw"));
  const providers = Object.fromEntries(ALL_PROVIDER_KEYS.map((key) => [key, emptyProvider(key)]));

  if (!cliAvailable) {
    return NextResponse.json({ cliAvailable: false, providers }, { headers: NO_STORE_HEADERS });
  }

  try {
    await ensureClawJSOpenClawAgent();
    const claw = await getClaw();
    const providerIntents = readProviderIntents(claw);
    const direct = await readDirectOpenClawAuthState(resolveClawJSAgentDir(), getClawJSOpenClawAgentId(), undefined, {
      binaryPath: await findCommandFresh("openclaw") || undefined,
      homeDir: process.env.OPENCLAW_STATE_DIR,
      configPath: process.env.OPENCLAW_CONFIG_PATH,
      cwd: resolveClawJSWorkspaceDir(),
      env: collectOpenClawLaunchEnv(),
      timeoutMs: 20_000,
    });
    let summaries = direct.providerAuth;
    let defaultModelId = direct.defaultModel;

    if (Object.keys(summaries).length === 0 && !defaultModelId) {
      summaries = await claw.auth.status();
      defaultModelId = (await claw.models.getDefault().catch(() => null))?.modelId ?? null;
    }

    for (const provider of ALL_PROVIDER_KEYS) {
      const summary = getOpenClawOAuthProviderSummary(summaries, provider) ?? summaries[provider];
      providers[provider] = {
        ...emptyProvider(provider, providerIntents),
        ...(summary ? {
          hasAuth: summary.hasAuth,
          hasSubscription: summary.hasSubscription,
          hasApiKey: summary.hasApiKey,
          hasProfileApiKey: summary.hasProfileApiKey,
          hasEnvKey: summary.hasEnvKey,
          authType: summary.authType,
        } : {}),
        enabledForAgent: isOpenClawProviderEnabled(provider, providerIntents),
      };
    }

    return NextResponse.json({
      cliAvailable: true,
      defaultModel: defaultModelId,
      providers,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json({
      cliAvailable: true,
      error: error instanceof Error ? error.message : "Failed to check auth",
      providers,
    }, { headers: NO_STORE_HEADERS });
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
      enabledForAgent: true,
    }, `${provider}/gpt-5.4`);
    syncAuthIntoIntegrationStatus(next);
    return NextResponse.json({
      ok: true,
      message: "Hermetic OAuth flow completed.",
    });
  }

  const cliAvailable = !!(await findCommandFresh("openclaw"));
  if (!cliAvailable) {
    return NextResponse.json(
      { ok: false, error: "OpenClaw is not installed or is not responding." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  await ensureClawJSOpenClawAgent();
  cleanupStaleOAuthState(getClawJSOpenClawAgentId());
  const claw = await getClaw();
  const loginPlan = await claw.auth.prepareLogin(provider);

  if (loginPlan.status === "reused") {
    await setProviderEnabledForAgent(claw, provider, true, "oauth");
    const modelId = resolveModelId(provider);
    await claw.models.setDefault(modelId).catch(() => undefined);
    invalidateOpenClawAvailabilityCache();
    return NextResponse.json({
      ok: true,
      connected: true,
      reusedExistingAuth: true,
      model: modelId,
      loginPlan,
      message: loginPlan.message ?? "Existing provider auth was enabled for this agent.",
    }, { headers: NO_STORE_HEADERS });
  }

  if (process.platform === "darwin" && await findCommand("osascript")) {
    await launchOAuthInMacTerminal(provider);
    await setProviderEnabledForAgent(claw, provider, true, "oauth");
    currentAuthPid = null;
    invalidateOpenClawAvailabilityCache();

    return NextResponse.json({
      ok: true,
      launched: {
        provider,
        pid: null,
        command: "osascript",
        args: [],
      },
      launchMode: "terminal",
      message: "Sign-in started in Terminal. Complete the provider flow there and come back here.",
    }, { headers: NO_STORE_HEADERS });
  }

  const launched = await claw.auth.login(provider, { setDefault: true });
  currentAuthPid = typeof launched.pid === "number" ? launched.pid : null;
  invalidateOpenClawAvailabilityCache();

  return NextResponse.json({
    ok: true,
    launched,
    launchMode: launched.launchMode,
    message: launched.message ?? "Sign-in started. Complete the flow in your browser, then come back here.",
  }, { headers: NO_STORE_HEADERS });
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
      if (requiresExplicitProviderEnable(provider.trim())) {
        auth.providers[provider.trim()] = {
          ...current,
          enabledForAgent: false,
        };
      } else {
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
      }
      setE2EAiAuthStatus(auth);
      syncAuthIntoIntegrationStatus(auth);
    }
    return NextResponse.json({ ok: true, removed: true });
  }

  const claw = await getClaw();
  if (requiresExplicitProviderEnable(provider.trim())) {
    await setProviderEnabledForAgent(claw, provider.trim(), false, "oauth");
    invalidateOpenClawAvailabilityCache();
    return NextResponse.json({ ok: true, removed: false, disabledForAgent: true });
  }

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
