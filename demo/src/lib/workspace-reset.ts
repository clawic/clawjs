import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { readOpenClawRuntimeConfig, writeOpenClawRuntimeConfig } from "@clawjs/claw";

import { defaultLocale } from "./i18n/messages.ts";
import { LOCAL_SETTINGS_SCHEMA_VERSION } from "./local-settings.ts";
import {
  DEFAULT_SOUL_TEMPLATE,
  DEFAULT_USER_TEMPLATE,
  PROFILE_SECTION_DEFINITIONS,
  syncGeneratedProfile,
} from "./profile-context.ts";
import { clearConfigCache, getClawJSConfigDir, getClawJSUserConfigPath, getUserConfig, saveUserConfig, type UserConfig } from "./user-config.ts";
// Fallback when transcription cache support is unavailable.
function resetTranscriptionCacheDb(): void { /* no-op */ }
import {
  resolveClawJSSessionsDir,
  resolveClawJSWorkspaceDir,
  resolveClawJSAgentDir,
  resolveOpenClawStateDir,
  openClawConfigPath,
  getClawJSOpenClawAgentId,
} from "./openclaw-agent.ts";

const WACLI_STORE_DIR = path.join(os.homedir(), ".wacli");

export interface ResetOptions {
  conversations: boolean;
  profile: boolean;
  contextFiles: boolean;
  transcriptions: boolean;
  settings: boolean;
  whatsappData: boolean;
  emailAccounts: boolean;
  calendarAccounts: boolean;
}

export const ALL_RESET_OPTIONS: ResetOptions = {
  conversations: true,
  profile: true,
  contextFiles: true,
  transcriptions: true,
  settings: true,
  whatsappData: true,
  emailAccounts: true,
  calendarAccounts: true,
};

export interface WorkspaceResetResult {
  workspaceDir: string;
  sessionsDir: string;
}

function buildBlankUserConfig(): UserConfig {
  const workspaceDir = resolveClawJSWorkspaceDir();
  const dataDir = path.join(workspaceDir, "data");

  return {
    schemaVersion: 2,
    locale: defaultLocale,
    displayName: "",
    profileNameKey: "",
    profileBasics: {
      age: "",
      gender: "",
      location: "",
      occupation: "",
    },
    dataSources: {
      wacliDbPath: "",
      transcriptionDbPath: "",
      activityStoreDbPath: path.join(dataDir, "activity-store.sqlite"),
    },
    emailAccounts: [],
    calendarAccounts: [],
    closeRelationMatchers: { patterns: [] },
    workRelationMatchers: { patterns: [] },
    excludedChats: [],
    excludeGroups: false,
    priorityContacts: { patterns: [], exactNames: [] },
    profileFile: "profile.md",
    contextFiles: {
      relationships: {
        file: "relationships-notes.md",
        label: "Relationships",
        shortLabel: "Rel",
        lastUpdated: "2026-01-01T00:00:00Z",
        staleAfterDays: 14,
        relevanceKeywords: ["relationships", "partner", "family", "friends"],
        relevanceChatPatterns: ["partner", "family", "friend"],
        promptHeader: "RELATIONSHIP CONTEXT (important relationship context, dynamics, recurring themes)",
      },
    },
    chat: {
      roles: [
        {
          title: "Personal Assistant",
          description: "Helps you with communication patterns, priorities, productivity, and personal context using your local workspace data.",
        },
      ],
      greeting: "",
      suggestedTopics: [],
      focusTopics: [],
      neverMention: [],
      additionalGuidelines: [
        "Reply in the same language the user writes in.",
        "Be direct and insightful, not generic.",
      ],
      expertSupportUrl: "",
    },
  };
}

