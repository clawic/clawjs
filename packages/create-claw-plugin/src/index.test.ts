import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  CREATE_CLAW_PLUGIN_EXIT_FAILURE,
  CREATE_CLAW_PLUGIN_EXIT_OK,
  CREATE_CLAW_PLUGIN_EXIT_USAGE,
  CREATE_CLAW_PLUGIN_USAGE,
  runCreateClawPlugin,
} from "./index.ts";

function captureStream() {
  let output = "";
  return {
    stream: {
      write(chunk: string) {
        output += chunk;
        return true;
      },
    } as unknown as NodeJS.WritableStream,
    getOutput() {
      return output;
    },
  };
}

test("runCreateClawPlugin prints usage without arguments", async () => {
  const stdout = captureStream();
  const exitCode = await runCreateClawPlugin([], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CREATE_CLAW_PLUGIN_EXIT_OK);
  assert.equal(stdout.getOutput().trim(), CREATE_CLAW_PLUGIN_USAGE);
});

test("runCreateClawPlugin scaffolds a distributed plugin package without installing dependencies", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-claw-plugin-"));
  const stdout = captureStream();

  const exitCode = await runCreateClawPlugin(["jira-integration", "--skip-install"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CREATE_CLAW_PLUGIN_EXIT_OK);

  const appDir = path.join(tempRoot, "jira-integration");
  const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
  assert.equal(packageJson.name, "jira-integration");
  assert.equal(packageJson.scripts["plugin:check"], "tsx src/harness.ts check");
  assert.match(stdout.getOutput(), /plugin:check/);

  const manifest = JSON.parse(fs.readFileSync(path.join(appDir, "plugin.json"), "utf8"));
  assert.equal(manifest.id, "jira-integration");
  assert.equal(manifest.name, "Jira Integration");
  assert.equal(manifest.skills[0].id, "jira-integration-triage");

  const hooks = fs.readFileSync(path.join(appDir, "src", "hooks.ts"), "utf8");
  assert.match(hooks, /beforeSessionStart/);

  const skill = fs.readFileSync(path.join(appDir, "src", "skills", "triage.ts"), "utf8");
  assert.match(skill, /runTriageSkill/);

  const config = fs.readFileSync(path.join(appDir, "src", "config.ts"), "utf8");
  assert.match(config, /validatePluginConfig/);

  const verifyScript = fs.readFileSync(path.join(appDir, "src", "verify.ts"), "utf8");
  assert.match(verifyScript, /activatePlugin/);
});

test("runCreateClawPlugin refuses non-empty target directories", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-claw-plugin-existing-"));
  const appDir = path.join(tempRoot, "jira-integration");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, "keep.txt"), "existing", "utf8");
  const stderr = captureStream();

  const exitCode = await runCreateClawPlugin(["jira-integration", "--skip-install"], {
    stdout: captureStream().stream,
    stderr: stderr.stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CREATE_CLAW_PLUGIN_EXIT_FAILURE);
  assert.match(stderr.getOutput(), /not empty/);
});

test("runCreateClawPlugin runs the selected package manager when installation is enabled", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-claw-plugin-install-"));
  const commands: Array<{ command: string; args: string[]; cwd: string }> = [];

  const exitCode = await runCreateClawPlugin(["jira-integration", "--use-pnpm"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
    async runCommand(command, args, options) {
      commands.push({ command, args, cwd: options.cwd });
    },
  });

  assert.equal(exitCode, CREATE_CLAW_PLUGIN_EXIT_OK);
  assert.deepEqual(commands, [{
    command: "pnpm",
    args: ["install"],
    cwd: path.join(tempRoot, "jira-integration"),
  }]);
});

test("runCreateClawPlugin returns usage errors for conflicting positional arguments", async () => {
  const stdout = captureStream();
  const exitCode = await runCreateClawPlugin(["one", "two"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CREATE_CLAW_PLUGIN_EXIT_USAGE);
  assert.equal(stdout.getOutput().trim(), CREATE_CLAW_PLUGIN_USAGE);
});
