import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  readAllObservedDomains,
  readObservedDomain,
  resolveObservedDomainPath,
  writeObservedDomain,
} from "./store.ts";

test("observed store round-trips runtime and models snapshots", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-observed-store-"));

  writeObservedDomain(workspaceDir, "runtime", {
    runtime: {
      adapter: "demo",
      runtimeName: "DemoClaw",
      version: "demo-default",
      cliAvailable: true,
      gatewayAvailable: true,
      capabilities: {
        runtime: true,
      },
      capabilityMap: {
        runtime: {
          supported: true,
          status: "ready",
          strategy: "native",
        },
      },
      diagnostics: {},
    },
  });
  writeObservedDomain(workspaceDir, "models", {
    catalog: {
      models: [],
      defaultModel: null,
    },
    defaultModel: {
      provider: "openai",
      modelId: "openai/gpt-5.4",
      label: "GPT-5.4",
    },
  });

  assert.equal(readObservedDomain(workspaceDir, "runtime")?.runtime.adapter, "demo");
  assert.equal(readObservedDomain(workspaceDir, "models")?.defaultModel?.modelId, "openai/gpt-5.4");
  assert.equal(fs.existsSync(resolveObservedDomainPath(workspaceDir, "runtime")), true);
  assert.deepEqual(Object.keys(readAllObservedDomains(workspaceDir)).sort(), ["models", "runtime"]);
});
