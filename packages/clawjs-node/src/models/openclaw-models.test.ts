import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSetDefaultModelCommand,
  getDefaultOpenClawModel,
  listOpenClawModels,
  parseOpenClawModelsStatus,
  providerHasAuth,
  resolveModelId,
} from "./openclaw-models.ts";

test("parseOpenClawModelsStatus normalizes provider output", () => {
  const status = parseOpenClawModelsStatus(JSON.stringify({
    defaultModel: "openai-codex/chatgpt-4o-latest",
    auth: {
      providers: [
        {
          provider: "openai-codex",
          effective: { kind: "oauth" },
          profiles: { count: 1, oauth: 1, token: 0, apiKey: 0 },
        },
        {
          provider: "openai",
          effective: { kind: "none" },
          profiles: { count: 0, oauth: 0, token: 0, apiKey: 0 },
        },
      ],
    },
  }));

  assert.equal(status.defaultModel, "openai-codex/chatgpt-4o-latest");
  assert.equal(status.auth?.providers?.length, 2);
  assert.equal(providerHasAuth(status.auth?.providers?.[0]), true);
  assert.equal(providerHasAuth(status.auth?.providers?.[1]), false);
});

test("listOpenClawModels marks the active default model", () => {
  const status = parseOpenClawModelsStatus(JSON.stringify({
    defaultModel: "openai-codex/chatgpt-4o-latest",
    auth: {
      providers: [
        { provider: "openai-codex", effective: { kind: "oauth" }, profiles: { oauth: 1 } },
        { provider: "openai", effective: { kind: "none" }, profiles: { apiKey: 0 } },
      ],
    },
  }));

  const models = listOpenClawModels(status);
  assert.equal(models.length, 2);
  assert.equal(models[0]?.isDefault, true);
  assert.equal(models[1]?.available, false);
  assert.equal(getDefaultOpenClawModel(status)?.id, "openai-codex/chatgpt-4o-latest");
});

test("resolveModelId and set-default command builder handle provider aliases", () => {
  assert.equal(resolveModelId("openai"), "openai/gpt-4.1");

  const command = buildSetDefaultModelCommand("openai", "agent-1");
  assert.equal(command.modelId, "openai/gpt-4.1");
  assert.deepEqual(command.args, ["models", "--agent", "agent-1", "set", "openai/gpt-4.1"]);
});
