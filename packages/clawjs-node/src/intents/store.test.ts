import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  patchIntentDomain,
  readAllIntentDomains,
  readIntentDomain,
  resolveIntentDomainPath,
  writeIntentDomain,
} from "./store.ts";

test("intent store round-trips domain records and supports patching", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-intents-store-"));

  writeIntentDomain(workspaceDir, "models", {
    defaultModel: "openai/gpt-5.4",
    logicalDefaults: {
      chat: "openai/gpt-5.4",
    },
  });
  patchIntentDomain(workspaceDir, "channels", {
    channels: {
      telegram: {
        enabled: true,
        secretRef: "telegram_support_bot_token",
        config: {
          webhookUrl: "https://example.com/telegram/webhook",
        },
      },
    },
  }, {
    channels: {},
  });

  assert.equal(readIntentDomain(workspaceDir, "models")?.defaultModel, "openai/gpt-5.4");
  assert.equal(readIntentDomain(workspaceDir, "channels")?.channels.telegram?.secretRef, "telegram_support_bot_token");
  assert.equal(fs.existsSync(resolveIntentDomainPath(workspaceDir, "models")), true);
  assert.equal(fs.existsSync(resolveIntentDomainPath(workspaceDir, "channels")), true);
  assert.deepEqual(Object.keys(readAllIntentDomains(workspaceDir)).sort(), ["channels", "models"]);
});
