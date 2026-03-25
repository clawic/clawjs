import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  CREATE_CLAW_APP_EXIT_FAILURE,
  CREATE_CLAW_APP_EXIT_OK,
  CREATE_CLAW_APP_EXIT_USAGE,
  CREATE_CLAW_APP_USAGE,
  runCreateClawApp,
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

test("runCreateClawApp prints usage without arguments", async () => {
  const stdout = captureStream();
  const exitCode = await runCreateClawApp([], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CREATE_CLAW_APP_EXIT_OK);
  assert.equal(stdout.getOutput().trim(), CREATE_CLAW_APP_USAGE);
});

test("runCreateClawApp scaffolds a Next.js app without installing dependencies", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-claw-app-"));
  const stdout = captureStream();

  const exitCode = await runCreateClawApp(["demo-app", "--skip-install"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CREATE_CLAW_APP_EXIT_OK);

  const appDir = path.join(tempRoot, "demo-app");
  const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
  assert.equal(packageJson.name, "demo-app");
  assert.equal(packageJson.dependencies["@clawjs/claw"], "^0.1.0");
  assert.equal(packageJson.devDependencies["@clawjs/cli"], "^0.1.0");
  assert.match(stdout.getOutput(), /claw:init/);

  const homePage = fs.readFileSync(path.join(appDir, "src", "app", "page.tsx"), "utf8");
  assert.doesNotMatch(homePage, /__APP_/);

  const readme = fs.readFileSync(path.join(appDir, "README.md"), "utf8");
  assert.match(readme, /Demo App/);

  const gitignore = fs.readFileSync(path.join(appDir, ".gitignore"), "utf8");
  assert.match(gitignore, /\.next/);
});

test("runCreateClawApp refuses non-empty target directories", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-claw-app-existing-"));
  const appDir = path.join(tempRoot, "demo-app");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, "keep.txt"), "existing", "utf8");
  const stderr = captureStream();

  const exitCode = await runCreateClawApp(["demo-app", "--skip-install"], {
    stdout: captureStream().stream,
    stderr: stderr.stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CREATE_CLAW_APP_EXIT_FAILURE);
  assert.match(stderr.getOutput(), /not empty/);
});

test("runCreateClawApp runs the selected package manager when installation is enabled", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-claw-app-install-"));
  const commands: Array<{ command: string; args: string[]; cwd: string }> = [];

  const exitCode = await runCreateClawApp(["demo-app", "--use-pnpm"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
    async runCommand(command, args, options) {
      commands.push({ command, args, cwd: options.cwd });
    },
  });

  assert.equal(exitCode, CREATE_CLAW_APP_EXIT_OK);
  assert.deepEqual(commands, [{
    command: "pnpm",
    args: ["install"],
    cwd: path.join(tempRoot, "demo-app"),
  }]);
});

test("runCreateClawApp returns usage errors for conflicting positional arguments", async () => {
  const stdout = captureStream();
  const exitCode = await runCreateClawApp(["one", "two"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CREATE_CLAW_APP_EXIT_USAGE);
  assert.equal(stdout.getOutput().trim(), CREATE_CLAW_APP_USAGE);
});
