import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  listOpenClawAgents,
  resolveOpenClawContext,
  resolveOpenClawContextWithCli,
} from "./openclaw-context.ts";

class FakeRunner {
  private readonly handlers: Record<string, { stdout?: string; stderr?: string; fail?: boolean }>;

  constructor(handlers: Record<string, { stdout?: string; stderr?: string; fail?: boolean }>) {
    this.handlers = handlers;
  }

  async exec(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const key = `${command} ${args.join(" ")}`.trim();
    const handler = this.handlers[key];
    if (!handler) {
      throw new Error(`missing handler for ${key}`);
    }
    if (handler.fail) {
      throw new Error(handler.stderr || "failed");
    }
    return {
      stdout: handler.stdout || "",
      stderr: handler.stderr || "",
      exitCode: 0,
    };
  }
}

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
  assert.equal(context.cliAgentDetected, false);
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
  assert.equal(context.configuredAgent?.model, undefined);
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
  assert.equal(context.cliAgent, null);
  assert.equal(context.cliAgentDetected, false);
});

test("listOpenClawAgents parses model metadata from CLI output", async () => {
  const runner = new FakeRunner({
    "openclaw agents list --json": {
      stdout: JSON.stringify([
        { id: "alpha", workspace: "/tmp/workspaces/alpha", agentDir: "/tmp/agents/alpha/agent", model: "openai-codex/gpt-5.4" },
        { id: "beta", name: "Beta Agent" },
      ]),
    },
  });

  const agents = await listOpenClawAgents(runner);
  assert.deepEqual(agents, [
    {
      id: "alpha",
      workspace: "/tmp/workspaces/alpha",
      agentDir: "/tmp/agents/alpha/agent",
      model: "openai-codex/gpt-5.4",
    },
    {
      id: "beta",
      name: "Beta Agent",
    },
  ]);
});

test("resolveOpenClawContextWithCli merges configured agent data with CLI metadata", async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-context-cli-"));
  const configPath = path.join(stateDir, "openclaw.json");
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [{
        id: "beta",
        name: "Configured Beta",
      }],
    },
  }));

  const runner = new FakeRunner({
    "openclaw agents list --json": {
      stdout: JSON.stringify([
        {
          id: "beta",
          workspace: "/tmp/beta-workspace",
          agentDir: "/tmp/beta-agent",
          model: "openai-codex/gpt-5.4",
        },
      ]),
    },
  });

  const context = await resolveOpenClawContextWithCli(runner, {
    configPath,
    agentId: "beta",
  });

  assert.equal(context.configuredAgent?.id, "beta");
  assert.equal(context.configuredAgent?.name, "Configured Beta");
  assert.equal(context.configuredAgent?.workspace, "/tmp/beta-workspace");
  assert.equal(context.configuredAgent?.agentDir, "/tmp/beta-agent");
  assert.equal(context.configuredAgent?.model, "openai-codex/gpt-5.4");
  assert.equal(context.workspaceDir, "/tmp/beta-workspace");
  assert.equal(context.agentDir, "/tmp/beta-agent");
  assert.equal(context.cliAgent?.model, "openai-codex/gpt-5.4");
  assert.equal(context.cliAgentDetected, true);
});

test("resolveOpenClawContextWithCli falls back to config when CLI agent discovery fails", async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-context-cli-fallback-"));
  const configPath = path.join(stateDir, "openclaw.json");
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [{
        id: "delta",
        workspace: "/tmp/delta-workspace",
        agentDir: "/tmp/delta-agent",
        model: "anthropic/claude-sonnet-4-5-20250929",
      }],
    },
  }));

  const runner = new FakeRunner({
    "openclaw agents list --json": { fail: true, stderr: "timeout" },
  });

  const context = await resolveOpenClawContextWithCli(runner, {
    configPath,
    agentId: "delta",
  });

  assert.equal(context.configuredAgent?.model, "anthropic/claude-sonnet-4-5-20250929");
  assert.equal(context.workspaceDir, "/tmp/delta-workspace");
  assert.equal(context.agentDir, "/tmp/delta-agent");
  assert.equal(context.cliAgent, null);
  assert.equal(context.cliAgentDetected, false);
});
