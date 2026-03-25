import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { watchWorkspaceFile } from "./index.ts";
import { NodeFileSystemHost } from "../host/filesystem.ts";

test("watchWorkspaceFile emits a callback when the file changes", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-watch-"));
  const fileName = "SOUL.md";
  const filePath = path.join(workspaceDir, fileName);
  fs.writeFileSync(filePath, "initial\n");

  const event = await new Promise<{ eventType: string; filePath: string }>((resolve) => {
    const stop = watchWorkspaceFile(workspaceDir, fileName, (payload) => {
      stop();
      resolve(payload);
    });

    setTimeout(() => {
      fs.writeFileSync(filePath, "updated\n");
    }, 20);
  });

  assert.equal(event.filePath, filePath);
  assert.ok(event.eventType.length > 0);
});

test("watchWorkspaceFile can observe creation of a missing file inside an existing directory", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-watch-create-"));
  const nestedDir = path.join(workspaceDir, ".clawjs", "conversations");
  fs.mkdirSync(nestedDir, { recursive: true });
  const fileName = path.join(".clawjs", "conversations", "session-1.jsonl");
  const filePath = path.join(workspaceDir, fileName);

  const event = await new Promise<{ eventType: string; filePath: string }>((resolve) => {
    const stop = watchWorkspaceFile(workspaceDir, fileName, (payload) => {
      stop();
      resolve(payload);
    });

    setTimeout(() => {
      fs.writeFileSync(filePath, "{\"type\":\"session\"}\n");
    }, 20);
  });

  assert.equal(event.filePath, filePath);
  assert.ok(event.eventType.length > 0);
});

test("watchWorkspaceFile debounces noisy changes into one callback", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-watch-debounce-"));
  const fileName = "SOUL.md";
  const filePath = path.join(workspaceDir, fileName);
  fs.writeFileSync(filePath, "initial\n");

  const events: { eventType: string; filePath: string }[] = [];
  const stop = watchWorkspaceFile(workspaceDir, fileName, (payload) => {
    events.push(payload);
  }, { debounceMs: 80 });

  setTimeout(() => {
    fs.writeFileSync(filePath, "one\n");
    fs.writeFileSync(filePath, "two\n");
    fs.writeFileSync(filePath, "three\n");
  }, 20);

  await new Promise((resolve) => setTimeout(resolve, 260));
  stop();

  assert.equal(events.length, 1);
  assert.equal(events[0]?.filePath, filePath);
});

test("watchWorkspaceFile survives repeated atomic renames", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-watch-atomic-"));
  const fileName = "SOUL.md";
  const filePath = path.join(workspaceDir, fileName);
  const filesystem = new NodeFileSystemHost();
  filesystem.writeTextAtomic(filePath, "initial\n");

  const events: { eventType: string; filePath: string }[] = [];
  const stop = watchWorkspaceFile(workspaceDir, fileName, (payload) => {
    events.push(payload);
  }, { debounceMs: 15 });

  filesystem.writeTextAtomic(filePath, "first\n");
  await new Promise((resolve) => setTimeout(resolve, 60));
  filesystem.writeTextAtomic(filePath, "second\n");
  await new Promise((resolve) => setTimeout(resolve, 120));
  stop();

  assert.equal(events.length >= 2, true);
  assert.equal(events.every((event) => event.filePath === filePath), true);
});
