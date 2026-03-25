import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { applyTemplatePack } from "./template-pack.ts";
import { NodeFileSystemHost } from "../host/filesystem.ts";
import { resolveWorkspaceFileLockPath } from "../workspace/manager.ts";

test("template packs can seed and manage workspace files", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-template-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const packDir = path.join(tempRoot, "pack");
  fs.mkdirSync(packDir, { recursive: true });

  fs.writeFileSync(path.join(packDir, "template-pack.json"), JSON.stringify({
    schemaVersion: 1,
    id: "demo",
    name: "Demo",
    mutations: [
      { targetFile: "SOUL.md", mode: "seed_if_missing", content: "# Soul\n" },
      { targetFile: "SOUL.md", mode: "managed_block", blockId: "settings", content: "flag = true" },
    ],
  }, null, 2));

  const results = applyTemplatePack(path.join(packDir, "template-pack.json"), { workspaceDir });
  assert.equal(results.length, 2);

  const content = fs.readFileSync(path.join(workspaceDir, "SOUL.md"), "utf8");
  assert.match(content, /# Soul/);
  assert.match(content, /CLAWJS:settings:START/);
});

test("template packs respect file locks for concurrent mutations", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-template-lock-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const packDir = path.join(tempRoot, "pack");
  const filesystem = new NodeFileSystemHost();
  fs.mkdirSync(packDir, { recursive: true });

  fs.writeFileSync(path.join(packDir, "template-pack.json"), JSON.stringify({
    schemaVersion: 1,
    id: "demo",
    name: "Demo",
    mutations: [
      { targetFile: "SOUL.md", mode: "seed_if_missing", content: "# Soul\n" },
    ],
  }, null, 2));

  const lock = filesystem.acquireLock(resolveWorkspaceFileLockPath(workspaceDir, "SOUL.md"));
  assert.throws(() => applyTemplatePack(path.join(packDir, "template-pack.json"), {
    workspaceDir,
    filesystem,
  }));
  lock.release();
});
