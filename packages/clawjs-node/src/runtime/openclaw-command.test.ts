import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOpenClawCommand,
  withOpenClawCommandEnv,
} from "./openclaw-command.ts";

test("withOpenClawCommandEnv injects canonical OpenClaw paths when provided", () => {
  const env = withOpenClawCommandEnv({
    NODE_ENV: "test",
  }, {
    binaryPath: "/usr/local/bin/openclaw",
    homeDir: "/tmp/openclaw-state",
    configPath: "/tmp/openclaw-state/openclaw.json",
  });

  assert.deepEqual(env, {
    NODE_ENV: "test",
    CLAWJS_OPENCLAW_PATH: "/usr/local/bin/openclaw",
    OPENCLAW_STATE_DIR: "/tmp/openclaw-state",
    OPENCLAW_CONFIG_PATH: "/tmp/openclaw-state/openclaw.json",
  });
});

test("withOpenClawCommandEnv preserves explicit env overrides", () => {
  const env = withOpenClawCommandEnv({
    OPENCLAW_STATE_DIR: "/custom/state",
    OPENCLAW_CONFIG_PATH: "/custom/config.json",
  }, {
    homeDir: "/tmp/openclaw-state",
    configPath: "/tmp/openclaw-state/openclaw.json",
  });

  assert.deepEqual(env, {
    OPENCLAW_STATE_DIR: "/custom/state",
    OPENCLAW_CONFIG_PATH: "/custom/config.json",
  });
});

test("buildOpenClawCommand forwards canonical env to subprocesses", () => {
  const command = buildOpenClawCommand(["models", "status", "--json"], {
    homeDir: "/tmp/openclaw-state",
    configPath: "/tmp/openclaw-state/openclaw.json",
  });

  assert.equal(command.command, "openclaw");
  assert.deepEqual(command.args, ["models", "status", "--json"]);
  assert.deepEqual(command.env, {
    OPENCLAW_STATE_DIR: "/tmp/openclaw-state",
    OPENCLAW_CONFIG_PATH: "/tmp/openclaw-state/openclaw.json",
  });
});
