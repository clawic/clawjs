import path from "path";

import type { RuntimeFileDescriptor, ProviderDescriptor } from "@clawjs/core";

import { createSimpleRuntimeAdapter } from "./simple-adapter.ts";

const IRONCLAW_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "SOUL", path: "SOUL.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "USER", path: "USER.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "AGENTS", path: "AGENTS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "TOOLS", path: "TOOLS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "IDENTITY", path: "IDENTITY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "MEMORY", path: "MEMORY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "HEARTBEAT", path: "HEARTBEAT.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

const IRONCLAW_PROVIDERS: ProviderDescriptor[] = [
  { id: "openai", label: "openai", envVars: ["OPENAI_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "anthropic", label: "anthropic", envVars: ["ANTHROPIC_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "openrouter", label: "openrouter", envVars: ["OPENROUTER_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
];

export const ironclawAdapter = createSimpleRuntimeAdapter({
  id: "ironclaw",
  runtimeName: "IronClaw",
  binary: "ironclaw",
  workspaceFiles: IRONCLAW_WORKSPACE_FILES,
  homeDirName: ".ironclaw",
  configFileName: "config.json",
  authFileName: "auth.json",
  providerCatalog: IRONCLAW_PROVIDERS,
  defaultModelKeys: ["defaultModel", "model"],
  modelListCommand: ["models", "list", "--json"],
  setDefaultModelArgs: (model) => ["models", "set-default", model],
  loginArgs: (provider) => ["auth", "login", "--provider", provider],
  probeCommands: {
    scheduler: ["routines", "list"],
    sandbox: ["wasm", "status"],
    plugins: ["plugins", "list"],
  },
  gatewaySupport: true,
  capabilityOverrides: {
    sandbox: { supported: true, status: "ready", strategy: "native" },
    plugins: { supported: true, status: "ready", strategy: "native" },
    scheduler: { supported: true, status: "ready", strategy: "native" },
    conversation_gateway: { supported: true, status: "ready", strategy: "gateway" },
  },
  defaultSchedulers: [{
    id: "ironclaw-routines",
    label: "IronClaw Routines",
    enabled: true,
    status: "idle",
    kind: "routine",
  }],
  defaultMemory: (locations) => [{
    id: "ironclaw-memory",
    label: "IronClaw Memory",
    kind: "store",
    path: locations.workspacePath ? path.join(locations.workspacePath, "MEMORY.md") : undefined,
  }],
  defaultSkills: (locations) => [{
    id: "ironclaw-wasm-tools",
    label: "WASM Tools",
    enabled: true,
    scope: "runtime",
    path: locations.workspacePath ? path.join(locations.workspacePath, "tools") : undefined,
  }],
  conversationCli: (input) => ({
    command: "ironclaw",
    args: ["chat", "--message", input.prompt],
    timeoutMs: 130_000,
    parser: "stdout-text",
  }),
});
