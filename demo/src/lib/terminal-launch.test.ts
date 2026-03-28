import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMacTerminalAppleScript,
  buildShellCommand,
  launchInMacTerminal,
  shellQuote,
} from "./terminal-launch.ts";

test("shellQuote escapes single quotes for POSIX shells", () => {
  assert.equal(shellQuote("O'Hara"), "'O'\\''Hara'");
});

test("buildShellCommand preserves cwd, env, and argument quoting", () => {
  const command = buildShellCommand("/usr/local/bin/openclaw", ["models", "auth", "login", "--provider", "openai-codex"], {
    cwd: "/tmp/claw demo",
    env: {
      NODE_ENV: "test",
      OPENCLAW_STATE_DIR: "/tmp/openclaw state",
      EMPTY_VALUE: "",
    },
  });

  assert.equal(
    command,
    "cd '/tmp/claw demo'; env OPENCLAW_STATE_DIR='/tmp/openclaw state' '/usr/local/bin/openclaw' 'models' 'auth' 'login' '--provider' 'openai-codex'",
  );
});

test("buildMacTerminalAppleScript wraps the shell command in Terminal instructions", () => {
  const script = buildMacTerminalAppleScript("echo ready");

  assert.deepEqual(script, [
    'tell application "Terminal" to activate',
    'tell application "Terminal" to do script "echo ready"',
  ]);
});

test("launchInMacTerminal invokes osascript with the generated AppleScript", async () => {
  const calls: Array<{ file: string; args: readonly string[] }> = [];

  await launchInMacTerminal("/usr/local/bin/openclaw", ["models", "status"], {
    cwd: "/tmp/demo",
    execFileImpl(file, args, _options, callback) {
      calls.push({ file, args });
      callback(null, "", "");
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.file, "osascript");
  assert.deepEqual(calls[0]?.args, [
    "-e",
    'tell application "Terminal" to activate',
    "-e",
    'tell application "Terminal" to do script "cd \'/tmp/demo\'; \'/usr/local/bin/openclaw\' \'models\' \'status\'"',
  ]);
});
