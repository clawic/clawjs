import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { maskCredential } from "@clawjs/core";
import {
  buildOpenClawAuthLoginCommand,
  cleanupOpenClawAuthLoginState,
  filterOpenClawProviderAuthByIntent,
  getOpenClawOAuthProviderSummary,
  hasConfirmedOpenClawOAuthSubscription,
  isOpenClawProviderEnabled,
  launchOpenClawAuthLogin,
  loadAuthStore,
  persistProviderApiKey,
  buildOpenClawAuthDiagnostics,
  normalizeAuthSummaries,
  normalizeProviderAuth,
  readDirectOpenClawAuthState,
  readOpenClawProviderIntentMap,
  removeAuthProfilesForProvider,
  requiresExplicitProviderEnable,
  resolveOpenClawOAuthProvider,
  saveAuthStore,
  saveProviderApiKey,
  summarizeAuthProfiles,
  type DetachedAuthLauncher,
  type OpenClawAuthRunner,
  type OpenClawAuthStore,
} from "./openclaw-auth.ts";
import { parseOpenClawModelsStatus } from "../models/openclaw-models.ts";
import { setDefaultModel } from "./openclaw-auth.ts";

class FakeRunner implements OpenClawAuthRunner {
  private readonly handlers: Record<string, { stdout?: string; stderr?: string; fail?: boolean }>;

  constructor(handlers: Record<string, { stdout?: string; stderr?: string; fail?: boolean }>) {
    this.handlers = handlers;
  }

  async exec(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const key = `${command} ${args.join(" ")}`.trim();
    const handler = this.handlers[key];
    if (!handler) throw new Error(`missing handler for ${key}`);
    if (handler.fail) throw new Error(handler.stderr || "failed");
    return { stdout: handler.stdout || "", stderr: handler.stderr || "", exitCode: 0 };
  }
}

class FakeLauncher implements DetachedAuthLauncher {
  calls: Array<{ command: string; args: string[] }> = [];

  spawnDetachedPty(command: string, args: string[]) {
    this.calls.push({ command, args });
    return {
      pid: 4242,
      command,
      args,
    };
  }
}

test("normalizeProviderAuth merges model status and auth-store summaries", () => {
  const status = parseOpenClawModelsStatus(JSON.stringify({
    auth: {
      providers: [
        {
          provider: "openai",
          effective: { kind: "api_key" },
          profiles: { apiKey: 1 },
          env: { value: "sk-live-12345678" },
        },
      ],
    },
  }));

  const summary = normalizeProviderAuth(status, "openai", {
    version: 1,
    profiles: {
      "openai:manual": { type: "api_key", provider: "openai", key: "sk-live-12345678" },
    },
  });

  assert.equal(summary.hasAuth, true);
  assert.equal(summary.hasApiKey, true);
  assert.equal(summary.maskedCredential, "************5678");
});

test("summarizeAuthProfiles and normalizeAuthSummaries are stable", () => {
  const store: OpenClawAuthStore = {
    version: 1,
    profiles: {
      "anthropic:manual": { type: "api_key", provider: "anthropic", key: "anthropic-secret-abc123" },
      "openai:oauth": { type: "oauth", provider: "openai", token: "oauth-token-xyz987" },
    },
  };

  const summaries = summarizeAuthProfiles(store);
  assert.equal(summaries[0]?.profileId, "anthropic:manual");
  assert.equal(summaries[0]?.maskedCredential, maskCredential("anthropic-secret-abc123"));

  const status = parseOpenClawModelsStatus(JSON.stringify({
    auth: {
      providers: [
        { provider: "anthropic", effective: { kind: "api_key" }, profiles: { apiKey: 1 } },
        { provider: "openai", effective: { kind: "oauth" }, profiles: { oauth: 1 } },
      ],
    },
  }));

  const normalized = normalizeAuthSummaries(status, store);
  assert.equal(normalized.anthropic.authType, "api_key");
  assert.equal(normalized.openai.authType, "oauth");
});

test("normalizeProviderAuth ignores transient runtime oauth hints without persisted credentials", () => {
  const status = parseOpenClawModelsStatus(JSON.stringify({
    auth: {
      providers: [
        {
          provider: "openai-codex",
          effective: { kind: "oauth" },
          profiles: { oauth: 0, token: 0, apiKey: 0 },
        },
      ],
    },
  }));

  const summary = normalizeProviderAuth(status, "openai-codex", {
    version: 1,
    profiles: {},
  });

  assert.equal(summary.hasAuth, false);
  assert.equal(summary.hasSubscription, false);
  assert.equal(summary.authType, null);
});

