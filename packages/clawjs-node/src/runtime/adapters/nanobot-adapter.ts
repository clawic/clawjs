import fs from "fs";
import path from "path";

import type { ChannelDescriptor, MemoryDescriptor, RuntimeFileDescriptor, ProviderDescriptor, SchedulerDescriptor, SkillDescriptor } from "@clawjs/core";

import { createSimpleRuntimeAdapter } from "./simple-adapter.ts";
import { readJsonFile } from "./config-utils.ts";

const NANOBOT_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "SOUL", path: "SOUL.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "USER", path: "USER.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "AGENTS", path: "AGENTS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "IDENTITY", path: "IDENTITY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "MEMORY", path: "MEMORY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

const NANOBOT_PROVIDERS: ProviderDescriptor[] = [
  { id: "openrouter", label: "openrouter", envVars: ["OPENROUTER_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "anthropic", label: "anthropic", envVars: ["ANTHROPIC_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "openai", label: "openai", envVars: ["OPENAI_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "deepseek", label: "deepseek", envVars: ["DEEPSEEK_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "groq", label: "groq", envVars: ["GROQ_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "gemini", label: "gemini", envVars: ["GEMINI_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "vllm", label: "vllm", local: true, auth: { supportsEnv: false } },
];

function readNanobotConfig(configPath: string | undefined): Record<string, unknown> {
  return readJsonFile<Record<string, unknown>>(configPath ?? "") ?? {};
}

function listNanobotChannels(configPath: string | undefined): ChannelDescriptor[] {
  const config = readNanobotConfig(configPath);
  const configuredChannels = typeof config.channels === "object" && config.channels
    ? Object.entries(config.channels as Record<string, { enabled?: boolean }>).filter(([, value]) => value?.enabled !== false)
    : [];
  if (configuredChannels.length > 0) {
    return configuredChannels.map(([id]) => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      kind: id === "email" ? "email" : "chat",
      status: "configured",
    }));
  }
  return [
    { id: "telegram", label: "Telegram", kind: "chat", status: "configured" },
    { id: "discord", label: "Discord", kind: "chat", status: "configured" },
    { id: "whatsapp", label: "WhatsApp", kind: "chat", status: "configured" },
    { id: "slack", label: "Slack", kind: "chat", status: "configured" },
    { id: "email", label: "Email", kind: "email", status: "configured" },
  ];
}

function listNanobotMemory(workspacePath: string | undefined): MemoryDescriptor[] {
  if (!workspacePath) {
    return [{ id: "nanobot-memory", label: "Nanobot Memory", kind: "store" }];
  }
  const files = ["MEMORY.md", "USER.md"]
    .map((fileName) => path.join(workspacePath, fileName))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => ({
      id: `nanobot-${path.basename(filePath, path.extname(filePath)).toLowerCase()}`,
      label: path.basename(filePath),
      kind: "knowledge" as const,
      path: filePath,
    }));
  if (files.length > 0) return files;
  return [{
    id: "nanobot-memory",
    label: "Nanobot Memory",
    kind: "store",
    path: path.join(workspacePath, "MEMORY.md"),
    summary: "Nanobot persists durable memory in workspace markdown files.",
  }];
}

function listNanobotSkills(workspacePath: string | undefined): SkillDescriptor[] {
  const skillsDir = workspacePath ? path.join(workspacePath, "skills") : undefined;
  if (!skillsDir) return [];
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map((entry) => ({
        id: entry.name.replace(/\.[^.]+$/, ""),
        label: entry.name.replace(/\.[^.]+$/, ""),
        enabled: true,
        scope: "workspace" as const,
        path: path.join(skillsDir, entry.name),
      }));
    if (entries.length > 0) return entries;
  } catch {}
  return [{
    id: "nanobot-skills",
    label: "Nanobot Skills",
    enabled: true,
    scope: "workspace",
    path: skillsDir,
  }];
}

function listNanobotSchedulers(): SchedulerDescriptor[] {
  return [{
    id: "nanobot-jobs",
    label: "Nanobot Jobs",
    enabled: true,
    status: "idle",
    kind: "job",
  }];
}

