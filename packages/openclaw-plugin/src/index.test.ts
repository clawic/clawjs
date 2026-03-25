// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

import plugin, { HOOKS, resetClawJsPluginStateForTests } from "./index.js";

function createApi() {
  const gatewayMethods = new Map();
  const commands = [];
  const tools = [];
  const hooks = new Map();
  const services = [];
  const config = {
    plugins: {
      entries: {
        clawjs: {
          hooks: {
            allowPromptInjection: true,
          },
        },
      },
      slots: {
        contextEngine: "legacy",
      },
    },
  };

  return {
    api: {
      id: "clawjs",
      name: "ClawJS",
      source: "/tmp/clawjs/index.js",
      config,
      pluginConfig: {
        observability: {
          enabled: true,
          bufferSize: 50,
          maxSessionMessages: 5,
        },
      },
      runtime: {
        version: "2026.3.13",
        config: {
          loadConfig() {
            return config;
          },
        },
        subagent: {
          async run(params) {
            return { runId: `run:${params.sessionKey}` };
          },
          async waitForRun() {
            return { status: "ok" };
          },
          async getSessionMessages(params) {
            return { messages: [{ role: "assistant", content: `session:${params.sessionKey}` }] };
          },
        },
      },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      registerGatewayMethod(name, handler) {
        gatewayMethods.set(name, handler);
      },
      registerCommand(command) {
        commands.push(command);
      },
      registerTool(tool) {
        tools.push(tool);
      },
      registerService(service) {
        services.push(service);
      },
      on(name, handler) {
        hooks.set(name, handler);
      },
    },
    gatewayMethods,
    commands,
    tools,
    hooks,
    services,
    config,
  };
}

test("openclaw plugin package exposes native manifest and extension entry", () => {
  const root = path.dirname(new URL(import.meta.url).pathname);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "..", "openclaw.plugin.json"), "utf8"));
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "..", "package.json"), "utf8"));

  assert.equal(manifest.id, "clawjs");
  assert.deepEqual(packageJson.openclaw.extensions, ["./src/index.js"]);
});

test("register wires gateway methods, hooks, tools, commands, and services", () => {
  resetClawJsPluginStateForTests();
  const { api, gatewayMethods, commands, tools, hooks, services } = createApi();

  plugin.register(api);

  assert.equal(gatewayMethods.has("clawjs.status"), true);
  assert.equal(gatewayMethods.has("clawjs.events.list"), true);
  assert.equal(gatewayMethods.has("clawjs.subagent.run"), true);
  assert.equal(commands.some((command) => command.name === "clawjs-status"), true);
  assert.equal(tools.some((tool) => tool.name === "clawjs_status"), true);
  assert.equal(services.some((service) => service.id === "clawjs-observability"), true);
  assert.deepEqual([...hooks.keys()].sort(), [...HOOKS].sort());
});

test("status and event RPC methods expose captured observability state", async () => {
  resetClawJsPluginStateForTests();
  const { api, gatewayMethods, hooks } = createApi();
  plugin.register(api);

  const sessionStart = hooks.get("session_start");
  const llmInput = hooks.get("llm_input");
  assert.ok(sessionStart);
  assert.ok(llmInput);

  sessionStart({ sessionId: "s-1", sessionKey: "alpha" }, { sessionId: "s-1", sessionKey: "alpha", agentId: "main" });
  llmInput({ runId: "r-1", sessionId: "s-1", provider: "openai", model: "gpt-5", prompt: "hi", historyMessages: [], imagesCount: 0 }, { sessionId: "s-1", sessionKey: "alpha", agentId: "main" });

  const statusHandler = gatewayMethods.get("clawjs.status");
  const eventsHandler = gatewayMethods.get("clawjs.events.list");
  const inspectHandler = gatewayMethods.get("clawjs.sessions.inspect");

  let statusPayload = null;
  let eventsPayload = null;
  let inspectPayload = null;

  statusHandler({ params: {}, respond(ok, payload) { statusPayload = { ok, payload }; } });
  eventsHandler({ params: { limit: 10 }, respond(ok, payload) { eventsPayload = { ok, payload }; } });
  inspectHandler({ params: { sessionKey: "alpha" }, respond(ok, payload) { inspectPayload = { ok, payload }; } });

  assert.equal(statusPayload?.ok, true);
  assert.equal(statusPayload?.payload.health.sessionCount, 1);
  assert.equal(eventsPayload?.ok, true);
  assert.equal(eventsPayload?.payload.items.length >= 2, true);
  assert.equal(inspectPayload?.payload.found, true);
  assert.equal(inspectPayload?.payload.session.lastModel, "gpt-5");
});

test("subagent gateway methods delegate to runtime wrappers", async () => {
  resetClawJsPluginStateForTests();
  const { api, gatewayMethods } = createApi();
  plugin.register(api);

  const runHandler = gatewayMethods.get("clawjs.subagent.run");
  const waitHandler = gatewayMethods.get("clawjs.subagent.wait");
  const messagesHandler = gatewayMethods.get("clawjs.subagent.messages");

  let runPayload = null;
  let waitPayload = null;
  let messagesPayload = null;

  await runHandler({ params: { sessionKey: "alpha", message: "hello" }, respond(ok, payload) { runPayload = { ok, payload }; } });
  await waitHandler({ params: { runId: "run:alpha" }, respond(ok, payload) { waitPayload = { ok, payload }; } });
  await messagesHandler({ params: { sessionKey: "alpha" }, respond(ok, payload) { messagesPayload = { ok, payload }; } });

  assert.equal(runPayload?.payload.runId, "run:alpha");
  assert.equal(waitPayload?.payload.status, "ok");
  assert.deepEqual(messagesPayload?.payload.messages, [{ role: "assistant", content: "session:alpha" }]);
});