test("normalizeAuthSummaries includes providers confirmed only by the auth store", () => {
  const status = parseOpenClawModelsStatus(JSON.stringify({
    auth: {
      providers: [],
    },
  }));

  const normalized = normalizeAuthSummaries(status, {
    version: 1,
    profiles: {
      "openai-codex:default": { type: "oauth", provider: "openai-codex", token: "oauth-token-xyz987" },
    },
  });

  assert.equal(normalized["openai-codex"]?.hasAuth, true);
  assert.equal(normalized["openai-codex"]?.hasSubscription, true);
  assert.equal(normalized["openai-codex"]?.authType, "oauth");
});

test("provider intent helpers respect explicit enable rules", () => {
  const intents = readOpenClawProviderIntentMap({
    providers: {
      "openai-codex": { enabled: true },
      anthropic: { enabled: false },
    },
  });

  assert.equal(requiresExplicitProviderEnable("openai-codex"), true);
  assert.equal(requiresExplicitProviderEnable("anthropic"), false);
  assert.equal(isOpenClawProviderEnabled("openai-codex", intents), true);
  assert.equal(isOpenClawProviderEnabled("anthropic", intents), false);
  assert.equal(isOpenClawProviderEnabled("openai-codex", {}), false);
  assert.equal(isOpenClawProviderEnabled("anthropic", {}), true);
});

test("provider auth summaries collapse openclaw oauth aliases", () => {
  const providers = {
    openai: {
      provider: "openai",
      hasAuth: true,
      hasSubscription: true,
      enabledForAgent: true,
    },
    "openai-codex": {
      provider: "openai-codex",
      hasAuth: false,
      hasSubscription: false,
      enabledForAgent: false,
    },
  };

  assert.equal(getOpenClawOAuthProviderSummary(providers, "openai-codex")?.provider, "openai");
  assert.equal(hasConfirmedOpenClawOAuthSubscription(providers, "openai-codex", {
    "openai-codex": { enabled: true },
  }), true);
  assert.equal(hasConfirmedOpenClawOAuthSubscription(providers, "openai-codex", {
    "openai-codex": { enabled: false },
  }), false);
});

test("filterOpenClawProviderAuthByIntent excludes disabled explicit providers", () => {
  const filtered = filterOpenClawProviderAuthByIntent({
    anthropic: { provider: "anthropic", hasAuth: true, hasSubscription: false },
    "openai-codex": { provider: "openai-codex", hasAuth: true, hasSubscription: true },
    qwen: { provider: "qwen", hasAuth: true, hasSubscription: true },
  }, {
    "openai-codex": { enabled: true },
    qwen: { enabled: false },
  });

  assert.deepEqual(Object.keys(filtered).sort(), ["anthropic", "openai-codex"]);
});

test("cleanupOpenClawAuthLoginState kills tracked and discovered login processes", () => {
  const killed: number[] = [];
  const commands: string[] = [];

  const result = cleanupOpenClawAuthLoginState({
    agentId: "clawjs-demo",
    currentPid: 123,
    callbackPort: 1455,
    pidCollector(command) {
      commands.push(command);
      if (command.includes("lsof")) return [456, 789];
      if (command.includes("pgrep")) return [789, 999];
      return [];
    },
    killer(pid) {
      killed.push(pid);
    },
  });

  assert.equal(result.clearedCurrentPid, true);
  assert.deepEqual(result.killedPids.sort((left, right) => left - right), [123, 456, 789, 999]);
  assert.deepEqual(killed.sort((left, right) => left - right), [123, 456, 789, 789, 999]);
  assert.equal(commands.some((entry) => entry.includes("lsof -ti :1455")), true);
  assert.equal(commands.some((entry) => entry.includes("pgrep -f \"openclaw models --agent clawjs-demo auth login\"")), true);
});

test("removeAuthProfilesForProvider deletes provider auth entries from the current agent dir", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-auth-"));
  const agentDir = path.join(tempRoot, "agent");

  saveAuthStore(agentDir, {
    version: 1,
    profiles: {
      "anthropic:manual": { type: "api_key", provider: "anthropic", key: "sk-12345678" },
      "openai:manual": { type: "api_key", provider: "openai", key: "sk-87654321" },
    },
  });

  const removed = removeAuthProfilesForProvider(agentDir, "anthropic");
  assert.equal(removed, 1);
  assert.equal(Object.keys(loadAuthStore(agentDir).profiles).length, 1);
});

test("setDefaultModel forwards resolved command args", async () => {
  const runner = new FakeRunner({
    "openclaw models --agent agent-1 set openai/gpt-5.4": { stdout: "{}" },
  });

  const modelId = await setDefaultModel("openai", runner, "agent-1");
  assert.equal(modelId, "openai/gpt-5.4");
});

test("setDefaultModel normalizes failure output", async () => {
  const runner = new FakeRunner({
    "openclaw models --agent agent-1 set openai/gpt-5.4": { fail: true, stderr: "boom" },
  });

  await assert.rejects(() => setDefaultModel("openai", runner, "agent-1"), /Failed to set default model openai\/gpt-5.4: boom/);
});

