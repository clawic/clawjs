import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { initializeWorkspaceManifest, readWorkspaceManifest, resolveManifestPath } from "./manifest.ts";

test("initializeWorkspaceManifest writes a manifest inside .clawjs", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-workspace-"));
  const manifest = initializeWorkspaceManifest({
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: workspaceDir,
  }, "openclaw");

  assert.equal(fs.existsSync(resolveManifestPath(workspaceDir)), true);
  assert.equal(readWorkspaceManifest(workspaceDir)?.workspaceId, manifest.workspaceId);
});
