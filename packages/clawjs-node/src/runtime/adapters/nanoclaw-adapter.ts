import path from "path";

import type { RuntimeFileDescriptor, ProviderDescriptor } from "@clawjs/core";

import { createSimpleRuntimeAdapter } from "./simple-adapter.ts";

const NANOCLAW_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "SOUL", path: "SOUL.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "USER", path: "USER.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "GROUP", path: "GROUP.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "IDENTITY", path: "IDENTITY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "MEMORY", path: "MEMORY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

const NANOCLAW_PROVIDERS: ProviderDescriptor[] = [
  { id: "anthropic", label: "anthropic", envVars: ["ANTHROPIC_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "openai", label: "openai", envVars: ["OPENAI_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "openrouter", label: "openrouter", envVars: ["OPENROUTER_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
];

export const nanoclawAdapter = createSimpleRuntimeAdapter({
  id: "nanoclaw",
  runtimeName: "NanoClaw",
  binary: "nanoclaw",
  workspaceFiles: NANOCLAW_WORKSPACE_FILES,
  homeDirName: ".nanoclaw",
  configFileName: "config.json",
  authFileName: "auth.json",
  providerCatalog: NANOCLAW_PROVIDERS,
  defaultModelKeys: ["defaultModel", "model"],
  modelListCommand: ["models", "list", "--json"],
  setDefaultModelArgs: (model) => ["models", "set-default", model],
  loginArgs: (provider) => ["auth", "login", "--provider", provider],
  probeCommands: {
    scheduler: ["jobs", "list"],
    sandbox: ["container", "status"],
    channels: ["channels", "list"],
  },
  capabilityOverrides: {
    sandbox: { supported: true, status: "ready", strategy: "native" },
    channels: { supported: true, status: "ready", strategy: "native" },
    scheduler: { supported: true, status: "ready", strategy: "native" },
  },
  defaultSchedulers: [{
    id: "nanoclaw-jobs",
    label: "NanoClaw Scheduled Jobs",
    enabled: true,
    status: "idle",
    kind: "job",
  }],
  defaultMemory: (locations) => [{
    id: "nanoclaw-memory",
    label: "NanoClaw Memory",
    kind: "store",
    path: locations.workspacePath ? path.join(locations.workspacePath, "MEMORY.md") : undefined,
  }],
  defaultChannels: [
    { id: "whatsapp", label: "WhatsApp", kind: "chat", status: "configured" },
    { id: "telegram", label: "Telegram", kind: "chat", status: "configured" },
    { id: "slack", label: "Slack", kind: "chat", status: "configured" },
    { id: "discord", label: "Discord", kind: "chat", status: "configured" },
    { id: "gmail", label: "Gmail", kind: "email", status: "configured" },
  ],
  conversationCli: (input) => ({
    command: "nanoclaw",
    args: ["agent", "-m", input.prompt],
    timeoutMs: 130_000,
    parser: "stdout-text",
  }),
});
