import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { NodeProcessHost } from "../host/process.ts";
import {
  describeSecret,
  doctorKeychain,
  ensureSecretReference,
  ensureTelegramBotSecretReference,
  listSecrets,
} from "./index.ts";

function createFakeSecretsProxy(): { proxyPath: string; env: NodeJS.ProcessEnv } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-secrets-proxy-"));
  const proxyPath = path.join(binDir, "secrets-proxy");
  const statePath = path.join(binDir, "secrets.json");
  fs.writeFileSync(statePath, JSON.stringify([
    {
      name: "telegram_bot_token",
      kind: "generic",
      allowedHosts: ["api.telegram.org"],
      allowedHeaderNames: [],
      readOnly: false,
      allowInURL: true,
      allowInRequestBody: false,
      allowInsecureTransport: false,
      allowLocalNetwork: false,
    },
    {
      name: "openai_api_key",
      kind: "generic",
      allowedHosts: ["api.openai.com"],
      allowedHeaderNames: ["Authorization"],
      readOnly: true,
      allowInURL: false,
      allowInRequestBody: false,
      allowInsecureTransport: false,
      allowLocalNetwork: false,
    },
  ], null, 2));

  fs.writeFileSync(proxyPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(process.env.FAKE_SECRETS_PROXY_STATE, "utf8"));
if (args[0] === "doctor-keychain") {
  process.stdout.write("Keychain OK\\n");
  process.exit(0);
}
if (args[0] === "list-secrets") {
  const searchIndex = args.indexOf("--search");
  const search = searchIndex === -1 ? "" : String(args[searchIndex + 1] || "").toLowerCase();
  const entries = !search ? state : state.filter((entry) => String(entry.name).toLowerCase().includes(search));
  process.stdout.write(JSON.stringify(entries));
  process.exit(0);
}
if (args[0] === "describe-secret") {
  const name = String(args[args.indexOf("--name") + 1] || "");
  const match = state.filter((entry) => entry.name === name);
  process.stdout.write(JSON.stringify(match));
  process.exit(0);
}
process.stderr.write("unsupported\\n");
process.exit(1);
`, { mode: 0o755 });

  return {
    proxyPath,
    env: {
      ...process.env,
      CLAWJS_SECRETS_PROXY_PATH: proxyPath,
      FAKE_SECRETS_PROXY_STATE: statePath,
    },
  };
}

test("listSecrets and describeSecret read metadata through secrets-proxy", async () => {
  const fake = createFakeSecretsProxy();
  const runner = new NodeProcessHost();

  const listed = await listSecrets(runner, { search: "telegram", env: fake.env });
  const described = await describeSecret(runner, { name: "telegram_bot_token", env: fake.env });

  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, "telegram_bot_token");
  assert.equal(described?.allowInURL, true);
});

test("doctorKeychain reports proxy health without leaking implementation details", async () => {
  const fake = createFakeSecretsProxy();
  const runner = new NodeProcessHost();
  const result = await doctorKeychain(runner, { env: fake.env });
  assert.equal(result.ok, true);
  assert.match(result.output, /Keychain OK/);
});

test("ensureSecretReference detects missing capabilities on an existing secret", async () => {
  const fake = createFakeSecretsProxy();
  const runner = new NodeProcessHost();
  const result = await ensureSecretReference(runner, {
    name: "openai_api_key",
    allowedHosts: ["api.openai.com", "api.anthropic.com"],
    allowedHeaderNames: ["Authorization", "X-API-Key"],
    readOnly: false,
    allowInURL: false,
    allowInRequestBody: false,
    allowInsecureTransport: false,
    allowLocalNetwork: false,
  }, { env: fake.env });

  assert.equal(result.status, "update_required");
  assert.deepEqual(result.missingHosts, ["api.anthropic.com"]);
  assert.deepEqual(result.missingHeaderNames, ["X-API-Key"]);
  assert.equal(result.mismatched.includes("readOnly"), true);
});

test("ensureTelegramBotSecretReference validates Telegram-specific URL requirements", async () => {
  const fake = createFakeSecretsProxy();
  const runner = new NodeProcessHost();
  const result = await ensureTelegramBotSecretReference(runner, {
    name: "telegram_bot_token",
  }, { env: fake.env });

  assert.equal(result.status, "configured");
  assert.equal(result.requirement.allowInURL, true);
  assert.deepEqual(result.requirement.allowedHosts, ["api.telegram.org"]);
});
