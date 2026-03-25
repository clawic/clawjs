import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  readBindingStore,
  readSettingsSchemaRecord,
  readSettingsValuesRecord,
  resolveBindingsPath,
  resolveSettingsSchemaPath,
  resolveSettingsValuesPath,
  validateSettingsUpdate,
  writeBindingStore,
  writeSettingsSchemaRecord,
  writeSettingsValuesRecord,
} from "./store.ts";

test("binding projections and file intents round-trip in .clawjs/projections and .clawjs/intents", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-bindings-store-"));

  writeBindingStore(workspaceDir, [{
    id: "tone",
    targetFile: "SOUL.md",
    mode: "managed_block",
    blockId: "tone",
    settingsPath: "tone",
  }]);
  writeSettingsSchemaRecord(workspaceDir, {
    tone: { type: "string", default: "balanced" },
    nested: { type: "object", properties: { enabled: { type: "boolean" } }, required: ["enabled"] },
  });
  writeSettingsValuesRecord(workspaceDir, {
    tone: "balanced",
    nested: { enabled: true },
  });

  assert.equal(fs.existsSync(resolveBindingsPath(workspaceDir)), true);
  assert.equal(fs.existsSync(resolveSettingsSchemaPath(workspaceDir)), true);
  assert.equal(fs.existsSync(resolveSettingsValuesPath(workspaceDir)), true);
  assert.match(resolveBindingsPath(workspaceDir), /\.clawjs\/projections\/file-bindings\.json$/);
  assert.match(resolveSettingsSchemaPath(workspaceDir), /\.clawjs\/projections\/settings-schema\.json$/);
  assert.match(resolveSettingsValuesPath(workspaceDir), /\.clawjs\/intents\/files\.json$/);
  assert.equal(readBindingStore(workspaceDir).bindings.length, 1);
  assert.equal((readSettingsSchemaRecord(workspaceDir).settingsSchema.tone as { type: string }).type, "string");
  assert.equal((readSettingsValuesRecord(workspaceDir).values.nested as { enabled: boolean }).enabled, true);
});

test("validateSettingsUpdate reports invalid values", () => {
  const issues = validateSettingsUpdate({
    tone: { type: "string" },
    nested: { type: "object", properties: { enabled: { type: "boolean" } }, required: ["enabled"] },
  }, {
    tone: 42,
    nested: {},
  });

  assert.deepEqual(issues, [
    { path: "tone", message: "expected string" },
    { path: "nested.enabled", message: "missing required value" },
  ]);
});