function ensureBlankWorkspaceSkeleton(): void {
  const workspaceDir = resolveClawJSWorkspaceDir();
  const configDir = getClawJSConfigDir();
  const profileDir = path.join(configDir, "profile");
  const contextFilesPath = path.join(configDir, "context-files");
  const dataDir = path.join(workspaceDir, "data");

  const contactsDir = path.join(configDir, "contacts");

  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(contextFilesPath, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(contactsDir, { recursive: true });

  fs.writeFileSync(getClawJSUserConfigPath(), `${JSON.stringify(buildBlankUserConfig(), null, 2)}\n`);
  fs.writeFileSync(path.join(workspaceDir, "settings.json"), `${JSON.stringify({ schemaVersion: LOCAL_SETTINGS_SCHEMA_VERSION }, null, 2)}\n`);
  fs.writeFileSync(
    path.join(contextFilesPath, "relationships-notes.md"),
    "Context file not configured yet.\n\nAdd notes here to customize the workspace context.\n"
  );

  for (const section of PROFILE_SECTION_DEFINITIONS) {
    fs.writeFileSync(path.join(profileDir, section.fileName), "");
  }

  fs.writeFileSync(path.join(workspaceDir, "USER.md"), DEFAULT_USER_TEMPLATE);
  fs.writeFileSync(path.join(workspaceDir, "SOUL.md"), DEFAULT_SOUL_TEMPLATE);
}

/**
 * Securely delete a directory by overwriting every file with random data
 * before unlinking. This makes data recovery significantly harder on
 * non-SSD storage.
 *
 * Falls back to a plain `fs.rmSync` if anything goes wrong.
 */
function secureDeleteDir(dirPath: string): void {
  try {
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        secureDeleteDir(fullPath);
      } else {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 0) {
            const fd = fs.openSync(fullPath, "w");
            try {
              fs.writeSync(fd, crypto.randomBytes(stat.size));
              fs.fsyncSync(fd);
            } finally {
              fs.closeSync(fd);
            }
          }
          fs.unlinkSync(fullPath);
        } catch {
          // If a single file fails, keep going.
          try { fs.unlinkSync(fullPath); } catch { /* best effort */ }
        }
      }
    }

    fs.rmdirSync(dirPath);
  } catch {
    // Fallback: plain recursive removal.
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Securely delete a single file (overwrite then unlink).
 * Falls back to plain unlink on failure.
 */
function secureDeleteFile(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;

    const stat = fs.statSync(filePath);
    if (stat.size > 0) {
      const fd = fs.openSync(filePath, "w");
      try {
        fs.writeSync(fd, crypto.randomBytes(stat.size));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    }
    fs.unlinkSync(filePath);
  } catch {
    try { fs.rmSync(filePath, { force: true }); } catch { /* best effort */ }
  }
}

/**
 * Remove the ClawJS agent directory (auth-profiles.json, models.json, etc.).
 */
export function resetOpenClawAgentData(): void {
  secureDeleteDir(resolveClawJSAgentDir());
}

/**
 * Remove the ClawJS agent entry from openclaw.json so the CLI
 * no longer considers it configured.
 */
export function removeClawJSFromOpenClawConfig(): void {
  try {
    const config = readOpenClawRuntimeConfig({ configPath: openClawConfigPath() }) as {
      agents?: {
        list?: Array<{ id: string; [key: string]: unknown }>;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    } | null;
    if (!config) return;

    const agentId = getClawJSOpenClawAgentId();
    const list = config.agents?.list;
    if (!Array.isArray(list)) return;

    const filtered = list.filter((a) => a?.id !== agentId);
    if (filtered.length === list.length) return; // nothing to remove

    config.agents!.list = filtered;
    writeOpenClawRuntimeConfig(config, { configPath: openClawConfigPath() });
  } catch {
    // best effort
  }
}

export function resetClawJSWorkspace(options: ResetOptions = ALL_RESET_OPTIONS): WorkspaceResetResult {
  const workspaceDir = resolveClawJSWorkspaceDir();
  const sessionsDir = resolveClawJSSessionsDir();
  const configDir = getClawJSConfigDir();
  const allSelected = Object.values(options).every(Boolean);

  if (options.transcriptions) resetTranscriptionCacheDb();
  clearConfigCache();

  if (allSelected) {
    // Full reset: wipe everything and rebuild
    secureDeleteDir(workspaceDir);
    secureDeleteDir(sessionsDir);
    ensureBlankWorkspaceSkeleton();
    syncGeneratedProfile();
  } else {
    // Selective reset
    if (options.conversations) {
      secureDeleteDir(sessionsDir);
    }

    if (options.profile) {
      const profileDir = path.join(configDir, "profile");
      secureDeleteDir(profileDir);
      fs.mkdirSync(profileDir, { recursive: true });
      for (const section of PROFILE_SECTION_DEFINITIONS) {
        fs.writeFileSync(path.join(profileDir, section.fileName), "");
      }
      secureDeleteFile(path.join(workspaceDir, "USER.md"));
      secureDeleteFile(path.join(workspaceDir, "SOUL.md"));
      fs.writeFileSync(path.join(workspaceDir, "USER.md"), DEFAULT_USER_TEMPLATE);
      fs.writeFileSync(path.join(workspaceDir, "SOUL.md"), DEFAULT_SOUL_TEMPLATE);
      syncGeneratedProfile();
    }

    if (options.contextFiles) {
      const contextFilesPath = path.join(configDir, "context-files");
      secureDeleteDir(contextFilesPath);
      fs.mkdirSync(contextFilesPath, { recursive: true });
      fs.writeFileSync(path.join(contextFilesPath, "relationships-notes.md"), "");
    }

    if (options.settings) {
      const blankConfig = buildBlankUserConfig();
      fs.writeFileSync(getClawJSUserConfigPath(), `${JSON.stringify(blankConfig, null, 2)}\n`);
      const settingsPath = path.join(workspaceDir, "settings.json");
      fs.writeFileSync(settingsPath, `${JSON.stringify({ schemaVersion: LOCAL_SETTINGS_SCHEMA_VERSION }, null, 2)}\n`);
    }

    // Integration cleanup (only in selective mode, full reset already wipes config)
    if (options.whatsappData) {
      secureDeleteDir(WACLI_STORE_DIR);
      try {
        const config = getUserConfig();
        config.dataSources.wacliDbPath = "";
        saveUserConfig(config);
      } catch { /* config may already be wiped */ }
    }

    if (options.emailAccounts) {
      try {
        const config = getUserConfig();
        config.emailAccounts = [];
        saveUserConfig(config);
      } catch { /* config may already be wiped */ }
    }

    if (options.calendarAccounts) {
      try {
        const config = getUserConfig();
        config.calendarAccounts = [];
        saveUserConfig(config);
      } catch { /* config may already be wiped */ }
    }
  }

  clearConfigCache();

  return { workspaceDir, sessionsDir };
}
