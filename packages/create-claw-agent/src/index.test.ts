import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  CREATE_CLAW_AGENT_EXIT_FAILURE,
  CREATE_CLAW_AGENT_EXIT_OK,
  CREATE_CLAW_AGENT_EXIT_USAGE,
  CREATE_CLAW_AGENT_USAGE,
  runCreateClawAgent,
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

test("runCreateClawAgent prints usage without arguments", async () => {
  const stdout = captureStream();
  const exitCode = await runCreateClawAgent([], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CREATE_CLAW_AGENT_EXIT_OK);
  assert.equal(stdout.getOutput().trim(), CREATE_CLAW_AGENT_USAGE);
});

test("runCreateClawAgent scaffolds an agent repository without installing dependencies", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-claw-agent-"));
  const stdout = captureStream();

  const exitCode = await runCreateClawAgent(["support-agent", "--skip-install"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CREATE_CLAW_AGENT_EXIT_OK);

  const appDir = path.join(tempRoot, "support-agent");
  const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
  assert.equal(packageJson.name, "support-agent");
  assert.equal(packageJson.dependencies["@clawjs/claw"], "^0.1.0");
  assert.equal(packageJson.devDependencies["@clawjs/cli"], "^0.1.0");
  assert.match(stdout.getOutput(), /agent:report/);

  const soul = fs.readFileSync(path.join(appDir, "SOUL.md"), "utf8");
  assert.match(soul, /Support Agent/);
  assert.doesNotMatch(soul, /__APP_/);

  const heartbeat = fs.readFileSync(path.join(appDir, "HEARTBEAT.md"), "utf8");
  assert.match(heartbeat, /heartbeat/i);

  const skillsReadme = fs.readFileSync(path.join(appDir, "skills", "README.md"), "utf8");
  assert.match(skillsReadme, /skills/i);

  const readme = fs.readFileSync(path.join(appDir, "README.md"), "utf8");
  assert.match(readme, /Support Agent/);
  assert.match(readme, /agent:reply/);
});

test("runCreateClawAgent refuses non-empty target directories", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-claw-agent-existing-"));
  const appDir = path.join(tempRoot, "support-agent");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, "keep.txt"), "existing", "utf8");
  const stderr = captureStream();

  const exitCode = await runCreateClawAgent(["support-agent", "--skip-install"], {
    stdout: captureStream().stream,
    stderr: stderr.stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CREATE_CLAW_AGENT_EXIT_FAILURE);
  assert.match(stderr.getOutput(), /not empty/);
});

test("runCreateClawAgent runs the selected package manager when installation is enabled", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-claw-agent-install-"));
  const commands: Array<{ command: string; args: string[]; cwd: string }> = [];

  const exitCode = await runCreateClawAgent(["support-agent", "--use-pnpm"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
    async runCommand(command, args, options) {
      commands.push({ command, args, cwd: options.cwd });
    },
  });

  assert.equal(exitCode, CREATE_CLAW_AGENT_EXIT_OK);
  assert.deepEqual(commands, [{
    command: "pnpm",
    args: ["install"],
    cwd: path.join(tempRoot, "support-agent"),
  }]);
});

test("runCreateClawAgent returns usage errors for conflicting positional arguments", async () => {
  const stdout = captureStream();
  const exitCode = await runCreateClawAgent(["one", "two"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CREATE_CLAW_AGENT_EXIT_USAGE);
  assert.equal(stdout.getOutput().trim(), CREATE_CLAW_AGENT_USAGE);
});
