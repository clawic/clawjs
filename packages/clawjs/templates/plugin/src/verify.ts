import assert from "node:assert/strict";

import { activatePlugin, pluginManifest } from "./index.js";

async function main() {
  const plugin = await activatePlugin({
    provider: "jira",
    projectKey: "SUP",
    baseUrl: "https://issues.__APP_SLUG__.example",
    enableAutoTriage: true,
    defaultLabels: ["support", "customer"],
  });

  const triage = await plugin.skills.triage({
    subject: "Customer cannot sync account",
    details: "The customer reports repeated sync failures and needs a follow-up.",
    requester: "support@__APP_SLUG__.example",
  });

  assert.equal(plugin.manifest.id, "__APP_SLUG__");
  assert.equal(pluginManifest.name, "__APP_TITLE__");
  assert.match(triage.summary, /Customer cannot sync account/);
  assert.ok(triage.actions.length > 0);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    pluginId: plugin.manifest.id,
    verified: true,
  }, null, 2)}\n`);
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
