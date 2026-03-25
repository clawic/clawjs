import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const defaultSpecFiles = [
  "tests/e2e/demo-api-coverage.spec.ts",
  "tests/e2e/demo-api.spec.ts",
  "tests/e2e/demo-calendar.spec.ts",
  "tests/e2e/demo-chat.spec.ts",
  "tests/e2e/demo-contacts.spec.ts",
  "tests/e2e/demo-onboarding.spec.ts",
  "tests/e2e/demo-settings-deep.spec.ts",
  "tests/e2e/demo-settings.spec.ts",
  "tests/e2e/demo-system.spec.ts",
  "tests/e2e/demo-tools.spec.ts",
  "tests/e2e/demo-workspace.spec.ts",
  "tests/e2e/repository-package-surface.spec.ts",
  "tests/e2e/repository-release-readiness.spec.ts",
  "tests/e2e/website-docs.spec.ts",
  "tests/e2e/generator-smoke.spec.ts",
];

const argv = process.argv.slice(2);
const explicitSpecs = argv.filter((arg) => arg.endsWith(".spec.ts"));
const extraArgs = argv.filter((arg) => !arg.endsWith(".spec.ts"));
const targets = explicitSpecs.length > 0 ? explicitSpecs : defaultSpecFiles;
const require = createRequire(import.meta.url);
const E2E_PORT = "4317";

function resolvePlaywrightCli() {
  for (const candidate of ["playwright/cli.js", "playwright-core/cli.js"]) {
    try {
      return require.resolve(candidate);
    } catch {
      // Try the next installed CLI location.
    }
  }
  return path.join(process.cwd(), "node_modules", "playwright", "cli.js");
}

const cliPath = resolvePlaywrightCli();

function stopExistingWebServer() {
  const findPids = () => spawnSync("lsof", ["-ti", `tcp:${E2E_PORT}`], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });

  const lookup = findPids();
  if (lookup.status !== 0 || !lookup.stdout.trim()) {
    return;
  }

  const pids = [...new Set(
    lookup.stdout
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean),
  )];

  for (const pid of pids) {
    const numericPid = Number(pid);
    if (!Number.isInteger(numericPid)) continue;
    try {
      process.kill(numericPid, "SIGTERM");
    } catch {
      // Process may already be gone.
    }
  }

  const retry = findPids();
  if (retry.status !== 0 || !retry.stdout.trim()) {
    return;
  }

  for (const pid of retry.stdout.split(/\s+/).map((value) => value.trim()).filter(Boolean)) {
    const numericPid = Number(pid);
    if (!Number.isInteger(numericPid)) continue;
    try {
      process.kill(numericPid, "SIGKILL");
    } catch {
      // Best-effort cleanup only.
    }
  }
}

for (const target of targets) {
  stopExistingWebServer();
  const child = spawnSync(process.execPath, [cliPath, "test", target, ...extraArgs], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}
