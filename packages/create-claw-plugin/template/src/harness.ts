import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { activatePlugin, pluginManifest } from "./index.js";

const mode = process.argv[2] ?? "example";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadManifest() {
  const manifestPath = path.join(rootDir, "plugin.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw) as {
    id: string;
    name: string;
    version: string;
    verification?: { exampleConfig?: string };
  };
}

async function loadExampleConfig(manifest: { verification?: { exampleConfig?: string } }) {
  const configuredPath = manifest.verification?.exampleConfig ?? "./examples/config.json";
  const configPath = path.resolve(rootDir, configuredPath);
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function main() {
  const manifest = await loadManifest();
  const config = await loadExampleConfig(manifest);
  const plugin = await activatePlugin(config);
  const before = await plugin.hooks.beforeSessionStart({
    sessionId: "session-demo",
    message: "Start support session",
  });
  const after = await plugin.hooks.afterAssistantReply({
    sessionId: "session-demo",
    message: "Reply sent",
  });
  const triage = await plugin.skills.triage({
    subject: "Customer cannot sync account",
    details: "The customer reports repeated sync failures and needs a follow-up before tomorrow morning.",
    requester: "support@__APP_SLUG__.example",
  });

  assert.equal(manifest.id, pluginManifest.id);
  assert.equal(manifest.name, pluginManifest.name);
  assert.equal(manifest.version, pluginManifest.version);
  assert.equal(before.ok, true);
  assert.equal(after.ok, true);
  assert.ok(Array.isArray(triage.actions) && triage.actions.length > 0);

  const payload = {
    ok: true,
    mode,
    manifest: pluginManifest,
    config: plugin.config,
    before,
    after,
    triage,
  };

  if (mode === "check" || mode === "example") {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  throw new Error(`Unknown harness mode: ${mode}`);
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
