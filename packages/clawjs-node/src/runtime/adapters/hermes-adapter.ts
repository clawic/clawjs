import fs from "fs";
import path from "path";

import type { ChannelDescriptor, MemoryDescriptor, RuntimeFileDescriptor, ProviderDescriptor, SchedulerDescriptor, SkillDescriptor } from "@clawjs/core";

import { createSimpleRuntimeAdapter } from "./simple-adapter.ts";

const HERMES_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "SOUL", path: "SOUL.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "USER", path: "USER.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "SKILLS", path: "SKILLS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "IDENTITY", path: "IDENTITY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "MEMORY", path: "MEMORY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

const HERMES_PROVIDERS: ProviderDescriptor[] = [
  { id: "openai", label: "openai", envVars: ["OPENAI_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "anthropic", label: "anthropic", envVars: ["ANTHROPIC_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "openrouter", label: "openrouter", envVars: ["OPENROUTER_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
];

function readHermesDirectory(dirPath: string | undefined): fs.Dirent[] {
  if (!dirPath) return [];
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function listHermesMemory(homeDir: string | undefined): MemoryDescriptor[] {
  const memoriesDir = homeDir ? path.join(homeDir, "memories") : undefined;
  const entries = readHermesDirectory(memoriesDir)
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => ({
      id: `hermes-memory-${entry.name.replace(/\.[^.]+$/, "").toLowerCase()}`,
      label: entry.name.replace(/\.[^.]+$/, ""),
      kind: "knowledge" as const,
      path: memoriesDir ? path.join(memoriesDir, entry.name) : undefined,
    }));
  if (entries.length > 0) return entries;
  return [{
    id: "hermes-memory",
    label: "Hermes Memory",
    kind: "index",
    path: memoriesDir,
    summary: "Hermes persists curated memories under ~/.hermes/memories.",
  }];
}

function listHermesSkills(homeDir: string | undefined): SkillDescriptor[] {
  const skillsDir = homeDir ? path.join(homeDir, "skills") : undefined;
  const entries = readHermesDirectory(skillsDir)
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .map((entry) => ({
      id: entry.name.replace(/\.[^.]+$/, ""),
      label: entry.name.replace(/\.[^.]+$/, ""),
      enabled: true,
      scope: "runtime" as const,
      path: skillsDir ? path.join(skillsDir, entry.name) : undefined,
    }));
  if (entries.length > 0) return entries;
  return [{
    id: "hermes-skills",
    label: "Hermes Skills",
    enabled: true,
    scope: "runtime",
    path: skillsDir,
  }];
}

function listHermesSchedulers(homeDir: string | undefined): SchedulerDescriptor[] {
  const cronDir = homeDir ? path.join(homeDir, "cron") : undefined;
  const entries = readHermesDirectory(cronDir)
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      id: entry.name.replace(/\.[^.]+$/, ""),
      label: entry.name.replace(/\.[^.]+$/, ""),
      enabled: true,
      status: "idle" as const,
      kind: "cron" as const,
    }));
  if (entries.length > 0) return entries;
  return [{
    id: "hermes-scheduler",
    label: "Hermes Scheduler",
    enabled: true,
    status: "idle",
    kind: "workflow",
  }];
}

function listHermesChannels(): ChannelDescriptor[] {
  return [
    { id: "telegram", label: "Telegram", kind: "chat", status: "configured" },
    { id: "discord", label: "Discord", kind: "chat", status: "configured" },
    { id: "slack", label: "Slack", kind: "chat", status: "configured" },
    { id: "whatsapp", label: "WhatsApp", kind: "chat", status: "configured" },
    { id: "signal", label: "Signal", kind: "chat", status: "configured" },
    { id: "email", label: "Email", kind: "email", status: "configured" },
    { id: "webhook", label: "Webhook", kind: "webhook", status: "configured" },
  ];
}