export const nanobotAdapter = createSimpleRuntimeAdapter({
  id: "nanobot",
  runtimeName: "Nanobot",
  binary: "nanobot",
  workspaceFiles: NANOBOT_WORKSPACE_FILES,
  homeDirName: ".nanobot",
  configFileName: "config.json",
  authFileName: "auth.json",
  providerCatalog: NANOBOT_PROVIDERS,
  defaultModelKeys: ["defaultModel", "model"],
  modelListCommand: ["models", "list", "--json"],
  setDefaultModelArgs: (model) => ["models", "set-default", model],
  loginArgs: (provider) => ["auth", "login", "--provider", provider],
  probeCommands: {
    scheduler: ["jobs", "list"],
    channels: ["channels", "list"],
  },
  gatewaySupport: true,
  gatewayKind: "openai-chat-completions",
  conversationDetails: (_options, locations) => ({
    primaryTransport: "gateway",
    fallbackTransport: "cli",
    sessionPersistence: "runtime",
    streamingMode: "hybrid",
    sessionPath: locations.homeDir ? path.join(locations.homeDir, "sessions") : undefined,
  }),
  capabilityDeclarations: {
    auth: { supported: true, status: "ready", strategy: "config" },
    models: { supported: true, status: "ready", strategy: "cli" },
    scheduler: { supported: true, status: "ready", strategy: "native", limitations: ["Scheduler inventory is normalized from Nanobot jobs and may not expose every runtime field."] },
    memory: { supported: true, status: "ready", strategy: "bridge", limitations: ["Memory is mapped from workspace files and does not expose Nanobot's full Dream memory internals."] },
    skills: { supported: true, status: "degraded", strategy: "derived", limitations: ["Skills inventory is derived from workspace state and does not yet mirror all Nanobot MCP/plugin metadata."] },
    channels: { supported: true, status: "ready", strategy: "native", limitations: ["Channel metadata is normalized from config/runtime state into the ClawJS descriptor model."] },
    sandbox: { supported: true, status: "degraded", strategy: "hosted", limitations: ["Bubblewrap sandboxing is only available on Linux with bwrap installed."] },
    conversation_gateway: { supported: true, status: "ready", strategy: "gateway" },
  },
  capabilityOverrides: {
    scheduler: { supported: true, status: "ready", strategy: "native" },
    memory: { supported: true, status: "ready", strategy: "bridge" },
    skills: { supported: true, status: "degraded", strategy: "derived", limitations: ["Skills inventory is derived from workspace structure and Nanobot runtime metadata."] },
    channels: { supported: true, status: "ready", strategy: "native" },
    sandbox: { supported: true, status: "degraded", strategy: "hosted", limitations: ["Sandboxing depends on Linux bubblewrap support."] },
    conversation_gateway: { supported: true, status: "ready", strategy: "gateway" },
  },
  resourceLoaders: {
    async listSchedulers() {
      return listNanobotSchedulers();
    },
    async listMemory(_runner, _options, locations) {
      return listNanobotMemory(locations.workspacePath);
    },
    async listSkills(_runner, _options, locations) {
      return listNanobotSkills(locations.workspacePath);
    },
    async listChannels(_runner, _options, locations) {
      return listNanobotChannels(locations.configPath);
    },
  },
  defaultSchedulers: [{
    id: "nanobot-jobs",
    label: "Nanobot Jobs",
    enabled: true,
    status: "idle",
    kind: "job",
  }],
  defaultChannels: [
    { id: "telegram", label: "Telegram", kind: "chat", status: "configured" },
    { id: "discord", label: "Discord", kind: "chat", status: "configured" },
    { id: "whatsapp", label: "WhatsApp", kind: "chat", status: "configured" },
    { id: "slack", label: "Slack", kind: "chat", status: "configured" },
    { id: "email", label: "Email", kind: "email", status: "configured" },
  ],
  defaultMemory: (locations) => [{
    id: "nanobot-memory",
    label: "Nanobot Memory",
    kind: "store",
    path: locations.workspacePath ? path.join(locations.workspacePath, "MEMORY.md") : undefined,
  }],
  conversationCli: (input) => ({
    command: "nanobot",
    args: ["chat", "--message", input.prompt],
    timeoutMs: 130_000,
    parser: "stdout-text",
  }),
});
