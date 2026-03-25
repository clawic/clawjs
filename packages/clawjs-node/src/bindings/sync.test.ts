import test from "node:test";
import assert from "node:assert/strict";
import childProcess from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import { syncBinding } from "./sync.ts";
import { NodeFileSystemHost } from "../host/filesystem.ts";
import { CANONICAL_RUNTIME_FILES, resolveWorkspaceFileLockPath } from "../workspace/manager.ts";

test("syncBinding updates a managed block from structured settings", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-binding-"));
  const result = syncBinding({
    workspaceDir,
    binding: {
      id: "tone",
      targetFile: "SOUL.md",
      mode: "managed_block",
      blockId: "tone",
      settingsPath: "tone",
    },
    settings: { tone: "direct" },
    render: (settings) => `tone=${settings.tone}`,
  });

  assert.equal(result.changed, true);
  const content = fs.readFileSync(path.join(workspaceDir, "SOUL.md"), "utf8");
  assert.match(content, /tone=direct/);
});

test("syncBinding supports dry-run mode", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-binding-dry-"));
  const result = syncBinding({
    workspaceDir,
    dryRun: true,
    binding: {
      id: "mode",
      targetFile: "AGENTS.md",
      mode: "append",
      settingsPath: "mode",
    },
    settings: { mode: "safe" },
    render: (settings) => `\nmode=${settings.mode}\n`,
  });

  assert.equal(result.changed, true);
  assert.equal(fs.existsSync(path.join(workspaceDir, "AGENTS.md")), false);
});

test("syncBinding respects file locks for concurrent mutations", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-binding-lock-"));
  const filesystem = new NodeFileSystemHost();
  const lock = filesystem.acquireLock(resolveWorkspaceFileLockPath(workspaceDir, "SOUL.md"));

  assert.throws(() => syncBinding({
    workspaceDir,
    filesystem,
    binding: {
      id: "tone",
      targetFile: "SOUL.md",
      mode: "managed_block",
      blockId: "tone",
      settingsPath: "tone",
    },
    settings: { tone: "direct" },
    render: (settings) => `tone=${settings.tone}`,
  }));

  lock.release();
});

test("syncBinding supports every canonical runtime file and synthetic targets", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-binding-canonical-"));

  for (const targetFile of [...CANONICAL_RUNTIME_FILES, "CUSTOM.md"]) {
    const result = syncBinding({
      workspaceDir,
      binding: {
        id: `${targetFile}:tone`,
        targetFile,
        mode: "managed_block",
        blockId: "tone",
        settingsPath: "tone",
      },
      settings: { tone: targetFile.toLowerCase() },
      render: (settings) => `tone=${settings.tone}`,
    });

    assert.equal(result.changed, true);
    const content = fs.readFileSync(path.join(workspaceDir, targetFile), "utf8");
    assert.match(content, /CLAWJS:tone:START/);
    assert.match(content, new RegExp(`tone=${targetFile.toLowerCase().replace(".", "\\.")}`));
  }
});

test("syncBinding recreates a managed block after it was manually removed", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-binding-recreate-"));
  const filePath = path.join(workspaceDir, "SOUL.md");
  fs.writeFileSync(filePath, "before\n");

  const first = syncBinding({
    workspaceDir,
    binding: {
      id: "tone",
      targetFile: "SOUL.md",
      mode: "managed_block",
      blockId: "tone",
      settingsPath: "tone",
      required: true,
    },
    settings: { tone: "direct" },
    render: (settings) => `tone=${settings.tone}`,
  });
  assert.equal(first.changed, true);

  fs.writeFileSync(filePath, "before\n");

  const recreated = syncBinding({
    workspaceDir,
    binding: {
      id: "tone",
      targetFile: "SOUL.md",
      mode: "managed_block",
      blockId: "tone",
      settingsPath: "tone",
      required: true,
    },
    settings: { tone: "warm" },
    render: (settings) => `tone=${settings.tone}`,
  });

  assert.equal(recreated.changed, true);
  assert.match(fs.readFileSync(filePath, "utf8"), /tone=warm/);
});

test("syncBinding is idempotent for repeated settings and normalizes newlines", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-binding-idempotent-"));

  const first = syncBinding({
    workspaceDir,
    binding: {
      id: "tone",
      targetFile: "SOUL.md",
      mode: "managed_block",
      blockId: "tone",
      settingsPath: "tone",
    },
    settings: { tone: "line1\r\nline2" },
    render: (settings) => `tone=${settings.tone}`,
  });
  const second = syncBinding({
    workspaceDir,
    binding: {
      id: "tone",
      targetFile: "SOUL.md",
      mode: "managed_block",
      blockId: "tone",
      settingsPath: "tone",
    },
    settings: { tone: "line1\r\nline2" },
    render: (settings) => `tone=${settings.tone}`,
  });

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(fs.readFileSync(path.join(workspaceDir, "SOUL.md"), "utf8").includes("\r\n"), false);
});

test("syncBinding fails when another process holds the target file lock", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-binding-cross-process-"));
  const lockPath = resolveWorkspaceFileLockPath(workspaceDir, "SOUL.md");

  const child = childProcess.spawn(process.execPath, [
    "-e",
    `
      const fs = require("fs");
      const path = process.argv[1];
      fs.mkdirSync(require("path").dirname(path), { recursive: true });
      const fd = fs.openSync(path, "wx");
      setTimeout(() => {
        fs.closeSync(fd);
        fs.unlinkSync(path);
      }, 400);
    `,
    lockPath,
  ], { stdio: "ignore" });

  await new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (fs.existsSync(lockPath)) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - startedAt > 1_000) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for the child process to acquire the workspace lock"));
      }
    }, 10);
  });
  assert.throws(() => syncBinding({
    workspaceDir,
    binding: {
      id: "tone",
      targetFile: "SOUL.md",
      mode: "managed_block",
      blockId: "tone",
      settingsPath: "tone",
    },
    settings: { tone: "direct" },
    render: (settings) => `tone=${settings.tone}`,
  }));
  await new Promise((resolve) => child.on("exit", resolve));
});
