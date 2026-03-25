import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { updateBindingSettings } from "./update.ts";

test("updateBindingSettings validates and auto-syncs bindings", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-bindings-update-"));

  const result = updateBindingSettings({
    workspaceDir,
    bindings: [{
      id: "tone",
      targetFile: "SOUL.md",
      mode: "managed_block",
      blockId: "tone",
      settingsPath: "tone",
    }],
    settingsSchema: {
      tone: { type: "string" },
    },
    values: {
      tone: "direct",
    },
    renderers: {
      tone: (settings) => `tone=${settings.tone}`,
    },
    autoSync: true,
  });

  assert.equal(result.syncResults.length, 1);
  assert.match(fs.readFileSync(path.join(workspaceDir, "SOUL.md"), "utf8"), /tone=direct/);
});

test("updateBindingSettings keeps optional managed blocks removed until re-enabled", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-bindings-optional-"));
  const filePath = path.join(workspaceDir, "SOUL.md");
  fs.writeFileSync(filePath, "manual\n");

  const result = updateBindingSettings({
    workspaceDir,
    bindings: [{
      id: "optional-tone",
      targetFile: "SOUL.md",
      mode: "managed_block",
      blockId: "tone",
      settingsPath: "tone",
      required: false,
    }],
    settingsSchema: {
      tone: { type: "string" },
    },
    values: {
      tone: "direct",
    },
    renderers: {
      "optional-tone": (settings) => `tone=${settings.tone}`,
    },
    autoSync: true,
  });

  assert.equal(result.syncResults[0]?.changed, false);
  assert.equal(fs.readFileSync(filePath, "utf8"), "manual\n");

  const reenabled = updateBindingSettings({
    workspaceDir,
    bindings: [{
      id: "optional-tone",
      targetFile: "SOUL.md",
      mode: "managed_block",
      blockId: "tone",
      settingsPath: "tone",
      required: false,
    }],
    settingsSchema: {
      tone: { type: "string" },
    },
    values: {
      tone: "warm",
    },
    renderers: {
      "optional-tone": (settings) => `tone=${settings.tone}`,
    },
    autoSync: true,
    reenableOptionalBindings: ["optional-tone"],
  });

  assert.equal(reenabled.syncResults[0]?.changed, true);
  assert.match(fs.readFileSync(filePath, "utf8"), /tone=warm/);
});
