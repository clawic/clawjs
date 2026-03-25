import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  buildCapabilitySignature,
  buildCompatReport,
  buildDoctorReport,
  buildOpenClawInstallCommand,
  buildOpenClawRuntimeProgressPlan,
  buildOpenClawRepairCommand,
  buildOpenClawUninstallCommand,
  buildOpenClawWorkspaceSetupCommand,
  describeOpenClawVersion,
  getOpenClawRuntimeStatus,
  installOpenClawRuntime,
  probeOpenClawCapabilities,
  parseOpenClawVersion,
  repairOpenClawRuntime,
  setupOpenClawWorkspace,
  uninstallOpenClawRuntime,
  type CommandRunner,
  type OpenClawRuntimeProgressEvent,
} from "./openclaw.ts";
import { NodeProcessHost } from "../host/process.ts";
import { createMockRuntimeProbeStatus } from "./test-helpers.ts";

class FakeRunner implements CommandRunner {
  private readonly handlers: Record<string, { stdout?: string; stderr?: string; fail?: boolean }>;

  constructor(handlers: Record<string, { stdout?: string; stderr?: string; fail?: boolean }>) {
    this.handlers = handlers;
  }

  async exec(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const key = `${command} ${args.join(" ")}`.trim();
    const handler = this.handlers[key];
    if (!handler) {
      throw new Error(`missing handler for ${key}`);
    }
    if (handler.fail) {
      throw new Error(handler.stderr || "failed");
    }
    return {
      stdout: handler.stdout || "",
      stderr: handler.stderr || "",
      exitCode: 0,
    };
  }
}

test("parseOpenClawVersion normalizes CLI output", () => {
  assert.equal(parseOpenClawVersion("openclaw 1.2.3\n"), "1.2.3");
  assert.equal(parseOpenClawVersion("OpenClaw version v1.2.3 (build 4)"), "1.2.3");
  assert.equal(parseOpenClawVersion("openclaw/1.2.3-alpha.1+build.7"), "1.2.3-alpha.1+build.7");
  assert.equal(parseOpenClawVersion(""), null);
});

test("describeOpenClawVersion exposes parse strategy and version family", () => {
  assert.deepEqual(describeOpenClawVersion("openclaw 1.2.3 (build 4)"), {
    version: "1.2.3",
    strategy: "semver-token",
    family: "1.2",
  });

  assert.deepEqual(describeOpenClawVersion("OpenClaw version rc-2026.03"), {
    version: "rc-2026.03",
    strategy: "openclaw-prefix",
    family: null,
  });
});

test("getOpenClawRuntimeStatus detects capabilities", async () => {
  const runner = new FakeRunner({
    "which openclaw": { stdout: "/usr/local/bin/openclaw\n" },
    "openclaw --version": { stdout: "openclaw 1.2.3\n" },
    "openclaw models status --json": { stdout: "{}" },
    "openclaw agents list --json": { stdout: "[]" },
    "openclaw gateway call --json --timeout 1000 --params {\"probe\":true} channels.status": { fail: true, stderr: "unavailable" },
    "openclaw plugins list --json": { stdout: "{\"plugins\":[]}" },
  });

  const status = await getOpenClawRuntimeStatus(runner);
  assert.equal(status.cliAvailable, true);
  assert.equal(status.version, "1.2.3");
  assert.equal(status.capabilities.modelsStatus, true);
  assert.equal(status.capabilities.gatewayCall, false);
  assert.equal(status.capabilities.pluginsList, true);
  assert.equal(status.capabilityMap.channels.supported, true);
  assert.equal(status.capabilityMap.channels.status, "degraded");
  assert.equal(status.capabilityMap.plugins.supported, true);
});

test("probeOpenClawCapabilities reports a matrix when command availability changes", async () => {
  const runner = new FakeRunner({
    "which openclaw": { stdout: "/usr/local/bin/openclaw\n" },
    "openclaw --version": { stdout: "openclaw 1.2.3\n" },
    "openclaw models status --json": { fail: true, stderr: "missing" },
    "openclaw agents list --json": { stdout: "[]" },
    "openclaw gateway call --json --timeout 1000 --params {\"probe\":true} channels.status": { stdout: "{}" },
    "openclaw plugins list --json": { stdout: "{\"plugins\":[]}" },
  });

  const capabilities = await probeOpenClawCapabilities(runner);
  assert.deepEqual(capabilities, {
    version: true,
    modelsStatus: false,
    agentsList: true,
    gatewayCall: true,
    pluginsList: true,
  });
});

