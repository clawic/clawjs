import path from "path";

import type { RuntimeFileDescriptor, ProviderDescriptor } from "@clawjs/core";

import { createSimpleRuntimeAdapter } from "./simple-adapter.ts";

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
