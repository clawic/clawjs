import test from "node:test";
import assert from "node:assert/strict";
import os from "os";
import path from "path";
import fs from "fs";

import {
  readCapabilityReport,
  readChannelsStateSnapshot,
  readProviderStateSnapshot,
  readTelegramStateSnapshot,
  readWorkspaceStateSnapshot,
  resolveCapabilityReportPath,
  resolveChannelsStatePath,
  resolveProviderStatePath,
  resolveTelegramStatePath,
  resolveWorkspaceStatePath,
  writeCapabilityReport,
  writeProviderStateSnapshot,
  writeTelegramStateSnapshot,
  writeWorkspaceStateSnapshot,
} from "./store.ts";

test("observed store round-trips capability, workspace, provider, and telegram snapshots", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-state-"));

  writeCapabilityReport(workspaceDir, {
    schemaVersion: 1,
    generatedAt: "2026-03-21T00:00:00.000Z",
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    degraded: false,
    capabilities: {
      version: true,
      modelsStatus: true,
    },
    issues: [],
    diagnostics: {
      versionFamily: "1.2",
    },
  });
  writeWorkspaceStateSnapshot(workspaceDir, {
    schemaVersion: 1,
    updatedAt: "2026-03-21T00:00:00.000Z",
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: workspaceDir,
    manifestPresent: true,
    missingFiles: [],
    missingDirectories: [],
  });
  writeProviderStateSnapshot(workspaceDir, {
    schemaVersion: 1,
    updatedAt: "2026-03-21T00:00:00.000Z",
    providers: {
      anthropic: {
        provider: "anthropic",
        hasAuth: true,
        hasSubscription: false,
        hasApiKey: true,
        hasProfileApiKey: true,
        hasEnvKey: false,
        authType: "api_key",
        maskedCredential: "********1234",
      },
    },
    missingProvidersInUse: ["openai"],
  });
  writeTelegramStateSnapshot(workspaceDir, {
    schemaVersion: 1,
    updatedAt: "2026-03-21T00:00:00.000Z",
    connected: true,
    apiBaseUrl: "https://api.telegram.org",
    secretName: "telegram_support_bot_token",
    maskedCredential: "vault:******oken",
    botProfile: {
      id: "42",
      isBot: true,
      username: "claw_support_bot",
      firstName: "Claw Support",
      canJoinGroups: true,
    },
    transport: {
      mode: "webhook",
      active: true,
      webhook: {
        url: "https://example.com/telegram/webhook",
        pendingUpdateCount: 0,
        secretTokenConfigured: true,
      },
      lastSyncAt: "2026-03-21T00:00:00.000Z",
      lastUpdateId: 10,
    },
    commands: [{
      command: "start",
      description: "Start the bot",
    }],
    recentErrors: [],
    knownChats: [{
      id: "1000",
      type: "private",
      username: "alice",
      firstName: "Alice",
    }],
  });

  assert.equal(readCapabilityReport(workspaceDir)?.runtimeVersion, "1.2.3");
  assert.equal(readWorkspaceStateSnapshot(workspaceDir)?.manifestPresent, true);
  assert.equal(readProviderStateSnapshot(workspaceDir)?.missingProvidersInUse?.[0], "openai");
  assert.equal(readTelegramStateSnapshot(workspaceDir)?.botProfile?.username, "claw_support_bot");
  assert.equal((readChannelsStateSnapshot(workspaceDir)?.details?.telegram as { secretName?: string } | undefined)?.secretName, "telegram_support_bot_token");
  assert.equal(fs.existsSync(resolveCapabilityReportPath(workspaceDir)), true);
  assert.equal(fs.existsSync(resolveWorkspaceStatePath(workspaceDir)), true);
  assert.equal(fs.existsSync(resolveProviderStatePath(workspaceDir)), true);
  assert.equal(fs.existsSync(resolveTelegramStatePath(workspaceDir)), true);
  assert.equal(resolveTelegramStatePath(workspaceDir), resolveChannelsStatePath(workspaceDir));
});
