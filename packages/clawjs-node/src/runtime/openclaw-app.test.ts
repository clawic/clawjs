import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  detachOpenClawAppContext,
  discoverOpenClawAppContext,
} from "./openclaw-app.ts";

test("discoverOpenClawAppContext resolves the first configured alias", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-app-"));
  const configPath = path.join(stateDir, "openclaw.json");

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [{
        id: "clawjs-demo",
      }],
    },
  }, null, 2));

  const context = discoverOpenClawAppContext({
    configPath,
    stateDir,
    agentIds: ["demo-alias", "clawjs-demo"],
  });

  assert.equal(context.agentId, "clawjs-demo");
  assert.equal(context.matchedAgentId, "clawjs-demo");
  assert.equal(context.requestedAgentIds[0], "demo-alias");
});

test("detachOpenClawAppContext unregisters agent ids and removes requested paths", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-detach-"));
  const configPath = path.join(stateDir, "openclaw.json");
  const workspaceDir = path.join(stateDir, "workspaces", "clawjs-demo");
  const agentDir = path.join(stateDir, "agents", "clawjs-demo", "agent");
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
        id: "clawjs-demo",
        workspace: workspaceDir,
        agentDir,
      }, {
        id: "demo-alias",
        workspace: path.join(stateDir, "workspaces", "demo-alias"),
      }],
    },
  }, null, 2));

  const result = detachOpenClawAppContext({
    configPath,
    stateDir,
    agentId: "clawjs-demo",
    agentIds: ["demo-alias"],
    workspaceDir,
    agentDir,
    conversationsDir,
    removeWorkspaceDir: true,
    removeAgentDir: true,
    removeConversationsDir: true,
  });

  assert.deepEqual(result.removedAgentIds.sort(), ["clawjs-demo", "demo-alias"]);
  assert.equal(result.updatedConfig, true);
  assert.equal(fs.existsSync(workspaceDir), false);
  assert.equal(fs.existsSync(agentDir), false);
  assert.equal(fs.existsSync(conversationsDir), false);
  assert.deepEqual(result.config?.agents?.list ?? [], []);
});
