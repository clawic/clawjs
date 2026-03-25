import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { maskCredential } from "@clawjs/core";
import {
  buildOpenClawAuthLoginCommand,
  launchOpenClawAuthLogin,
  loadAuthStore,
  persistProviderApiKey,
  buildOpenClawAuthDiagnostics,
  normalizeAuthSummaries,
  normalizeProviderAuth,
  removeAuthProfilesForProvider,
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

test("removeAuthProfilesForProvider deletes fallback auth files", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-auth-"));
  const agentDir = path.join(tempRoot, "agent");
  const legacyDir = path.join(tempRoot, "legacy-agent");

  saveAuthStore(agentDir, {
    version: 1,
    profiles: {
      "anthropic:manual": { type: "api_key", provider: "anthropic", key: "sk-12345678" },
      "openai:manual": { type: "api_key", provider: "openai", key: "sk-87654321" },
    },
  });
  saveAuthStore(legacyDir, {
    version: 1,
    profiles: {
      "anthropic:legacy": { type: "token", provider: "anthropic", token: "tok-1111" },
    },
  });

  const removed = removeAuthProfilesForProvider(agentDir, "anthropic", undefined, [legacyDir]);
  assert.equal(removed, 2);
  assert.equal(Object.keys(loadAuthStore(agentDir).profiles).length, 1);
  assert.equal(Object.keys(loadAuthStore(legacyDir).profiles).length, 0);
});

test("setDefaultModel forwards resolved command args", async () => {
  const runner = new FakeRunner({
    "openclaw models --agent agent-1 set openai/gpt-4.1": { stdout: "{}" },
  });

  const modelId = await setDefaultModel("openai", runner, "agent-1");
  assert.equal(modelId, "openai/gpt-4.1");
});

test("setDefaultModel normalizes failure output", async () => {
  const runner = new FakeRunner({
    "openclaw models --agent agent-1 set openai/gpt-4.1": { fail: true, stderr: "boom" },
  });

  await assert.rejects(() => setDefaultModel("openai", runner, "agent-1"), /Failed to set default model openai\/gpt-4.1: boom/);
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

  assert.equal(result.provider, "google-gemini-cli");
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
