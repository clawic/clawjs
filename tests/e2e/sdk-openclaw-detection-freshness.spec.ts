import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { test, expect } from "./fixtures";

const execFileAsync = promisify(execFile);

test("demo openclaw status drops to not installed after the binary disappears", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-openclaw-freshness-"));
  const binDir = path.join(tempRoot, "bin");
  const preferredNpmDir = path.join(tempRoot, "preferred-npm");
  const fallbackNpmDir = path.join(tempRoot, "fallback-npm");
  const binaryPath = path.join(binDir, "openclaw");
  const wacliBinaryPath = path.join(binDir, "wacli");
  const preferredNpmPath = path.join(preferredNpmDir, "npm");
  const fallbackNpmPath = path.join(fallbackNpmDir, "npm");
  const stateDir = path.join(tempRoot, "state");
  const workspaceDir = path.join(tempRoot, "workspace");
  const agentDir = path.join(tempRoot, "agent");
  const homeDir = path.join(tempRoot, "home");

  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(preferredNpmDir, { recursive: true });
  fs.mkdirSync(fallbackNpmDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });

  fs.writeFileSync(binaryPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "openclaw 9.9.9"
  exit 0
fi
echo "{}"
`, { mode: 0o755 });
  fs.writeFileSync(wacliBinaryPath, `#!/bin/sh
if [ "$1" = "--json" ] && [ "$2" = "auth" ] && [ "$3" = "status" ]; then
  echo '{"authenticated":false}'
  exit 0
fi
echo "{}"
`, { mode: 0o755 });
  fs.writeFileSync(preferredNpmPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  fs.writeFileSync(fallbackNpmPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  fs.writeFileSync(path.join(homeDir, ".bash_profile"), `export PATH=${JSON.stringify(`${fallbackNpmDir}:$PATH`)}\n`);

  const script = `
import fs from "fs";
import path from "path";

process.env.PATH = ${JSON.stringify(`${preferredNpmDir}:${binDir}:/usr/bin:/bin`)};
process.env.CLAWJS_FIND_COMMAND_STRICT_PATH = "1";
process.env.OPENCLAW_STATE_DIR = ${JSON.stringify(stateDir)};
process.env.OPENCLAW_WORKSPACE_DIR = ${JSON.stringify(workspaceDir)};
process.env.OPENCLAW_AGENT_DIR = ${JSON.stringify(agentDir)};
process.env.HOME = ${JSON.stringify(homeDir)};

const { findCommand, findCommandFresh } = await import("./demo/src/lib/platform.ts");
const { getClawJSOpenClawStatus } = await import("./demo/src/lib/openclaw-agent.ts");

const resolvedNpmPath = await findCommandFresh("npm");
const cachedPath = await findCommand("openclaw");
const cachedWacliPath = await findCommand("wacli");
fs.unlinkSync(${JSON.stringify(binaryPath)});
fs.unlinkSync(${JSON.stringify(wacliBinaryPath)});

const freshPath = await findCommandFresh("openclaw");
const freshWacliPath = await findCommandFresh("wacli");
const statusAfterRemoval = await getClawJSOpenClawStatus();

process.stdout.write(JSON.stringify({
  resolvedNpmPath,
  cachedPath,
  cachedWacliPath,
  freshPath,
  freshWacliPath,
  statusAfterRemoval,
}, null, 2));
`;

  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: rootDir,
    env: {
      ...process.env,
      CI: "1",
    },
  });

  const payload = JSON.parse(stdout) as {
    resolvedNpmPath: string | null;
    cachedPath: string | null;
    cachedWacliPath: string | null;
    freshPath: string | null;
    freshWacliPath: string | null;
    statusAfterRemoval: {
      installed: boolean;
      cliAvailable: boolean;
      version: string | null;
      needsSetup: boolean;
      ready: boolean;
    };
  };

  expect(payload.resolvedNpmPath).toBe(preferredNpmPath);
  expect(payload.cachedPath).toBe(binaryPath);
  expect(payload.cachedWacliPath).toBe(wacliBinaryPath);
  expect(payload.freshPath).toBeNull();
  expect(payload.freshWacliPath).toBeNull();
  expect(payload.statusAfterRemoval.installed).toBe(false);
  expect(payload.statusAfterRemoval.cliAvailable).toBe(false);
  expect(payload.statusAfterRemoval.version).toBeNull();
  expect(payload.statusAfterRemoval.ready).toBe(false);
  expect(payload.statusAfterRemoval.needsSetup).toBe(false);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(`
    <main style="font-family: Menlo, Monaco, monospace; padding: 32px; background: linear-gradient(135deg, #f6f2ea 0%, #dce7ef 100%); min-height: 100vh; color: #0f172a;">
      <section style="max-width: 960px; margin: 0 auto; background: rgba(255,255,255,0.92); border: 1px solid rgba(15,23,42,0.1); border-radius: 24px; padding: 28px; box-shadow: 0 24px 60px rgba(15,23,42,0.12);">
        <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #52606d;">SDK E2E</p>
        <h1 style="margin: 0 0 20px; font-size: 30px;">OpenClaw Detection Freshness</h1>
        <article style="padding: 16px; border-radius: 18px; background: #dce7ef; color: #10203a; margin-bottom: 20px;">
          <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Resolved npm Path</p>
          <p style="margin: 0; font-size: 16px; word-break: break-all;">${payload.resolvedNpmPath}</p>
        </article>
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px;">
          <article style="padding: 16px; border-radius: 18px; background: #0f1f38; color: #f8fafc;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Cached Path</p>
            <p style="margin: 0; font-size: 16px; word-break: break-all;">${payload.cachedPath}</p>
          </article>
          <article style="padding: 16px; border-radius: 18px; background: #ebf7ef; color: #166534;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Fresh Lookup After Delete</p>
            <p style="margin: 0; font-size: 28px;">${payload.freshPath === null ? "null" : payload.freshPath}</p>
          </article>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px;">
          <article style="padding: 16px; border-radius: 18px; background: #10203a; color: #f8fafc;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Cached wacli Path</p>
            <p style="margin: 0; font-size: 16px; word-break: break-all;">${payload.cachedWacliPath}</p>
          </article>
          <article style="padding: 16px; border-radius: 18px; background: #fff4db; color: #7c4a00;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Fresh wacli Lookup</p>
            <p style="margin: 0; font-size: 28px;">${payload.freshWacliPath === null ? "null" : payload.freshWacliPath}</p>
          </article>
        </div>
        <pre style="margin: 0 0 16px; white-space: pre-wrap; border-radius: 18px; background: #111827; color: #e5eefc; padding: 18px; font-size: 13px; line-height: 1.5;">${JSON.stringify(payload.statusAfterRemoval, null, 2)}</pre>
      </section>
    </main>
  `);

  const screenshotPath = path.join(rootDir, "artifacts", "e2e", "sdk-openclaw-detection-freshness.png");
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
});
