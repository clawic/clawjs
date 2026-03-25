import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  detachOpenClawAppContext,
  discoverOpenClawAppContext,
} from "./openclaw-app.ts";

test("discoverOpenClawAppContext resolves the first configured alias and migrates legacy paths", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-app-"));
  const configPath = path.join(stateDir, "openclaw.json");
  const legacyWorkspaceDir = path.join(stateDir, "legacy-workspace");
  const legacyAgentDir = path.join(stateDir, "legacy-agent");
  const legacyConversationsDir = path.join(stateDir, "legacy-conversations");

  fs.mkdirSync(legacyWorkspaceDir, { recursive: true });
  fs.mkdirSync(legacyAgentDir, { recursive: true });
  fs.mkdirSync(legacyConversationsDir, { recursive: true });
  fs.writeFileSync(path.join(legacyWorkspaceDir, "USER.md"), "legacy-user\n");
  fs.writeFileSync(path.join(legacyAgentDir, "auth-profiles.json"), "{}\n");
  fs.writeFileSync(path.join(legacyConversationsDir, "session.jsonl"), "{}\n");

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [{
        id: "clawlen",
      }],
    },
  }, null, 2));

  const context = discoverOpenClawAppContext({
    configPath,
    stateDir,
    agentIds: ["clawjs-legacy", "clawlen"],
    migrateLegacy: {
      workspaceDirCandidates: [legacyWorkspaceDir],
      agentDirCandidates: [legacyAgentDir],
      conversationsDirCandidates: [legacyConversationsDir],
    },
  });

  assert.equal(context.agentId, "clawlen");
  assert.equal(context.matchedAgentId, "clawlen");
  assert.equal(context.requestedAgentIds[0], "clawjs-legacy");
  assert.equal(fs.existsSync(path.join(context.workspaceDir, "USER.md")), true);
  assert.equal(fs.existsSync(path.join(context.agentDir, "auth-profiles.json")), true);
  assert.equal(fs.existsSync(path.join(context.conversationsDir, "session.jsonl")), true);
  assert.equal(context.migration?.actions.filter((action) => action.performed).length, 3);
});

test("detachOpenClawAppContext unregisters agent ids and removes requested paths", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-detach-"));
  const configPath = path.join(stateDir, "openclaw.json");
  const workspaceDir = path.join(stateDir, "workspaces", "clawlen");
  const agentDir = path.join(stateDir, "agents", "clawlen", "agent");
  const conversationsDir = path.join(workspaceDir, ".clawjs", "conversations");

  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(conversationsDir, { recursive: true });
  fs.writeFileSync(path.join(configPath), JSON.stringify({
    agents: {
      defaults: {
        workspace: workspaceDir,
      },
      list: [{
        id: "clawlen",
        workspace: workspaceDir,
        agentDir,
      }, {
        id: "clawjs-legacy",
        workspace: path.join(stateDir, "workspaces", "clawjs-legacy"),
      }],
    },
  }, null, 2));

  const result = detachOpenClawAppContext({
    configPath,
    stateDir,
    agentId: "clawlen",
    agentIds: ["clawjs-legacy"],
    workspaceDir,
    agentDir,
    conversationsDir,
    removeWorkspaceDir: true,
    removeAgentDir: true,
    removeConversationsDir: true,
  });

  assert.deepEqual(result.removedAgentIds.sort(), ["clawjs-legacy", "clawlen"]);
  assert.equal(result.updatedConfig, true);
  assert.equal(fs.existsSync(workspaceDir), false);
  assert.equal(fs.existsSync(agentDir), false);
  assert.equal(fs.existsSync(conversationsDir), false);
  assert.deepEqual(result.config?.agents?.list ?? [], []);
});
