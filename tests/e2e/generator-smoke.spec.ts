import fs from "fs";
import os from "os";
import path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";

import { test, expect } from "./fixtures";

const execFileAsync = promisify(execFile);

async function waitForHttp(url: string, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test("create-claw-app scaffolds a runnable app", async ({ request }) => {
  test.setTimeout(240_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-app-"));
  const targetDir = path.join(tempRoot, "generated-app");

  await execFileAsync("npm", ["run", "build", "--workspace", "create-claw-app"], { cwd: rootDir });

  await execFileAsync("node", [
    path.join(rootDir, "packages", "create-claw-app", "bin", "create-claw-app.mjs"),
    targetDir,
    "--skip-install",
    "--use-npm",
  ], { cwd: rootDir });

  const packageJsonPath = path.join(targetDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    overrides?: Record<string, string>;
  };

  packageJson.dependencies["@clawjs/claw"] = `file:${path.join(rootDir, "packages", "clawjs-node")}`;
  delete packageJson.devDependencies["@clawjs/cli"];
  packageJson.overrides = {
    ...(packageJson.overrides ?? {}),
    "@clawjs/core": `file:${path.join(rootDir, "packages", "clawjs-core")}`,
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  await execFileAsync("npm", ["install"], { cwd: targetDir, env: { ...process.env, CI: "1" } });
  await execFileAsync("npm", ["run", "build"], { cwd: targetDir, env: { ...process.env, CI: "1" } });

  const server = spawn("npm", ["run", "start", "--", "--port", "4310"], {
    cwd: targetDir,
    env: { ...process.env, CI: "1" },
    stdio: "ignore",
  });

  try {
    await waitForHttp("http://127.0.0.1:4310");
    const response = await request.get("http://127.0.0.1:4310");
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toContain("Claw");
  } finally {
    server.kill("SIGTERM");
  }
});
