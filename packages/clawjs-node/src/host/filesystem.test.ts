import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

import { NodeFileSystemHost } from "./filesystem.ts";

test("writeTextAtomic writes new content and skips identical rewrites", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-fs-"));
  const host = new NodeFileSystemHost();
  const filePath = path.join(tempRoot, "file.txt");
  const backupsDir = path.join(tempRoot, "backups");

  const first = host.writeTextAtomic(filePath, "hello\n", { backupDir: backupsDir });
  assert.equal(first.changed, true);
  assert.equal(fs.readFileSync(filePath, "utf8"), "hello\n");

  const second = host.writeTextAtomic(filePath, "hello\n", { backupDir: backupsDir });
  assert.equal(second.changed, false);

  const third = host.writeTextAtomic(filePath, "updated\n", { backupDir: backupsDir });
  assert.equal(third.changed, true);
  assert.ok(third.backupPath);
  assert.equal(fs.readFileSync(third.backupPath!, "utf8"), "hello\n");
});

test("acquireLock blocks a second host instance until the lock is released, and restoreFromBackup rehydrates content", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-lock-"));
  const hostA = new NodeFileSystemHost();
  const hostB = new NodeFileSystemHost();
  const filePath = path.join(tempRoot, "file.txt");
  const backupDir = path.join(tempRoot, "backups");
  const lockPath = path.join(tempRoot, ".locks", "file.lock");

  hostA.writeTextAtomic(filePath, "before\n", { backupDir });
  const update = hostA.writeTextAtomic(filePath, "after\n", { backupDir });
  assert.ok(update.backupPath);

  const lock = hostA.acquireLock(lockPath);
  assert.equal(fs.existsSync(lockPath), true);
  assert.throws(() => hostB.acquireLock(lockPath));
  lock.release();
  assert.equal(fs.existsSync(lockPath), false);

  const lockAfterRelease = hostB.acquireLock(lockPath);
  lockAfterRelease.release();

  hostA.restoreFromBackup(filePath, update.backupPath!);
  assert.equal(fs.readFileSync(filePath, "utf8"), "before\n");
});

test("acquireLock also blocks a separate process from taking the same lock", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-lock-proc-"));
  const host = new NodeFileSystemHost();
  const lockPath = path.join(tempRoot, ".locks", "workspace.lock");
  const moduleUrl = pathToFileURL(path.resolve("packages/clawjs-node/src/host/filesystem.ts")).href;
  const script = `
    import { NodeFileSystemHost } from ${JSON.stringify(moduleUrl)};

    const host = new NodeFileSystemHost();
    try {
      host.acquireLock(process.env.LOCK_PATH);
      process.stdout.write("acquired");
      process.exit(0);
    } catch (error) {
      process.stderr.write(String(error?.code || error?.message || error));
      process.exit(1);
    }
  `;

  const lock = host.acquireLock(lockPath);
  const blocked = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    env: {
      ...process.env,
      LOCK_PATH: lockPath,
    },
    encoding: "utf8",
  });

  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /EEXIST/);

  lock.release();

  const acquired = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    env: {
      ...process.env,
      LOCK_PATH: lockPath,
    },
    encoding: "utf8",
  });

  assert.equal(acquired.status, 0);
  assert.equal(acquired.stdout, "acquired");
});
