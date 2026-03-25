import path from "path";

import type { RuntimeFileDescriptor, ProviderDescriptor } from "@clawjs/core";

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

export const hermesAdapter = createSimpleRuntimeAdapter({
  id: "hermes",
  runtimeName: "Hermes Agent",
  binary: "hermes",
  workspaceFiles: HERMES_WORKSPACE_FILES,
  homeDirName: ".hermes-agent",
  configFileName: "config.json",
  authFileName: "auth.json",
  providerCatalog: HERMES_PROVIDERS,
  defaultModelKeys: ["defaultModel", "model"],
  modelListCommand: ["models", "list", "--json"],
  setDefaultModelArgs: (model) => ["models", "set-default", model],
  loginArgs: (provider) => ["auth", "login", "--provider", provider],
  probeCommands: {
    scheduler: ["scheduler", "list"],
    channels: ["channels", "list"],
    skills: ["skills", "list"],
  },
  gatewaySupport: true,
  capabilityOverrides: {
    scheduler: { supported: true, status: "ready", strategy: "native" },
    memory: { supported: true, status: "ready", strategy: "bridge" },
    channels: { supported: true, status: "ready", strategy: "native" },
    skills: { supported: true, status: "ready", strategy: "native" },
    conversation_gateway: { supported: true, status: "ready", strategy: "gateway" },
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
    { id: "webhook", label: "Webhook", kind: "webhook", status: "configured" },
    { id: "chat", label: "Chat", kind: "chat", status: "configured" },
  ],
  conversationCli: (input) => ({
    command: "hermes",
    args: ["agent", "-m", input.prompt],
    timeoutMs: 130_000,
    parser: "stdout-text",
  }),
});