test("compat and doctor reports degrade when capabilities are missing", () => {
  const compat = buildCompatReport(createMockRuntimeProbeStatus({
    adapter: "openclaw",
    runtimeName: "OpenClaw",
    version: "1.2.3",
    cliAvailable: true,
    gatewayAvailable: false,
    capabilities: {
      version: true,
      modelsStatus: false,
      agentsList: true,
      gatewayCall: false,
      pluginsList: true,
    },
    diagnostics: {},
  }));
  assert.equal(compat.degraded, true);
  assert.equal(compat.diagnostics?.versionFamily, "1.2");
  assert.equal(compat.diagnostics?.capabilitySignature, buildCapabilitySignature({
    version: true,
    modelsStatus: false,
    agentsList: true,
    gatewayCall: false,
    pluginsList: true,
  }));

  const doctor = buildDoctorReport(createMockRuntimeProbeStatus({
    adapter: "openclaw",
    runtimeName: "OpenClaw",
    version: null,
    cliAvailable: false,
    gatewayAvailable: false,
    capabilities: {
      version: false,
      modelsStatus: false,
      agentsList: false,
      gatewayCall: false,
      pluginsList: false,
    },
    diagnostics: {},
  }));
  assert.equal(doctor.ok, false);
  assert.match(doctor.suggestedRepairs[0] || "", /Install OpenClaw/);
});

test("runtime install, uninstall, setup, and repair build the expected commands", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner: CommandRunner = {
    async exec(command, args) {
      calls.push({ command, args });
      return { stdout: "", stderr: "", exitCode: 0 };
    },
  };

  assert.deepEqual(buildOpenClawInstallCommand("npm"), {
    command: "npm",
    args: ["install", "-g", "openclaw"],
  });
  assert.deepEqual(buildOpenClawUninstallCommand("npm"), {
    command: "npm",
    args: ["uninstall", "-g", "openclaw"],
  });
  assert.deepEqual(buildOpenClawWorkspaceSetupCommand({ agentId: "demo", workspaceDir: "/tmp/demo" }), {
    command: "openclaw",
    args: ["agents", "add", "demo", "--non-interactive", "--workspace", "/tmp/demo", "--json"],
  });
  assert.deepEqual(buildOpenClawRepairCommand(), {
    command: "openclaw",
    args: ["gateway", "install"],
  });

  await installOpenClawRuntime(runner, "pnpm");
  await uninstallOpenClawRuntime(runner, "pnpm");
  await setupOpenClawWorkspace({ agentId: "demo", workspaceDir: "/tmp/demo" }, runner);
  await repairOpenClawRuntime(runner);

  assert.deepEqual(calls[0], {
    command: "pnpm",
    args: ["add", "-g", "openclaw"],
  });
  assert.deepEqual(calls[1], {
    command: "pnpm",
    args: ["remove", "-g", "openclaw"],
  });
  assert.deepEqual(calls[2], {
    command: "openclaw",
    args: ["agents", "add", "demo", "--non-interactive", "--workspace", "/tmp/demo", "--json"],
  });
  assert.deepEqual(calls[3], {
    command: "openclaw",
    args: ["gateway", "install"],
  });
});

test("buildOpenClawRuntimeProgressPlan returns structured progress phases", () => {
  const installPlan = buildOpenClawRuntimeProgressPlan("install", undefined, "pnpm");
  assert.equal(installPlan.capability, "runtime");
  assert.deepEqual(
    installPlan.steps.map((step) => step.phase),
    ["runtime.install.prepare", "runtime.install.execute", "runtime.install.finalize"],
  );
  assert.deepEqual(installPlan.steps[1]?.command, {
    command: "pnpm",
    args: ["add", "-g", "openclaw"],
  });

  const uninstallPlan = buildOpenClawRuntimeProgressPlan("uninstall", undefined, "pnpm");
  assert.equal(uninstallPlan.capability, "runtime");
  assert.deepEqual(
    uninstallPlan.steps.map((step) => step.phase),
    ["runtime.uninstall.prepare", "runtime.uninstall.execute", "runtime.uninstall.finalize"],
  );
  assert.deepEqual(uninstallPlan.steps[1]?.command, {
    command: "pnpm",
    args: ["remove", "-g", "openclaw"],
  });

  const setupPlan = buildOpenClawRuntimeProgressPlan("setup", {
    agentId: "demo",
    workspaceDir: "/tmp/demo",
  });
  assert.equal(setupPlan.capability, "workspace");
  assert.deepEqual(
    setupPlan.steps.map((step) => step.phase),
    ["workspace.setup.prepare", "workspace.setup.execute", "workspace.setup.finalize"],
  );
});