test("readDirectOpenClawAuthState combines runtime status and persisted auth", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-auth-state-"));
  const agentDir = path.join(tempRoot, "agent");
  saveAuthStore(agentDir, {
    version: 1,
    profiles: {
      "openai-codex:default": { type: "oauth", provider: "openai-codex", token: "oauth-token-xyz987" },
    },
  });

  const runner = new FakeRunner({
    "openclaw models --agent clawjs-demo status --json": {
      stdout: JSON.stringify({
        defaultModel: "openai/gpt-5.4",
        auth: {
          providers: [
            {
              provider: "openai",
              effective: { kind: "oauth" },
              profiles: { oauth: 1, token: 0, apiKey: 0 },
            },
          ],
        },
      }),
    },
  });

  const state = await readDirectOpenClawAuthState(agentDir, "clawjs-demo", runner);
  assert.equal(state.defaultModel, "openai/gpt-5.4");
  assert.equal(state.providerAuth["openai"]?.hasAuth, false);
  assert.equal(state.providerAuth["openai-codex"]?.hasSubscription, true);
});

test("resolveOpenClawOAuthProvider and build login command normalize aliases", () => {
  assert.equal(resolveOpenClawOAuthProvider("openai"), "openai-codex");
  assert.equal(resolveOpenClawOAuthProvider("gemini"), "google-gemini-cli");
  assert.equal(resolveOpenClawOAuthProvider("anthropic"), null);

  const command = buildOpenClawAuthLoginCommand("openai", "agent-1");
  assert.deepEqual(command.args, [
    "models",
    "--agent",
    "agent-1",
    "auth",
    "login",
    "--provider",
    "openai-codex",
    "--set-default",
  ]);
});

test("launchOpenClawAuthLogin spawns a detached login flow", () => {
  const launcher = new FakeLauncher();
  const result = launchOpenClawAuthLogin("google", launcher, "agent-1", { setDefault: false });

  assert.equal(result.requestedProvider, "google");
  assert.equal(result.provider, "google-gemini-cli");
  assert.equal(result.status, "launched");
  assert.equal(result.launchMode, "browser");
  assert.equal(result.pid, 4242);
  assert.deepEqual(launcher.calls, [{
    command: "openclaw",
    args: ["models", "--agent", "agent-1", "auth", "login", "--provider", "google-gemini-cli"],
  }]);
});

test("saveProviderApiKey upserts a masked profile summary", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-auth-save-"));
  const agentDir = path.join(tempRoot, "agent");

  const summary = saveProviderApiKey(agentDir, "anthropic", "sk-ant-secret-12345678");
  const saved = loadAuthStore(agentDir);

  assert.equal(summary.provider, "anthropic");
  assert.equal(summary.authType, "api_key");
  assert.equal(summary.maskedCredential, maskCredential("sk-ant-secret-12345678"));
  assert.equal(saved.profiles["anthropic:manual"]?.provider, "anthropic");
});

test("persistProviderApiKey uses runtime commands when available and falls back otherwise", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-auth-persist-"));
  const agentDir = path.join(tempRoot, "agent");
  const runner = new FakeRunner({
    "openclaw auth save": { stdout: "{}" },
  });

  const runtime = await persistProviderApiKey(agentDir, "openai", "sk-live-12345678", undefined, {
    runtimeCommand: {
      command: "openclaw",
      args: ["auth", "save"],
    },
    runner,
  });
  assert.equal(runtime.mode, "runtime");
  assert.equal(loadAuthStore(agentDir).profiles["openai:manual"]?.key, undefined);
  assert.equal(loadAuthStore(agentDir).profiles["openai:manual"]?.maskedCredential, "************5678");

  const fallback = await persistProviderApiKey(agentDir, "anthropic", "sk-ant-secret-12345678");
  assert.equal(fallback.mode, "store");
  assert.equal(loadAuthStore(agentDir).profiles["anthropic:manual"]?.key, "sk-ant-secret-12345678");
});

test("buildOpenClawAuthDiagnostics summarizes store state without exposing raw secrets", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-auth-diagnostics-"));
  const agentDir = path.join(tempRoot, "agent");
  saveAuthStore(agentDir, {
    version: 1,
    profiles: {
      "openai:manual": { type: "api_key", provider: "openai", key: "sk-live-12345678" },
    },
  });

  const diagnostics = buildOpenClawAuthDiagnostics(agentDir, "openai");
  assert.equal(diagnostics.authStorePath?.endsWith("auth-profiles.json"), true);
  assert.equal(diagnostics.profiles[0]?.maskedCredential, "************5678");
  assert.equal(JSON.stringify(diagnostics).includes("sk-live-12345678"), false);
});
