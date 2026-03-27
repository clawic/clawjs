import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getClawJSLocalSettings } from "./local-settings.ts";
import { getSession, listSessions } from "./sessions.ts";
import { clearConfigCache, getUserConfig } from "./user-config.ts";
import { resetClawJSWorkspace } from "./workspace-reset.ts";

test("resetClawJSWorkspace clears workspace state and forces onboarding again", { concurrency: false }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-reset-"));
  const projectDir = path.join(tempRoot, "project");
  const stateDir = path.join(tempRoot, "openclaw-state");
  const workspaceDir = path.join(stateDir, "workspaces", "clawjs-demo");
  const canonicalSessionsDir = path.join(workspaceDir, ".clawjs", "conversations");

  const previousCwd = process.cwd();
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;

  fs.mkdirSync(path.join(projectDir, "config"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "config", "context-files"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "config", "profile"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "data"), { recursive: true });
  fs.mkdirSync(canonicalSessionsDir, { recursive: true });

  fs.writeFileSync(
    path.join(projectDir, "config", "user-config.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      locale: "en",
      displayName: "Repo User",
      profileNameKey: "repo_user",
      profileBasics: { age: "", gender: "", location: "", occupation: "" },
      dataSources: { wacliDbPath: "repo.db", transcriptionDbPath: "repo.sqlite", activityStoreDbPath: "data/activity-store.sqlite" },
      emailAccounts: ["__all__"],
      calendarAccounts: ["__all__"],
      closeRelationMatchers: { patterns: ["repo-close"] },
      workRelationMatchers: { patterns: ["repo-work"] },
      excludedChats: ["repo-noise"],
      excludeGroups: false,
      priorityContacts: { patterns: ["repo-priority"], exactNames: ["Repo User"] },
      profileFile: "profile.md",
      contextFiles: {},
      chat: {
        roles: [],
        greeting: "Repo greeting",
        suggestedTopics: [],
        focusTopics: [],
        neverMention: [],
        additionalGuidelines: [],
      },
    }, null, 2)}\n`
  );

  fs.writeFileSync(
    path.join(workspaceDir, "config", "user-config.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      locale: "es",
      displayName: "Legacy Name",
      profileNameKey: "legacy_name",
      profileBasics: { age: "35", gender: "", location: "Madrid", occupation: "Founder" },
      dataSources: { wacliDbPath: "~/.wacli/wacli.db", transcriptionDbPath: "transcriptions.sqlite", activityStoreDbPath: "data/activity-store.sqlite" },
      emailAccounts: ["__all__"],
      calendarAccounts: ["__all__"],
      closeRelationMatchers: { patterns: ["legacy-close"] },
      workRelationMatchers: { patterns: ["legacy-work"] },
      excludedChats: ["legacy-noise"],
      excludeGroups: false,
      priorityContacts: { patterns: ["legacy-priority"], exactNames: ["Legacy Name"] },
      profileFile: "profile.md",
      contextFiles: {
        relationships: {
          file: "relationships-notes.md",
          label: "Relationships",
          shortLabel: "Rel",
          lastUpdated: "2026-01-01T00:00:00Z",
          staleAfterDays: 14,
          relevanceKeywords: ["relationships"],
          relevanceChatPatterns: [],
          promptHeader: "RELATIONSHIPS",
        },
      },
      chat: {
        roles: [],
        greeting: "Legacy greeting",
        suggestedTopics: ["Legacy"],
        focusTopics: [],
        neverMention: [],
        additionalGuidelines: [],
      },
    }, null, 2)}\n`
  );
  fs.writeFileSync(path.join(workspaceDir, "settings.json"), `${JSON.stringify({ schemaVersion: 1, onboardingCompleted: true, locale: "es" }, null, 2)}\n`);
  fs.writeFileSync(path.join(workspaceDir, "config", "profile.md"), "# Legacy Profile\n");
  fs.writeFileSync(path.join(workspaceDir, "config", "context-files", "relationships-notes.md"), "Legacy context\n");
  fs.writeFileSync(path.join(workspaceDir, "USER.md"), "Legacy Name\n");
  fs.writeFileSync(path.join(workspaceDir, "SOUL.md"), "Legacy Soul\n");
  fs.writeFileSync(path.join(workspaceDir, "data", "activity-store.sqlite"), "legacy-db");
  fs.writeFileSync(path.join(canonicalSessionsDir, "clawjs-reset-test.jsonl"), `${JSON.stringify({
    type: "message",
    timestamp: "2026-03-17T12:00:00.000Z",
    message: {
      role: "user",
      content: [{ type: "text", text: "USER: Legacy session" }],
    },
  })}\n`);

  process.chdir(projectDir);
  process.env.OPENCLAW_STATE_DIR = stateDir;
  clearConfigCache();

  try {
    const result = resetClawJSWorkspace();
    const config = getUserConfig();
    const localSettings = getClawJSLocalSettings();
    const userMemory = fs.readFileSync(path.join(workspaceDir, "USER.md"), "utf8");
    const generatedProfile = fs.readFileSync(path.join(workspaceDir, "config", "profile.md"), "utf8");
    const relationshipsContext = fs.readFileSync(path.join(workspaceDir, "config", "context-files", "relationships-notes.md"), "utf8");

    assert.equal(result.workspaceDir, workspaceDir);
    assert.equal(result.sessionsDir, canonicalSessionsDir);
    assert.equal(config.displayName, "");
    assert.equal(config.profileNameKey, "");
    assert.equal(config.locale, "en");
    assert.equal(config.chat.greeting, "");
    assert.deepEqual(config.chat.suggestedTopics, []);
    assert.equal(config.dataSources.wacliDbPath, "");
    assert.equal(config.dataSources.transcriptionDbPath, "");
    assert.equal(config.emailAccounts.length, 0);
    assert.equal(config.calendarAccounts.length, 0);
    assert.equal(localSettings.onboardingCompleted, undefined);
    assert.equal(localSettings.locale, undefined);
    assert.equal(listSessions().length, 0);
    assert.equal(getSession("clawjs-reset-test"), null);
    assert.equal(userMemory.includes("Legacy Name"), false);
    assert.equal(userMemory.includes("ClawJS Managed Context"), true);
    assert.equal(generatedProfile.includes("Repo User"), false);
    assert.equal(generatedProfile.includes("Legacy Name"), false);
    assert.equal(relationshipsContext.includes("Context file not configured yet."), true);
  } finally {
    process.chdir(previousCwd);
    clearConfigCache();

    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
