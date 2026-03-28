import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildOpenClawCommandEnv,
  openClawConfigPath,
  resolveClawJSAgentDir,
  resolveClawJSSessionsDir,
  resolveClawJSWorkspaceDir,
  resolveOpenClawStateDir,
} from "./claw.ts";

test("buildOpenClawCommandEnv pins the canonical OpenClaw paths for subprocesses", () => {
  const env = buildOpenClawCommandEnv({ NODE_ENV: "test" });

  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.OPENCLAW_STATE_DIR, resolveOpenClawStateDir());
  assert.equal(env.OPENCLAW_CONFIG_PATH, openClawConfigPath());
  assert.equal(env.OPENCLAW_WORKSPACE_DIR, resolveClawJSWorkspaceDir());
  assert.equal(env.OPENCLAW_AGENT_DIR, resolveClawJSAgentDir());
  assert.equal(env.OPENCLAW_CONVERSATIONS_DIR, resolveClawJSSessionsDir());
});

test("canonical OpenClaw defaults stay under ~/.openclaw", () => {
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  const previousConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  delete process.env.OPENCLAW_STATE_DIR;
  delete process.env.OPENCLAW_CONFIG_PATH;

  try {
    assert.equal(resolveOpenClawStateDir(), path.join(os.homedir(), ".openclaw"));
    assert.equal(openClawConfigPath(), path.join(os.homedir(), ".openclaw", "openclaw.json"));
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    if (previousConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = previousConfigPath;
    }
  }
});
