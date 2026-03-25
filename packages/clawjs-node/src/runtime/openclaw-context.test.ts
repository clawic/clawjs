import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { resolveOpenClawContext } from "./openclaw-context.ts";

test("resolveOpenClawContext prefers explicit overrides", () => {
  const context = resolveOpenClawContext({
    stateDir: "/tmp/state",
    configPath: "/tmp/state/openclaw.json",
    agentId: "alpha",
    workspaceDir: "/tmp/workspace-alpha",
    agentDir: "/tmp/agents/alpha/agent",
    conversationsDir: "/tmp/conversations-alpha",
    url: "127.0.0.1:19999",
    token: "secret",
    port: 19999,
  });

  assert.equal(context.stateDir, "/tmp/state");
  assert.equal(context.configPath, "/tmp/state/openclaw.json");
  assert.equal(context.agentId, "alpha");
  assert.equal(context.workspaceDir, "/tmp/workspace-alpha");
  assert.equal(context.agentDir, "/tmp/agents/alpha/agent");
  assert.equal(context.conversationsDir, "/tmp/conversations-alpha");
  assert.equal(context.gateway?.url, "http://127.0.0.1:19999");
  assert.equal(context.gateway?.token, "secret");
});

test("resolveOpenClawContext loads workspace and agent dirs from openclaw.json", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-context-"));
  const configPath = path.join(stateDir, "openclaw.json");
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      port: 18790,
      auth: { token: "cfg-token" },
    },
    agents: {
      defaults: {
        workspace: "/tmp/default-workspace",
      },
      list: [{
        id: "beta",
        workspace: "/tmp/beta-workspace",
        agentDir: "/tmp/beta-agent",
      }],
    },
  }));

  const context = resolveOpenClawContext({
    configPath,
    agentId: "beta",
  });

  assert.equal(context.stateDir, stateDir);
  assert.equal(context.workspaceDir, "/tmp/beta-workspace");
  assert.equal(context.agentDir, "/tmp/beta-agent");
  assert.equal(context.configuredAgent?.id, "beta");
  assert.equal(context.gateway?.port, 18790);
  assert.equal(context.gateway?.token, "cfg-token");
});

test("resolveOpenClawContext falls back to env and default paths", () => {
  const context = resolveOpenClawContext({
    env: {
      OPENCLAW_STATE_DIR: "/tmp/openclaw-state",
      OPENCLAW_AGENT_ID: "gamma",
    } as NodeJS.ProcessEnv,
  });

  assert.equal(context.stateDir, "/tmp/openclaw-state");
  assert.equal(context.agentId, "gamma");
  assert.equal(context.workspaceDir, path.join("/tmp/openclaw-state", "workspaces", "gamma"));
  assert.equal(context.agentDir, path.join("/tmp/openclaw-state", "agents", "gamma", "agent"));
});
