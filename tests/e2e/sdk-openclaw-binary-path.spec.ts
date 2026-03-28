import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { pathToFileURL } from "url";

import { test, expect } from "./fixtures";

const execFileAsync = promisify(execFile);

test("sdk accepts runtime.binaryPath when openclaw is outside PATH", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-openclaw-binary-"));
const workspaceDir = path.join(tempRoot, "workspace");
const openclawLog = path.join(tempRoot, "openclaw.log");
const binaryPath = path.join(tempRoot, "bin", "custom-openclaw");
  const configPath = path.join(tempRoot, "openclaw.json");
  const moduleUrl = pathToFileURL(path.join(rootDir, "packages", "clawjs-node", "dist", "index.js")).href;

fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
  fs.writeFileSync(binaryPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const logPath = ${JSON.stringify(openclawLog)};

fs.appendFileSync(logPath, JSON.stringify({
  args,
  stateDir: process.env.OPENCLAW_STATE_DIR || null,
  configPath: process.env.OPENCLAW_CONFIG_PATH || null,
}) + "\\n");

if (args[0] === "--version") {
  process.stdout.write("openclaw 7.7.7\\n");
  process.exit(0);
}

if (args[0] === "models" && args[1] === "status") {
  process.stdout.write("{}\\n");
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

if (args[0] === "agents" && args[1] === "add") {
  process.stdout.write("{}\\n");
  process.exit(0);
}

if (args[0] === "gateway" && args[1] === "call") {
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
    homeDir: ${JSON.stringify(tempRoot)},
    configPath: ${JSON.stringify(configPath)},
    env: {
      ...process.env,
      PATH: process.env.PATH || "",
    },
  },
  workspace: {
    appId: "demo",
    workspaceId: "demo-e2e-binary-path",
    agentId: "demo-e2e-binary-path",
    rootDir: ${JSON.stringify(workspaceDir)},
  },
});

const status = await claw.runtime.status();
await claw.runtime.setupWorkspace();

process.stdout.write(JSON.stringify({
  cliAvailable: status.cliAvailable,
  version: status.version,
  commands: fs.readFileSync(${JSON.stringify(openclawLog)}, "utf8")
    .trim()
    .split("\\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line)),
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
    cliAvailable: boolean;
    version: string;
    commands: Array<{
      args: string[];
      stateDir: string | null;
      configPath: string | null;
    }>;
  };

  expect(payload.cliAvailable).toBeTruthy();
  expect(payload.version).toBe("7.7.7");
  const setupCommand = payload.commands.find((command) => command.args.join(" ").startsWith("agents add demo-e2e-binary-path"));
  expect(setupCommand).toBeTruthy();
  expect(setupCommand?.configPath).toBe(configPath);
  expect(setupCommand?.stateDir).toBe(tempRoot);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(`
    <main style="font-family: Menlo, Monaco, monospace; padding: 32px; background: linear-gradient(135deg, #f6f5ef 0%, #e7edf7 100%); min-height: 100vh; color: #10203a;">
      <section style="max-width: 920px; margin: 0 auto; background: rgba(255,255,255,0.88); border: 1px solid rgba(16,32,58,0.12); border-radius: 24px; padding: 28px; box-shadow: 0 24px 60px rgba(16,32,58,0.12);">
        <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #4d6487;">SDK E2E</p>
        <h1 style="margin: 0 0 20px; font-size: 30px;">OpenClaw Binary Path Override</h1>
        <p style="margin: 0 0 18px; font-size: 16px; line-height: 1.6;">Hermetic validation of <code>runtime.binaryPath</code> with the OpenClaw binary removed from <code>PATH</code>.</p>
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px;">
          <article style="padding: 16px; border-radius: 18px; background: #0f1f38; color: #f6f5ef;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">CLI Available</p>
            <p style="margin: 0; font-size: 28px;">${payload.cliAvailable ? "true" : "false"}</p>
          </article>
          <article style="padding: 16px; border-radius: 18px; background: #d9e7fb; color: #10203a;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Resolved Version</p>
            <p style="margin: 0; font-size: 28px;">${payload.version}</p>
          </article>
        </div>
        <h2 style="margin: 0 0 12px; font-size: 18px;">Observed Commands</h2>
        <pre style="margin: 0; white-space: pre-wrap; border-radius: 18px; background: #111827; color: #e5eefc; padding: 18px; font-size: 13px; line-height: 1.5;">${JSON.stringify(payload.commands, null, 2)}</pre>
      </section>
    </main>
  `);

  const screenshotPath = path.join(rootDir, "artifacts", "e2e", "sdk-openclaw-binary-path.png");
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
});
