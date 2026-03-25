import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  disableManagedOpenClawPlugins,
  doctorOpenClawPlugins,
  ensureOpenClawPluginBridge,
  getOpenClawPluginBridgeStatus,
  listOpenClawHooks,
  listOpenClawPlugins,
  resolveOpenClawPluginBridgePolicy,
  type OpenClawPluginRecord,
} from "./plugins.ts";
import { writeOpenClawRuntimeConfig } from "./openclaw-context.ts";
import type { CommandRunner, RuntimeAdapterOptions } from "./contracts.ts";

class FakePluginRunner implements CommandRunner {
  readonly calls: string[] = [];
  readonly plugins = new Map<string, OpenClawPluginRecord>();
  restartCount = 0;

  async exec(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const key = `${command} ${args.join(" ")}`.trim();
    this.calls.push(key);

    if (command !== "openclaw") {
      throw new Error(`unsupported command: ${key}`);
    }

    if (args[0] === "plugins" && args[1] === "list" && args[2] === "--json") {
      return {
        stdout: JSON.stringify({
          workspaceDir: "/tmp/demo",
          plugins: [...this.plugins.values()],
          diagnostics: [],
        }),
        stderr: "",
        exitCode: 0,
      };
    }

    if (args[0] === "plugins" && args[1] === "info" && args[3] === "--json") {
      const plugin = this.plugins.get(args[2] || "");
      if (!plugin) {
        throw new Error(`plugin not found: ${args[2]}`);
      }
      return { stdout: JSON.stringify(plugin), stderr: "", exitCode: 0 };
    }

    if (args[0] === "plugins" && args[1] === "doctor") {
      return {
        stdout: "Plugin doctor: ok\n",
        stderr: "",
        exitCode: 0,
      };
    }

    if (args[0] === "hooks" && args[1] === "list" && args[2] === "--json") {
      return {
        stdout: JSON.stringify({
          workspaceDir: "/tmp/demo",
          managedHooksDir: "/tmp/demo/.openclaw/hooks",
          hooks: [
            {
              name: "session_start",
              managedByPlugin: true,
              source: "clawjs",
              events: ["session_start"],
            },
          ],
        }),
        stderr: "",
        exitCode: 0,
      };
    }

    if (args[0] === "plugins" && args[1] === "install") {
      const spec = args[2] || "";
      const id = spec.includes("context") ? "clawjs-context" : "clawjs";
      const gatewayMethods = id === "clawjs" ? ["clawjs.status"] : [];
      this.plugins.set(id, {
        id,
        name: id,
        version: "0.1.0",
        source: "npm",
        origin: spec,
        enabled: false,
        status: "installed",
        gatewayMethods,
      });
      return { stdout: "", stderr: "", exitCode: 0 };
    }

    if (args[0] === "plugins" && args[1] === "enable") {
      const id = args[2] || "";
      const plugin = this.plugins.get(id);
      if (!plugin) {
        throw new Error(`plugin not found: ${id}`);
      }
      this.plugins.set(id, {
        ...plugin,
        enabled: true,
        status: "loaded",
      });
      return { stdout: "", stderr: "", exitCode: 0 };
    }

    if (args[0] === "plugins" && args[1] === "disable") {
      const id = args[2] || "";
      const plugin = this.plugins.get(id);
      if (!plugin) {
        throw new Error(`plugin not found: ${id}`);
      }
      this.plugins.set(id, {
        ...plugin,
        enabled: false,
        status: "installed",
      });
      return { stdout: "", stderr: "", exitCode: 0 };
    }

    if (args[0] === "plugins" && args[1] === "update") {
      const id = args[2] || "";
      const plugin = this.plugins.get(id);
      if (!plugin) {
        throw new Error(`plugin not found: ${id}`);
      }
      this.plugins.set(id, {
        ...plugin,
        version: "0.1.0",
      });
      return { stdout: "", stderr: "", exitCode: 0 };
    }

    if (args[0] === "gateway" && args[1] === "restart") {
      this.restartCount += 1;
      return { stdout: "ok\n", stderr: "", exitCode: 0 };
    }

    throw new Error(`unsupported command: ${key}`);
  }
}

