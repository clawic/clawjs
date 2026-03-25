import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  CREATE_CLAW_SERVER_EXIT_FAILURE,
  CREATE_CLAW_SERVER_EXIT_OK,
  CREATE_CLAW_SERVER_EXIT_USAGE,
  CREATE_CLAW_SERVER_USAGE,
  runCreateClawServer,
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

test("runCreateClawServer prints usage without arguments", async () => {
  const stdout = captureStream();
  const exitCode = await runCreateClawServer([], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CREATE_CLAW_SERVER_EXIT_OK);
  assert.equal(stdout.getOutput().trim(), CREATE_CLAW_SERVER_USAGE);
});

test("runCreateClawServer scaffolds a Node.js server without installing dependencies", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-claw-server-"));
  const stdout = captureStream();

  const exitCode = await runCreateClawServer(["demo-server", "--skip-install"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CREATE_CLAW_SERVER_EXIT_OK);

  const appDir = path.join(tempRoot, "demo-server");
  const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
  assert.equal(packageJson.name, "demo-server");
  assert.equal(packageJson.dependencies["@clawjs/claw"], "^0.1.0");
  assert.equal(packageJson.devDependencies["@clawjs/cli"], "^0.1.0");
  assert.match(stdout.getOutput(), /claw:init/);

  const serverFile = fs.readFileSync(path.join(appDir, "src", "server.ts"), "utf8");
  assert.doesNotMatch(serverFile, /__APP_/);
  assert.match(serverFile, /api\/sessions/);

  const readme = fs.readFileSync(path.join(appDir, "README.md"), "utf8");
  assert.match(readme, /Demo Server/);
  assert.match(readme, /curl/);

  const gitignore = fs.readFileSync(path.join(appDir, ".gitignore"), "utf8");
  assert.match(gitignore, /dist/);
});

test("runCreateClawServer refuses non-empty target directories", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-claw-server-existing-"));
  const appDir = path.join(tempRoot, "demo-server");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, "keep.txt"), "existing", "utf8");
  const stderr = captureStream();

  const exitCode = await runCreateClawServer(["demo-server", "--skip-install"], {
    stdout: captureStream().stream,
    stderr: stderr.stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CREATE_CLAW_SERVER_EXIT_FAILURE);
  assert.match(stderr.getOutput(), /not empty/);
});

test("runCreateClawServer runs the selected package manager when installation is enabled", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-claw-server-install-"));
  const commands: Array<{ command: string; args: string[]; cwd: string }> = [];

  const exitCode = await runCreateClawServer(["demo-server", "--use-pnpm"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
    async runCommand(command, args, options) {
      commands.push({ command, args, cwd: options.cwd });
    },
  });

  assert.equal(exitCode, CREATE_CLAW_SERVER_EXIT_OK);
  assert.deepEqual(commands, [{
    command: "pnpm",
    args: ["install"],
    cwd: path.join(tempRoot, "demo-server"),
  }]);
});

test("runCreateClawServer returns usage errors for conflicting positional arguments", async () => {
  const stdout = captureStream();
  const exitCode = await runCreateClawServer(["one", "two"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CREATE_CLAW_SERVER_EXIT_USAGE);
  assert.equal(stdout.getOutput().trim(), CREATE_CLAW_SERVER_USAGE);
});
