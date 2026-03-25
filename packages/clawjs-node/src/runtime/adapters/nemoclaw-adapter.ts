import path from "path";

import type { RuntimeFileDescriptor, ProviderDescriptor } from "@clawjs/core";

import { createSimpleRuntimeAdapter } from "./simple-adapter.ts";

const NEMOCLAW_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "SOUL", path: "SOUL.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "USER", path: "USER.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "AGENTS", path: "AGENTS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "TOOLS", path: "TOOLS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "IDENTITY", path: "IDENTITY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "MEMORY", path: "MEMORY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

const NEMOCLAW_PROVIDERS: ProviderDescriptor[] = [
  { id: "openai", label: "openai", envVars: ["OPENAI_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "anthropic", label: "anthropic", envVars: ["ANTHROPIC_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "nvidia", label: "nvidia", envVars: ["NVIDIA_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
];

export const nemoclawAdapter = createSimpleRuntimeAdapter({
  id: "nemoclaw",
  runtimeName: "NemoClaw",
  binary: "nemoclaw",
  workspaceFiles: NEMOCLAW_WORKSPACE_FILES,
  homeDirName: ".nemoclaw",
  configFileName: "config.json",
  authFileName: "auth.json",
  providerCatalog: NEMOCLAW_PROVIDERS,
  defaultModelKeys: ["defaultModel", "model"],
  modelListCommand: ["models", "list", "--json"],
  setDefaultModelArgs: (model) => ["models", "set-default", model],
  loginArgs: (provider) => ["auth", "login", "--provider", provider],
  probeCommands: {
    scheduler: ["jobs", "list"],
    sandbox: ["openshell", "status"],
  },
  gatewaySupport: true,
  capabilityOverrides: {
    sandbox: { supported: true, status: "ready", strategy: "hosted", limitations: ["Sandboxing is provided by the host OpenShell/Nemo stack."] },
    scheduler: { supported: true, status: "ready", strategy: "hosted" },
    conversation_gateway: { supported: true, status: "ready", strategy: "gateway" },
  },
  defaultSchedulers: [{
    id: "nemoclaw-jobs",
    label: "NemoClaw Jobs",
    enabled: true,
    status: "idle",
    kind: "job",
  }],
  defaultMemory: (locations) => [{
    id: "nemoclaw-memory",
    label: "NemoClaw Memory",
    kind: "store",
    path: locations.workspacePath ? path.join(locations.workspacePath, "MEMORY.md") : undefined,
  }],
  conversationCli: (input) => ({
    command: "nemoclaw",
    args: ["agent", "-m", input.prompt],
    timeoutMs: 130_000,
    parser: "stdout-text",
  }),
});
