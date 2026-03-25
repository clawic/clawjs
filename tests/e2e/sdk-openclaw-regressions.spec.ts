import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { pathToFileURL } from "url";

import { test, expect } from "./fixtures";

const execFileAsync = promisify(execFile);

test("sdk preserves installed/modelId compatibility and surfaces gateway lifecycle failures", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-openclaw-regressions-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const gatewayStatePath = path.join(tempRoot, "gateway-state.txt");
  const binaryPath = path.join(tempRoot, "bin", "custom-openclaw");
  const moduleUrl = pathToFileURL(path.join(rootDir, "packages", "clawjs-node", "dist", "index.js")).href;

  fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(binaryPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const gatewayStatePath = ${JSON.stringify(gatewayStatePath)};

const gatewayRunning = () => fs.existsSync(gatewayStatePath) && fs.readFileSync(gatewayStatePath, "utf8").trim() === "running";

if (args[0] === "--version") {
  process.stdout.write("openclaw 9.9.9\\n");
  process.exit(0);
}

if (args[0] === "models" && args.includes("status")) {
  process.stdout.write(JSON.stringify({
    defaultModel: "openai/gpt-5.4",
    auth: {
      missingProvidersInUse: [],
      providers: [
        {
          provider: "openai",
          effective: { kind: "apiKey" },
          profiles: { apiKey: 1 },
        },
      ],
    },
  }) + "\\n");
  process.exit(0);
}

if (args[0] === "agents" && args[1] === "list") {
  process.stdout.write("[]\\n");
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "list") {
  process.stdout.write('{"plugins":[],"diagnostics":[]}\\n');
  process.exit(0);
}

if (args[0] === "gateway" && args[1] === "start") {
  process.stdout.write("Gateway service not loaded.\\nStart with: openclaw gateway install\\n");
  process.exit(0);
}

if (args[0] === "gateway" && args[1] === "stop") {
  process.stdout.write("ignored stop\\n");
  process.exit(0);
}

if (args[0] === "gateway" && args[1] === "call") {
  if (gatewayRunning()) {
    process.stdout.write('{"ok":true}\\n');
    process.exit(0);
  }
  process.stderr.write("gateway closed\\n");
  process.exit(1);
}

process.stdout.write("{}\\n");
process.exit(0);
`, { mode: 0o755 });

  const script = `
import fs from "fs";

const { Claw } = await import(${JSON.stringify(moduleUrl)});
  const claw = await Claw({
  runtime: {
    adapter: "openclaw",
    binaryPath: ${JSON.stringify(binaryPath)},
    gateway: {
      url: "http://127.0.0.1:18789",
    },
    env: {
      ...process.env,
      PATH: process.env.PATH || "",
    },
  },
  workspace: {
    appId: "demo",
    workspaceId: "demo-e2e-openclaw-regressions",
    agentId: "demo-e2e-openclaw-regressions",
    rootDir: ${JSON.stringify(workspaceDir)},
  },
});

const status = await claw.runtime.status();
const models = await claw.models.list();
const effectiveModelId = models[0]?.modelId ?? models[0]?.id ?? null;

let startError = null;
try {
  await claw.runtime.gateway.start();
} catch (error) {
  startError = error instanceof Error ? error.message : String(error);
}

fs.writeFileSync(${JSON.stringify(gatewayStatePath)}, "running\\n");

let stopError = null;
try {
  await claw.runtime.gateway.stop();
} catch (error) {
  stopError = error instanceof Error ? error.message : String(error);
}

process.stdout.write(JSON.stringify({
  installed: status.installed,
  cliAvailable: status.cliAvailable,
  modelId: effectiveModelId,
  id: models[0]?.id ?? null,
  startError,
  stopError,
}, null, 2));
`;

  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: process.env.PATH || "",
      CI: "1",
    },
  });

  const payload = JSON.parse(stdout) as {
    installed: boolean;
    cliAvailable: boolean;
    modelId: string | null;
    id: string | null;
    startError: string | null;
    stopError: string | null;
  };

  expect(payload.installed).toBe(true);
  expect(payload.cliAvailable).toBe(true);
  expect(payload.modelId).toBe("openai/gpt-5.4");
  expect(payload.modelId).toBe(payload.id);
  expect(payload.startError).toMatch(/gateway start did not reach the expected state/i);
  expect(payload.stopError).toMatch(/gateway stop did not reach the expected state/i);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(`
    <main style="font-family: Menlo, Monaco, monospace; padding: 32px; background: linear-gradient(135deg, #eef4ea 0%, #dbe7f4 100%); min-height: 100vh; color: #10203a;">
      <section style="max-width: 980px; margin: 0 auto; background: rgba(255,255,255,0.9); border: 1px solid rgba(16,32,58,0.12); border-radius: 24px; padding: 28px; box-shadow: 0 24px 60px rgba(16,32,58,0.12);">
        <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #4d6487;">SDK E2E</p>
        <h1 style="margin: 0 0 20px; font-size: 30px;">OpenClaw Regression Guard</h1>
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px;">
          <article style="padding: 16px; border-radius: 18px; background: #0f1f38; color: #f6f5ef;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Installed Alias</p>
            <p style="margin: 0; font-size: 28px;">${payload.installed ? "true" : "false"}</p>
          </article>
          <article style="padding: 16px; border-radius: 18px; background: #d9e7fb; color: #10203a;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Model Identity</p>
            <p style="margin: 0; font-size: 18px;">${payload.modelId}</p>
          </article>
        </div>
        <h2 style="margin: 0 0 12px; font-size: 18px;">Gateway Failures Surface As Errors</h2>
        <pre style="margin: 0 0 16px; white-space: pre-wrap; border-radius: 18px; background: #111827; color: #e5eefc; padding: 18px; font-size: 13px; line-height: 1.5;">start: ${payload.startError}</pre>
        <pre style="margin: 0; white-space: pre-wrap; border-radius: 18px; background: #111827; color: #e5eefc; padding: 18px; font-size: 13px; line-height: 1.5;">stop: ${payload.stopError}</pre>
      </section>
    </main>
  `);

  const screenshotPath = path.join(rootDir, "artifacts", "e2e", "sdk-openclaw-regressions.png");
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
});