function createRuntimeOptions(): RuntimeAdapterOptions & { configPath: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-runtime-plugins-"));
  const configPath = path.join(tempDir, "openclaw.json");
  writeOpenClawRuntimeConfig({
    gateway: {
      port: 18789,
      auth: {
        token: "plugin-test-token",
      },
    },
    plugins: {
      slots: {
        contextEngine: "legacy",
      },
    },
  }, { configPath });

  return {
    adapter: "openclaw",
    configPath,
    env: {},
  };
}

test("resolveOpenClawPluginBridgePolicy defaults to managed for openclaw", () => {
  assert.deepEqual(resolveOpenClawPluginBridgePolicy("openclaw"), {
    mode: "managed",
    packageSpec: "@clawjs/openclaw-plugin",
    contextEnginePackageSpec: "@clawjs/openclaw-context-engine",
    installSource: "npm",
    enableContextEngine: false,
  });

  assert.equal(resolveOpenClawPluginBridgePolicy("zeroclaw").mode, "off");
});

test("plugin helpers list plugins, hooks, and doctor output", async () => {
  const runner = new FakePluginRunner();
  const options = createRuntimeOptions();

  runner.plugins.set("clawjs", {
    id: "clawjs",
    name: "clawjs",
    version: "0.1.0",
    source: "npm",
    origin: "@clawjs/openclaw-plugin",
    enabled: true,
    status: "loaded",
    gatewayMethods: ["clawjs.status"],
  });

  const plugins = await listOpenClawPlugins(runner, options);
  const hooks = await listOpenClawHooks(runner, options);
  const doctor = await doctorOpenClawPlugins(runner, options);

  assert.equal(plugins.plugins.length, 1);
  assert.equal(plugins.plugins[0]?.id, "clawjs");
  assert.equal(hooks.hooks[0]?.name, "session_start");
  assert.equal(doctor.ok, true);
  assert.equal(doctor.issues.length, 0);
});

test("ensureOpenClawPluginBridge installs, enables, selects context engine, and restarts", async () => {
  const runner = new FakePluginRunner();
  const options = createRuntimeOptions();
  const policy = resolveOpenClawPluginBridgePolicy("openclaw", {
    enableContextEngine: true,
  });

  const result = await ensureOpenClawPluginBridge(runner, options, policy);
  const status = await getOpenClawPluginBridgeStatus(runner, options, policy);
  const config = JSON.parse(fs.readFileSync(options.configPath, "utf8")) as { plugins?: { slots?: { contextEngine?: string } } };

  assert.equal(result.changed, true);
  assert.equal(result.restartedGateway, true);
  assert.deepEqual(result.actions, [
    "install:@clawjs/openclaw-plugin",
    "enable:clawjs",
    "install:@clawjs/openclaw-context-engine",
    "enable:clawjs-context",
    "select-context:clawjs-context",
  ]);
  assert.equal(status.basePlugin.loaded, true);
  assert.equal(status.contextPlugin.loaded, true);
  assert.equal(status.contextPlugin.selected, true);
  assert.equal(config.plugins?.slots?.contextEngine, "clawjs-context");
  assert.equal(runner.restartCount, 1);
});

test("disableManagedOpenClawPlugins falls back the selected context engine to legacy", async () => {
  const runner = new FakePluginRunner();
  const options = createRuntimeOptions();
  const policy = resolveOpenClawPluginBridgePolicy("openclaw", {
    enableContextEngine: true,
  });

  await ensureOpenClawPluginBridge(runner, options, policy);
  const result = await disableManagedOpenClawPlugins("context", runner, options, policy);
  const config = JSON.parse(fs.readFileSync(options.configPath, "utf8")) as { plugins?: { slots?: { contextEngine?: string } } };

  assert.equal(result.changed, true);
  assert.equal(result.actions.includes("disable:clawjs-context"), true);
  assert.equal(result.actions.includes("select-context:legacy"), true);
  assert.equal(config.plugins?.slots?.contextEngine, "legacy");
});
