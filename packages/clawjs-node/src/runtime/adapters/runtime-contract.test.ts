import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import type { CommandRunner } from "../contracts.ts";
import { getRuntimeConversationDescriptor, getRuntimeResourceCatalogs, getRuntimeStatusReport } from "../engines.ts";
import { hermesAdapter } from "./hermes-adapter.ts";
import { nanobotAdapter } from "./nanobot-adapter.ts";
import { openclawAdapter } from "./openclaw-adapter.ts";

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

test("openclaw adapter preserves its transport and capability-map contract", async () => {
  const runner = new FakeRunner({
    "which openclaw": { stdout: "/usr/local/bin/openclaw\n" },
    "openclaw --version": { stdout: "openclaw 1.2.3\n" },
    "openclaw models status --json": { stdout: "{}" },
    "openclaw agents list --json": { stdout: "[]" },
    "openclaw gateway call --json --timeout 1000 --params {\"probe\":true} channels.status": { stdout: "{\"channels\":{}}" },
    "openclaw plugins list --json": { stdout: "{\"plugins\":[]}" },
  });

  const status = await openclawAdapter.getStatus(runner, {
    adapter: "openclaw",
    gateway: { url: "http://127.0.0.1:4100" },
  });
  assert.equal(status.capabilityMap.channels.strategy, "gateway");
  assert.equal(status.capabilityMap.channels.status, "ready");
  assert.deepEqual(status.capabilityMap.memory.limitations, ["OpenClaw memory is workspace-file based in ClawJS."]);
  assert.deepEqual(status.capabilityMap.scheduler.limitations, ["Heartbeat-based scheduling only."]);

  const conversation = getRuntimeConversationDescriptor(openclawAdapter, {
    adapter: "openclaw",
    gateway: { url: "http://127.0.0.1:4100" },
  });
  assert.equal(conversation.transport.kind, "hybrid");
  assert.equal(conversation.transport.gatewayKind, "openai-responses");
  assert.equal(conversation.primaryTransport, "gateway");
  assert.equal(conversation.fallbackTransport, "cli");
});

test("hermes adapter exposes structured capabilities, resources, and transport metadata", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-"));
  fs.mkdirSync(path.join(homeDir, ".hermes", "memories"), { recursive: true });
  fs.mkdirSync(path.join(homeDir, ".hermes", "skills", "checks"), { recursive: true });
  fs.mkdirSync(path.join(homeDir, ".hermes", "cron"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".hermes", "memories", "MEMORY.md"), "remember this\n");
  fs.writeFileSync(path.join(homeDir, ".hermes", "cron", "daily.yaml"), "schedule: daily\n");

  const runner = new FakeRunner({
    "which hermes": { stdout: "/usr/local/bin/hermes\n" },
    "hermes --version": { stdout: "hermes 0.9.0\n" },
    "hermes models list --json": { stdout: "[\"openai/gpt-5-mini\"]" },
    "hermes auth login --provider test-provider": { fail: true, stderr: "interactive" },
    "hermes cron list": { stdout: "[]" },
    "hermes gateway status": { stdout: "{}" },
    "hermes skills list": { stdout: "[]" },
  });

  const options = {
    adapter: "hermes" as const,
    homeDir,
    gateway: { url: "http://127.0.0.1:4100" },
  };
  const status = await getRuntimeStatusReport(hermesAdapter, runner, options);
  assert.equal(status.capabilityMap.scheduler.supported, true);
  assert.equal(status.capabilityMap.sandbox.supported, true);
  assert.equal(status.capabilityMap.sandbox.status, "degraded");

  const resources = await getRuntimeResourceCatalogs(hermesAdapter, runner, options);
  assert.equal(resources.memory.memory.some((entry) => entry.path?.endsWith("MEMORY.md")), true);
  assert.equal(resources.skills.skills.some((entry) => entry.id === "checks"), true);
  assert.equal(resources.schedulers.schedulers.some((entry) => entry.id === "daily"), true);

  const conversation = getRuntimeConversationDescriptor(hermesAdapter, options);
  assert.equal(conversation.transport.kind, "hybrid");
  assert.equal(conversation.primaryTransport, "gateway");
  assert.equal(conversation.fallbackTransport, "cli");
  assert.equal(conversation.sessionPersistence, "runtime");
  assert.equal(conversation.sessionPath?.endsWith(path.join(".hermes", "sessions")), true);
});

test("nanobot adapter exposes normalized channels, memory, and sandbox limitations", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-nanobot-"));
  const runtimeHome = path.join(homeDir, ".nanobot");
  const workspacePath = path.join(runtimeHome, "workspace");
  fs.mkdirSync(path.join(workspacePath, "skills"), { recursive: true });
  fs.writeFileSync(path.join(runtimeHome, "config.json"), JSON.stringify({
    channels: {
      telegram: { enabled: true },
      slack: { enabled: false },
      whatsapp: { enabled: true },
    },
  }, null, 2));
  fs.writeFileSync(path.join(workspacePath, "MEMORY.md"), "durable memory\n");
  fs.writeFileSync(path.join(workspacePath, "skills", "review.md"), "skill\n");

  const runner = new FakeRunner({
    "which nanobot": { stdout: "/usr/local/bin/nanobot\n" },
    "nanobot --version": { stdout: "nanobot 0.1.5\n" },
    "nanobot models list --json": { stdout: "[\"openai/gpt-4.1\"]" },
    "nanobot auth login --provider test-provider": { fail: true, stderr: "interactive" },
    "nanobot jobs list": { stdout: "[]" },
    "nanobot channels list": { stdout: "[]" },
  });

  const options = {
    adapter: "nanobot" as const,
    homeDir,
    gateway: { url: "http://127.0.0.1:4200" },
  };
  const status = await getRuntimeStatusReport(nanobotAdapter, runner, options);
  assert.equal(status.capabilityMap.channels.supported, true);
  assert.equal(status.capabilityMap.sandbox.supported, true);
  assert.equal(status.capabilityMap.sandbox.status, "degraded");

  const resources = await getRuntimeResourceCatalogs(nanobotAdapter, runner, options);
  assert.deepEqual(resources.channels.channels.map((entry) => entry.id), ["telegram", "whatsapp"]);
  assert.equal(resources.memory.memory.some((entry) => entry.path?.endsWith("MEMORY.md")), true);
  assert.equal(resources.skills.skills.some((entry) => entry.id === "review"), true);

  const conversation = getRuntimeConversationDescriptor(nanobotAdapter, options);
  assert.equal(conversation.transport.kind, "hybrid");
  assert.equal(conversation.primaryTransport, "gateway");
  assert.equal(conversation.fallbackTransport, "cli");
});
