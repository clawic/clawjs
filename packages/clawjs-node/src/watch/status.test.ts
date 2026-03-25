import test from "node:test";
import assert from "node:assert/strict";
import type { ProviderAuthSummary } from "@clawjs/core";

import { watchPolledValue, watchProviderStatus, watchRuntimeStatus } from "./status.ts";
import { createMockRuntimeProbeStatus } from "../runtime/test-helpers.ts";

test("watchPolledValue emits initial and changed values only", async () => {
  let current = { value: 1 };
  const seen: number[] = [];
  const stop = watchPolledValue(async () => current, (value) => {
    seen.push(value.value);
  }, { intervalMs: 15 });

  await new Promise((resolve) => setTimeout(resolve, 40));
  current = { value: 2 };
  await new Promise((resolve) => setTimeout(resolve, 40));
  stop();

  assert.deepEqual(seen, [1, 2]);
});

test("watchRuntimeStatus reuses the generic poll watcher", async () => {
  let available = false;
  const seen: boolean[] = [];
  const stop = watchRuntimeStatus(async () => createMockRuntimeProbeStatus({
    adapter: "openclaw",
    runtimeName: "OpenClaw",
    version: available ? "1.2.3" : null,
    cliAvailable: available,
    gatewayAvailable: false,
    capabilities: {
      version: available,
      modelsStatus: available,
      agentsList: available,
      gatewayCall: false,
    },
    diagnostics: {},
  }), (status) => {
    seen.push(status.cliAvailable);
  }, { intervalMs: 15 });

  await new Promise((resolve) => setTimeout(resolve, 35));
  available = true;
  await new Promise((resolve) => setTimeout(resolve, 40));
  stop();

  assert.deepEqual(seen, [false, true]);
});

test("watchProviderStatus emits normalized provider changes", async () => {
  let providers: Record<string, ProviderAuthSummary> = {
    openai: {
      provider: "openai",
      hasAuth: false,
      hasSubscription: false,
      hasApiKey: false,
      hasProfileApiKey: false,
      hasEnvKey: false,
      maskedCredential: null,
      authType: null,
    },
  };
  const seen: boolean[] = [];
  const stop = watchProviderStatus(async () => providers, (status) => {
    seen.push(status.openai.hasAuth);
  }, { intervalMs: 15 });

  await new Promise((resolve) => setTimeout(resolve, 35));
  providers = {
    openai: {
      ...providers.openai,
      hasAuth: true,
      hasApiKey: true,
      hasProfileApiKey: true,
      authType: "api_key",
      maskedCredential: "*******1234",
    },
  };
  await new Promise((resolve) => setTimeout(resolve, 40));
  stop();

  assert.deepEqual(seen, [false, true]);
});
