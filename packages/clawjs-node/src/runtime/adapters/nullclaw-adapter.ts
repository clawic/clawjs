import path from "path";

import type { RuntimeFileDescriptor } from "@clawjs/core";

import { createSimpleRuntimeAdapter } from "./simple-adapter.ts";

const NULLCLAW_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "SOUL", path: "SOUL.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "USER", path: "USER.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "AGENTS", path: "AGENTS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "IDENTITY", path: "IDENTITY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

export const nullclawAdapter = createSimpleRuntimeAdapter({
  id: "nullclaw",
  runtimeName: "NullClaw",
  binary: "nullclaw",
  workspaceFiles: NULLCLAW_WORKSPACE_FILES,
  homeDirName: ".nullclaw",
  configFileName: "config.json",
  authFileName: "auth.json",
  defaultModelKeys: ["defaultModel", "model"],
  modelListCommand: ["models", "list", "--json"],
  setDefaultModelArgs: (model) => ["models", "set-default", model],
  loginArgs: (provider) => ["auth", "login", "--provider", provider],
  defaultMemory: (locations) => [{
    id: "nullclaw-memory",
    label: "NullClaw Memory",
    kind: "file",
    path: locations.workspacePath ? path.join(locations.workspacePath, "SOUL.md") : undefined,
    summary: "Minimal runtime memory surface.",
  }],
  conversationCli: (input) => ({
    command: "nullclaw",
    args: ["agent", "-m", input.prompt],
    timeoutMs: 130_000,
    parser: "stdout-text",
  }),
});
