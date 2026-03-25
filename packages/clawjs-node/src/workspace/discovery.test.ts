import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { initializeWorkspace } from "./manager.ts";
import { discoverWorkspaces } from "./discovery.ts";

test("discoverWorkspaces finds explicit ClawJS workspaces under a root", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-discovery-"));
  const workspaceA = path.join(tempRoot, "apps", "a");
  const workspaceB = path.join(tempRoot, "apps", "nested", "b");
  fs.mkdirSync(workspaceA, { recursive: true });
  fs.mkdirSync(workspaceB, { recursive: true });

  initializeWorkspace({
    appId: "demo",
    workspaceId: "a",
    agentId: "a",
    rootDir: workspaceA,
  }, "openclaw");
  initializeWorkspace({
    appId: "demo",
    workspaceId: "b",
    agentId: "b",
    rootDir: workspaceB,
  }, "openclaw");

  const discovered = discoverWorkspaces({
    roots: [tempRoot],
    maxDepth: 6,
  });

  assert.deepEqual(discovered.map((entry) => entry.rootDir), [workspaceA, workspaceB]);
  assert.deepEqual(discovered.map((entry) => entry.manifest?.workspaceId), ["a", "b"]);
});
