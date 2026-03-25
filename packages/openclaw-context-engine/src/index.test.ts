// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

import plugin, { ENGINE_ID, resetClawJsContextEngineStateForTests } from "./index.js";

test("context engine package exposes native manifest and extension entry", () => {
  const root = path.dirname(new URL(import.meta.url).pathname);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "..", "openclaw.plugin.json"), "utf8"));
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "..", "package.json"), "utf8"));

  assert.equal(manifest.id, ENGINE_ID);
  assert.equal(manifest.kind, "context-engine");
  assert.deepEqual(packageJson.openclaw.extensions, ["./src/index.js"]);
});

test("register exposes the context engine factory", async () => {
  resetClawJsContextEngineStateForTests();
  let engineId = null;
  let factory = null;

  plugin.register({
    pluginConfig: {
      systemPromptAddition: "Use ClawJS context.",
    },
    registerContextEngine(id, value) {
      engineId = id;
      factory = value;
    },
  });

  assert.equal(engineId, ENGINE_ID);
  assert.equal(typeof factory, "function");

  const engine = await factory();
  const assembled = await engine.assemble({ messages: [{ role: "user", content: "hello" }] });
  const compacted = await engine.compact({});

  assert.equal(engine.info.id, ENGINE_ID);
  assert.equal(assembled.systemPromptAddition, "Use ClawJS context.");
  assert.equal(compacted.ok, true);
  assert.equal(compacted.compacted, false);
});
