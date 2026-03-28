import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveOpenClawSetupStatus,
  getOpenClawSetupStatus,
  hasOpenClawProviderAuth,
} from "./openclaw-setup.ts";

test("deriveOpenClawSetupStatus keeps setup complete once the OpenClaw agent exists", () => {
  const status = deriveOpenClawSetupStatus({
    context: {
      configuredAgent: {
        id: "clawjs-demo",
      },
      workspaceDir: "/tmp/clawjs-demo",
    },
    defaultModel: null,
    providerAuth: {},
  });

  assert.equal(status.agentConfigured, true);
  assert.equal(status.modelConfigured, false);
  assert.equal(status.authConfigured, false);
  assert.equal(status.ready, false);
  assert.equal(status.needsSetup, false);
  assert.equal(status.needsAuth, true);
});

test("hasOpenClawProviderAuth matches provider aliases such as openai-codex -> openai", () => {
  assert.equal(hasOpenClawProviderAuth("openai-codex", {
    openai: {
      provider: "openai",
      hasAuth: true,
      hasSubscription: true,
      hasApiKey: false,
      hasProfileApiKey: false,
      hasEnvKey: false,
      authType: "oauth",
    },
  }), true);
});

test("getOpenClawSetupStatus requires a configured agent instead of only a local manifest", async () => {
  const status = await getOpenClawSetupStatus({
    runtime: {
      context: () => ({
        stateDir: "/tmp/state",
        configPath: "/tmp/openclaw.json",
        agentId: "clawjs-demo",
        workspaceDir: "/tmp/clawjs-demo",
        agentDir: "/tmp/agent",
        conversationsDir: "/tmp/conversations",
        configuredAgent: null,
        cliAgent: null,
        cliAgentDetected: false,
        gateway: null,
      }),
    },
    models: {
      getDefault: async () => ({
        modelId: "openai/gpt-5.4",
        provider: "openai",
      }),
    },
    auth: {
      status: async () => ({
        openai: {
          provider: "openai",
          hasAuth: true,
          hasSubscription: true,
          hasApiKey: true,
          hasProfileApiKey: true,
          hasEnvKey: false,
          authType: "api_key",
        },
      }),
    },
  });

  assert.equal(status.agentConfigured, false);
  assert.equal(status.modelConfigured, true);
  assert.equal(status.authConfigured, true);
  assert.equal(status.ready, false);
  assert.equal(status.needsSetup, true);
  assert.equal(status.needsAuth, false);
});