test("runtime operations emit structured progress events", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const events: OpenClawRuntimeProgressEvent[] = [];
  const runner: CommandRunner = {
    async exec(command, args) {
      calls.push({ command, args });
      return { stdout: "", stderr: "", exitCode: 0 };
    },
  };

  await installOpenClawRuntime(runner, "pnpm", (event) => {
    events.push(event);
  });
  await uninstallOpenClawRuntime(runner, "pnpm", (event) => {
    events.push(event);
  });
  await setupOpenClawWorkspace({ agentId: "demo", workspaceDir: "/tmp/demo" }, runner, (event) => {
    events.push(event);
  });
  await repairOpenClawRuntime(runner, (event) => {
    events.push(event);
  });

  assert.ok(events.length > 0);
  assert.equal(events[0]?.status, "start");
  assert.equal(events[1]?.status, "complete");
  assert.equal(events.find((event) => event.phase === "runtime.install.execute" && event.status === "complete")?.capability, "runtime");
  assert.equal(events.find((event) => event.phase === "runtime.uninstall.execute" && event.status === "complete")?.capability, "runtime");
  assert.equal(events.find((event) => event.phase === "workspace.setup.execute" && event.status === "complete")?.capability, "workspace");
  assert.equal(events.find((event) => event.phase === "runtime.repair.execute" && event.status === "complete")?.status, "complete");

  assert.deepEqual(calls, [
    { command: "pnpm", args: ["add", "-g", "openclaw"] },
    { command: "pnpm", args: ["remove", "-g", "openclaw"] },
    {
      command: "openclaw",
      args: ["agents", "add", "demo", "--non-interactive", "--workspace", "/tmp/demo", "--json"],
    },
    { command: "openclaw", args: ["gateway", "install"] },
  ]);
});

test("setup can be retried after a partial failure", async () => {
  let attempts = 0;
  const runner: CommandRunner = {
    async exec(command, args) {
      attempts += 1;
      if (attempts === 1) {
        throw new Error(`failed ${command} ${args.join(" ")}`);
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    },
  };

  await assert.rejects(() => setupOpenClawWorkspace({ agentId: "demo", workspaceDir: "/tmp/demo" }, runner));
  await setupOpenClawWorkspace({ agentId: "demo", workspaceDir: "/tmp/demo" }, runner);
  assert.equal(attempts, 2);
});

test("runtime commands can run against a fake OpenClaw toolchain on PATH", async () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-bin-"));
  const npmLog = path.join(binDir, "npm.log");
  const openclawPath = path.join(binDir, "openclaw");
  const npmPath = path.join(binDir, "npm");

  fs.writeFileSync(openclawPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "openclaw 1.2.3"
  exit 0
fi
if [ "$1" = "models" ] && [ "$2" = "status" ]; then
  echo "{}"
  exit 0
fi
if [ "$1" = "agents" ] && [ "$2" = "list" ]; then
  echo "[]"
  exit 0
fi
if [ "$1" = "plugins" ] && [ "$2" = "list" ]; then
  echo '{"plugins":[]}'
  exit 0
fi
if [ "$1" = "agents" ] && [ "$2" = "add" ]; then
  echo "{}"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "install" ]; then
  echo "ok"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "call" ]; then
  exit 1
fi
exit 0
`, { mode: 0o755 });
  fs.writeFileSync(npmPath, `#!/bin/sh
echo "$@" >> "${npmLog}"
exit 0
`, { mode: 0o755 });

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  };
  const host = new NodeProcessHost();
  const runner: CommandRunner = {
    exec(command, args, options = {}) {
      return host.exec(command, args, {
        ...options,
        env: {
          ...env,
          ...(options.env ?? {}),
        },
      });
    },
  };

  const status = await getOpenClawRuntimeStatus(runner);
  assert.equal(status.cliAvailable, true);
  assert.equal(status.version, "1.2.3");

  await installOpenClawRuntime(runner, "npm");
  await setupOpenClawWorkspace({ agentId: "demo", workspaceDir: "/tmp/demo" }, runner);
  await repairOpenClawRuntime(runner);

  assert.match(fs.readFileSync(npmLog, "utf8"), /install -g openclaw/);
});

test("runtime status can use an explicit OpenClaw binary path outside PATH", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-explicit-bin-"));
  const openclawPath = path.join(rootDir, "custom-openclaw");

  fs.writeFileSync(openclawPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "openclaw 9.9.9"
  exit 0
fi
if [ "$1" = "models" ] && [ "$2" = "status" ]; then
  echo "{}"
  exit 0
fi
if [ "$1" = "agents" ] && [ "$2" = "list" ]; then
  echo "[]"
  exit 0
fi
if [ "$1" = "plugins" ] && [ "$2" = "list" ]; then
  echo '{"plugins":[]}'
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "call" ]; then
  exit 1
fi
echo "{}"
exit 0
`, { mode: 0o755 });

  const host = new NodeProcessHost();
  const status = await getOpenClawRuntimeStatus(host, {
    binaryPath: openclawPath,
    env: {
      ...process.env,
      PATH: process.env.PATH || "",
    },
  });

  assert.equal(status.cliAvailable, true);
  assert.equal(status.version, "9.9.9");
});
