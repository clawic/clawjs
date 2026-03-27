import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getClawJSLocalSettings, getClawJSLocalSettingsPath, saveClawJSLocalSettings } from "./local-settings.ts";
import {
  CONFIG_SECRET_PLACEHOLDER,
  clearConfigCache,
  getClawJSUserConfigPath,
  getUserConfig,
  redactUserConfigForClient,
  saveUserConfig,
} from "./user-config.ts";

test("workspace config initializes from the current OpenClaw workspace only", { concurrency: false }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-config-"));
  const projectDir = path.join(tempRoot, "project");
  const stateDir = path.join(tempRoot, "openclaw-state");
  const homeDir = path.join(tempRoot, "home");
  const legacyConfigDir = path.join(projectDir, "config");
  const legacyLocalSettingsPath = path.join(homeDir, ".openclaw", "clawjs-legacy-settings.json");

  const previousCwd = process.cwd();
  const previousHome = process.env.HOME;
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  const previousWorkspaceDir = process.env.OPENCLAW_WORKSPACE_DIR;
  const previousConfigDir = process.env.OPENCLAW_CONFIG_DIR;
  const previousLocalSettingsPath = process.env.OPENCLAW_LOCAL_SETTINGS_PATH;

  fs.mkdirSync(path.join(legacyConfigDir, "context-files"), { recursive: true });
  fs.mkdirSync(path.join(legacyConfigDir, "profile"), { recursive: true });
  fs.mkdirSync(path.dirname(legacyLocalSettingsPath), { recursive: true });
  fs.writeFileSync(path.join(legacyConfigDir, "user-config.json"), `${JSON.stringify({
    schemaVersion: 2,
    locale: "en",
    displayName: "Legacy Name",
    profileNameKey: "legacy_name",
    dataSources: {
      wacliDbPath: "",
      transcriptionDbPath: "transcriptions.sqlite",
      activityStoreDbPath: "data/activity-store.sqlite",
    },
    emailAccounts: [],
    calendarAccounts: [],
    closeRelationMatchers: { patterns: [] },
    workRelationMatchers: { patterns: [] },
    excludedChats: [],
    excludeGroups: false,
    priorityContacts: { patterns: [], exactNames: [] },
    profileFile: "profile.md",
    contextFiles: {},
    chat: {
      roles: [],
      greeting: "Legacy greeting",
      suggestedTopics: [],
      focusTopics: [],
      neverMention: [],
      additionalGuidelines: [],
    },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(legacyConfigDir, "profile.md"), "# Legacy Profile\n");
  fs.writeFileSync(
    legacyLocalSettingsPath,
    `${JSON.stringify({ schemaVersion: 1, onboardingCompleted: true, sidebarOpen: true }, null, 2)}\n`
  );

  process.chdir(projectDir);
  process.env.HOME = homeDir;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  delete process.env.OPENCLAW_WORKSPACE_DIR;
  delete process.env.OPENCLAW_CONFIG_DIR;
  delete process.env.OPENCLAW_LOCAL_SETTINGS_PATH;
  clearConfigCache();

  try {
    const config = getUserConfig();
    const workspaceConfigPath = getClawJSUserConfigPath();
    const workspaceLocalSettingsPath = getClawJSLocalSettingsPath();

    assert.equal(config.displayName, "");
    assert.equal(config.profileNameKey, "");
    assert.equal(workspaceConfigPath, path.join(stateDir, "workspaces", "clawjs-demo", "config", "user-config.json"));
    assert.equal(fs.existsSync(workspaceConfigPath), true);
    assert.equal(workspaceLocalSettingsPath, path.join(stateDir, "workspaces", "clawjs-demo", "settings.json"));
    assert.equal(getClawJSLocalSettings().onboardingCompleted, undefined);
    assert.equal(getClawJSLocalSettings().sidebarOpen, undefined);
    assert.equal(fs.existsSync(workspaceLocalSettingsPath), false);
    assert.equal(fs.existsSync(legacyLocalSettingsPath), true);
  } finally {
    process.chdir(previousCwd);
    clearConfigCache();

    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    if (previousWorkspaceDir === undefined) {
      delete process.env.OPENCLAW_WORKSPACE_DIR;
    } else {
      process.env.OPENCLAW_WORKSPACE_DIR = previousWorkspaceDir;
    }
    if (previousConfigDir === undefined) {
      delete process.env.OPENCLAW_CONFIG_DIR;
    } else {
      process.env.OPENCLAW_CONFIG_DIR = previousConfigDir;
    }
    if (previousLocalSettingsPath === undefined) {
      delete process.env.OPENCLAW_LOCAL_SETTINGS_PATH;
    } else {
      process.env.OPENCLAW_LOCAL_SETTINGS_PATH = previousLocalSettingsPath;
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("saveClawJSLocalSettings persists sidebar preference", { concurrency: false }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-local-settings-"));
  const localSettingsPath = path.join(tempRoot, "settings.json");
  const previousLocalSettingsPath = process.env.OPENCLAW_LOCAL_SETTINGS_PATH;

  process.env.OPENCLAW_LOCAL_SETTINGS_PATH = localSettingsPath;

  try {
    const saved = saveClawJSLocalSettings({ onboardingCompleted: true, sidebarOpen: false });

    assert.equal(saved.sidebarOpen, false);
    assert.equal(saved.onboardingCompleted, true);
    assert.equal(getClawJSLocalSettings().sidebarOpen, false);
  } finally {
    if (previousLocalSettingsPath === undefined) {
      delete process.env.OPENCLAW_LOCAL_SETTINGS_PATH;
    } else {
      process.env.OPENCLAW_LOCAL_SETTINGS_PATH = previousLocalSettingsPath;
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("saveUserConfig normalizes TTS config using SDK defaults", { concurrency: false }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-tts-config-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const configDir = path.join(workspaceDir, "config");
  const configPath = path.join(configDir, "user-config.json");
  const previousWorkspaceDir = process.env.OPENCLAW_WORKSPACE_DIR;
  const previousConfigDir = process.env.OPENCLAW_CONFIG_DIR;

  fs.mkdirSync(path.join(configDir, "context-files"), { recursive: true });
  fs.mkdirSync(path.join(configDir, "profile"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "data"), { recursive: true });
  fs.writeFileSync(path.join(configDir, "profile.md"), "");

  process.env.OPENCLAW_WORKSPACE_DIR = workspaceDir;
  process.env.OPENCLAW_CONFIG_DIR = configDir;
  clearConfigCache();

  try {
    saveUserConfig({
      schemaVersion: 2,
      locale: "en",
      displayName: "",
      profileNameKey: "",
      dataSources: {
        wacliDbPath: "",
        transcriptionDbPath: "",
        activityStoreDbPath: path.join(workspaceDir, "data", "activity-store.sqlite"),
      },
      tts: {
        enabled: true,
        provider: "deepgram",
        speed: 2,
      },
      emailAccounts: [],
      calendarAccounts: [],
      closeRelationMatchers: { patterns: [] },
      workRelationMatchers: { patterns: [] },
      excludedChats: [],
      excludeGroups: false,
      priorityContacts: { patterns: [], exactNames: [] },
      profileFile: "profile.md",
      contextFiles: {},
      chat: {
        roles: [],
        greeting: "",
        suggestedTopics: [],
        focusTopics: [],
        neverMention: [],
        additionalGuidelines: [],
      },
    });

    const saved = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      tts?: {
        enabled?: boolean;
        provider?: string;
        model?: string;
        speed?: number;
      };
    };

    assert.deepEqual(saved.tts, {
      enabled: true,
      autoRead: false,
      provider: "deepgram",
      model: "aura-2-thalia-en",
    });
  } finally {
    clearConfigCache();

    if (previousWorkspaceDir === undefined) {
      delete process.env.OPENCLAW_WORKSPACE_DIR;
    } else {
      process.env.OPENCLAW_WORKSPACE_DIR = previousWorkspaceDir;
    }
    if (previousConfigDir === undefined) {
      delete process.env.OPENCLAW_CONFIG_DIR;
    } else {
      process.env.OPENCLAW_CONFIG_DIR = previousConfigDir;
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("saveUserConfig strips persisted integration bot tokens from disk", { concurrency: false }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-integration-secrets-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const configDir = path.join(workspaceDir, "config");
  const configPath = path.join(configDir, "user-config.json");
  const previousWorkspaceDir = process.env.OPENCLAW_WORKSPACE_DIR;
  const previousConfigDir = process.env.OPENCLAW_CONFIG_DIR;

  fs.mkdirSync(path.join(configDir, "context-files"), { recursive: true });
  fs.mkdirSync(path.join(configDir, "profile"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "data"), { recursive: true });
  fs.writeFileSync(path.join(configDir, "profile.md"), "");

  process.env.OPENCLAW_WORKSPACE_DIR = workspaceDir;
  process.env.OPENCLAW_CONFIG_DIR = configDir;
  clearConfigCache();

  try {
    saveUserConfig({
      schemaVersion: 2,
      locale: "en",
      displayName: "",
      profileNameKey: "",
      dataSources: {
        wacliDbPath: "",
        transcriptionDbPath: "",
        activityStoreDbPath: path.join(workspaceDir, "data", "activity-store.sqlite"),
      },
      telegram: {
        enabled: true,
        botToken: "telegram-secret",
        botName: "Demo Bot",
        botUsername: "demo_bot",
        allowedChatIds: [],
        syncMessages: true,
      },
      slack: {
        enabled: true,
        botToken: "slack-secret",
        botUsername: "demo_slack_bot",
        teamName: "Demo Team",
        allowedChannelIds: [],
        syncMessages: false,
      },
      emailAccounts: [],
      calendarAccounts: [],
      closeRelationMatchers: { patterns: [] },
      workRelationMatchers: { patterns: [] },
      excludedChats: [],
      excludeGroups: false,
      priorityContacts: { patterns: [], exactNames: [] },
      profileFile: "profile.md",
      contextFiles: {},
      chat: {
        roles: [],
        greeting: "",
        suggestedTopics: [],
        focusTopics: [],
        neverMention: [],
        additionalGuidelines: [],
      },
    });

    const saved = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      telegram?: { botToken?: string; botUsername?: string };
      slack?: { botToken?: string; botUsername?: string };
    };

    assert.equal(saved.telegram?.botToken, "");
    assert.equal(saved.telegram?.botUsername, "demo_bot");
    assert.equal(saved.slack?.botToken, "");
    assert.equal(saved.slack?.botUsername, "demo_slack_bot");
  } finally {
    clearConfigCache();

    if (previousWorkspaceDir === undefined) {
      delete process.env.OPENCLAW_WORKSPACE_DIR;
    } else {
      process.env.OPENCLAW_WORKSPACE_DIR = previousWorkspaceDir;
    }
    if (previousConfigDir === undefined) {
      delete process.env.OPENCLAW_CONFIG_DIR;
    } else {
      process.env.OPENCLAW_CONFIG_DIR = previousConfigDir;
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("redactUserConfigForClient masks API keys without dropping configured state", { concurrency: false }, () => {
  const config = redactUserConfigForClient({
    schemaVersion: 2,
    locale: "en",
    displayName: "Taylor",
    profileNameKey: "taylor",
    dataSources: {
      wacliDbPath: "",
      transcriptionDbPath: "",
      activityStoreDbPath: "/tmp/activity-store.sqlite",
    },
    transcription: {
      provider: "openai",
      apiKey: "secret-transcription-key",
    },
    tts: {
      enabled: true,
      provider: "openai",
      apiKey: "secret-tts-key",
    },
    telegram: {
      enabled: true,
      botToken: "hidden",
      botUsername: "demo_bot",
    },
    emailAccounts: [],
    calendarAccounts: [],
    closeRelationMatchers: { patterns: [] },
    workRelationMatchers: { patterns: [] },
    excludedChats: [],
    excludeGroups: false,
    priorityContacts: { patterns: [], exactNames: [] },
    profileFile: "profile.md",
    contextFiles: {},
    chat: {
      roles: [],
      greeting: "",
      suggestedTopics: [],
      focusTopics: [],
      neverMention: [],
      additionalGuidelines: [],
    },
  });

  assert.equal(config.transcription?.apiKey, CONFIG_SECRET_PLACEHOLDER);
  assert.equal(config.tts?.apiKey, CONFIG_SECRET_PLACEHOLDER);
  assert.equal(config.telegram?.botToken, "");
  assert.equal(config.telegram?.botUsername, "demo_bot");
});
