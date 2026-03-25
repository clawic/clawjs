import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { NodeProcessHost } from "../../host/process.ts";
import { demoAdapter } from "./demo-adapter.ts";
import { buildDemoRuntimeEnv } from "../../demo/index.ts";

test("demo adapter exposes status, models, channels, and auth without external runtimes", async () => {
  const host = new NodeProcessHost();
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-demo-adapter-"));
  const options = {
    adapter: "demo" as const,
    homeDir,
    env: buildDemoRuntimeEnv("settings-runtime-agents", {}),
  };

  const status = await demoAdapter.getStatus(host, options);
  assert.equal(status.adapter, "demo");
  assert.equal(status.cliAvailable, true);
  assert.equal(status.capabilityMap.channels.status, "ready");

  const models = await demoAdapter.listModels(host, options);
  assert.equal(models.length >= 3, true);
  assert.equal((await demoAdapter.getDefaultModel(host, options))?.modelId, "anthropic/claude-sonnet-4");

  await demoAdapter.setDefaultModel("openai/gpt-5-mini", host, options);
  assert.equal((await demoAdapter.getDefaultModel(host, options))?.modelId, "openai/gpt-5-mini");

  const authBefore = await demoAdapter.getProviderAuth(host, options);
  assert.equal(authBefore.anthropic?.hasAuth, true);
  demoAdapter.setApiKey("openai", "sk-demo-123456", options);
  const authAfter = await demoAdapter.getProviderAuth(host, options);
  assert.equal(authAfter.openai?.hasAuth, true);

  const channels = await demoAdapter.listChannels(host, options);
  assert.deepEqual(channels.map((channel) => channel.id), ["openclaw-gateway"]);
});
