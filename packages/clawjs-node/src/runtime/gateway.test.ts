import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  callOpenClawGateway,
  getOpenClawGatewayStatus,
  listOpenClawChannels,
  readOpenClawGatewayConfig,
  resolveOpenClawConfigPath,
} from "./gateway.ts";

test("resolveOpenClawConfigPath prefers explicit config and state dir env", () => {
  assert.equal(
    resolveOpenClawConfigPath({ configPath: "/tmp/custom.json" }),
    "/tmp/custom.json",
  );
  assert.equal(
    resolveOpenClawConfigPath({ env: { OPENCLAW_STATE_DIR: "/tmp/state" } as NodeJS.ProcessEnv }),
    path.join("/tmp/state", "openclaw.json"),
  );
});

test("readOpenClawGatewayConfig supports explicit url and config file", () => {
  const explicit = readOpenClawGatewayConfig({
    url: "127.0.0.1:9999",
    token: "secret",
    port: 9999,
  });
  assert.deepEqual(explicit, {
    url: "http://127.0.0.1:9999",
    token: "secret",
    port: 9999,
    source: "explicit",
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-gateway-"));
  const configPath = path.join(tempDir, "openclaw.json");
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      port: 18790,
      auth: { token: "cfg-token" },
    },
  }));

  const fromFile = readOpenClawGatewayConfig({ configPath });
  assert.deepEqual(fromFile, {
    url: "http://127.0.0.1:18790",
    token: "cfg-token",
    port: 18790,
    source: "config",
    configPath,
  });
});

test("callOpenClawGateway injects token and ws url when config is available", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const result = await callOpenClawGateway("channels.status", { probe: true }, {
    runner: {
      exec: async (command, args) => {
        calls.push({ command, args });
        return { stdout: "{\"ok\":true}", stderr: "", exitCode: 0 };
      },
    },
    url: "http://127.0.0.1:18789",
    token: "secret",
    port: 18789,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls[0], {
    command: "openclaw",
    args: [
      "gateway",
      "call",
      "--json",
      "--timeout",
      "10000",
      "--params",
      "{\"probe\":true}",
      "--token",
      "secret",
      "--url",
      "ws://127.0.0.1:18789",
      "channels.status",
    ],
  });
});

test("getOpenClawGatewayStatus reports unavailable probes", async () => {
  const status = await getOpenClawGatewayStatus({
    exec: async () => {
      throw new Error("unavailable");
    },
  }, {
    url: "127.0.0.1:18789",
  });

  assert.equal(status.configured, true);
  assert.equal(status.available, false);
  assert.equal(status.running, false);
  assert.equal(status.lastError, "unavailable");
});

test("listOpenClawChannels derives descriptors from gateway status and enabled plugins", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-gateway-channels-"));
  const configPath = path.join(tempDir, "openclaw.json");
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      port: 18790,
      auth: { token: "cfg-token" },
    },
    plugins: {
      entries: {
        whatsapp: { enabled: true },
      },
    },
  }));

  const channels = await listOpenClawChannels({
    exec: async () => ({
      stdout: JSON.stringify({
        channels: {
          whatsapp: {
            configured: true,
            connected: true,
            running: true,
          },
        },
        channelAccounts: {
          whatsapp: [{
            linked: true,
            connected: true,
          }],
        },
      }),
      stderr: "",
      exitCode: 0,
    }),
  }, { configPath });

  assert.deepEqual(channels, [{
    id: "whatsapp",
    label: "WhatsApp",
    kind: "chat",
    status: "connected",
    provider: "whatsapp",
    lastError: null,
    metadata: {
      pluginEnabled: true,
      linked: true,
      connected: true,
      configured: true,
      running: true,
      accountCount: 1,
    },
  }]);
});