export const hermesAdapter = createSimpleRuntimeAdapter({
  id: "hermes",
  runtimeName: "Hermes Agent",
  binary: "hermes",
  workspaceFiles: HERMES_WORKSPACE_FILES,
  homeDirName: ".hermes",
  authFileName: "auth.json",
  providerCatalog: HERMES_PROVIDERS,
  defaultModelKeys: ["defaultModel", "model"],
  modelListCommand: ["models", "list", "--json"],
  setDefaultModelArgs: (model) => ["model", model],
  loginArgs: (provider) => ["auth", "login", "--provider", provider],
  setupCommand: () => ({ command: "hermes", args: ["setup"] }),
  probeCommands: {
    scheduler: ["cron", "list"],
    channels: ["gateway", "status"],
    skills: ["skills", "list"],
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
    runtime: { supported: true, status: "ready", strategy: "cli" },
    auth: { supported: true, status: "degraded", strategy: "config", limitations: ["Hermes auth state may come from ~/.hermes/auth.json and environment-backed secrets."] },
    models: { supported: true, status: "ready", strategy: "cli" },
    scheduler: { supported: true, status: "ready", strategy: "native", limitations: ["Scheduler inventory is read from ~/.hermes/cron when available and falls back to runtime probing."] },
    memory: { supported: true, status: "ready", strategy: "bridge", limitations: ["Memory inventory is mapped from ~/.hermes/memories and session storage."] },
    channels: { supported: true, status: "degraded", strategy: "native", limitations: ["Channel inventory is normalized to the ClawJS descriptor model and may omit platform-specific metadata."] },
    skills: { supported: true, status: "ready", strategy: "native", limitations: ["Skill inventory is read from ~/.hermes/skills and does not expose all Hermes skill metadata yet."] },
    sandbox: { supported: true, status: "degraded", strategy: "hosted", limitations: ["Isolation depends on the selected Hermes terminal backend such as Docker, SSH, Modal, or local."] },
    conversation_gateway: { supported: true, status: "ready", strategy: "gateway" },
  },
  capabilityOverrides: {
    scheduler: { supported: true, status: "ready", strategy: "native" },
    memory: { supported: true, status: "ready", strategy: "bridge" },
    channels: { supported: true, status: "degraded", strategy: "native", limitations: ["Channel inventory is normalized from Hermes gateway capabilities."] },
    skills: { supported: true, status: "ready", strategy: "native" },
    conversation_gateway: { supported: true, status: "ready", strategy: "gateway" },
    sandbox: { supported: true, status: "degraded", strategy: "hosted", limitations: ["Sandboxing depends on the configured terminal backend."] },
  },
  resourceLoaders: {
    async listSchedulers(_runner, _options, locations) {
      return listHermesSchedulers(locations.homeDir);
    },
    async listMemory(_runner, _options, locations) {
      return listHermesMemory(locations.homeDir);
    },
    async listSkills(_runner, _options, locations) {
      return listHermesSkills(locations.homeDir);
    },
    async listChannels() {
      return listHermesChannels();
    },
  },
  defaultSchedulers: [{
    id: "hermes-scheduler",
    label: "Hermes Scheduler",
    enabled: true,
    status: "idle",
    kind: "workflow",
  }],
  defaultMemory: (locations) => [{
    id: "hermes-memory",
    label: "Hermes Memory",
    kind: "index",
    path: locations.workspacePath ? path.join(locations.workspacePath, "MEMORY.md") : undefined,
  }],
  defaultSkills: (locations) => [{
    id: "hermes-skills",
    label: "Hermes Skills",
    enabled: true,
    scope: "runtime",
    path: locations.workspacePath ? path.join(locations.workspacePath, "skills") : undefined,
  }],
  defaultChannels: [
    { id: "telegram", label: "Telegram", kind: "chat", status: "configured" },
    { id: "discord", label: "Discord", kind: "chat", status: "configured" },
    { id: "slack", label: "Slack", kind: "chat", status: "configured" },
    { id: "whatsapp", label: "WhatsApp", kind: "chat", status: "configured" },
    { id: "signal", label: "Signal", kind: "chat", status: "configured" },
    { id: "email", label: "Email", kind: "email", status: "configured" },
    { id: "webhook", label: "Webhook", kind: "webhook", status: "configured" },
  ],
  conversationCli: (input) => ({
    command: "hermes",
    args: ["-p", input.prompt],
    timeoutMs: 130_000,
    parser: "stdout-text",
  }),
});
