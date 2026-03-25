import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import childProcess from "child_process";
import { WorkspaceAuditLog } from "./audit.ts";

test("audit log appends records inside the workspace", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-audit-"));
  const audit = new WorkspaceAuditLog();

  const auditPath = audit.append(workspaceDir, {
    timestamp: "2026-03-20T10:00:00.000Z",
    event: "workspace.created",
    detail: { workspaceId: "demo" },
  });

  audit.append(workspaceDir, {
    timestamp: "2026-03-20T10:01:00.000Z",
    event: "files.synced",
  });

  const lines = fs.readFileSync(auditPath, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).event, "workspace.created");
  assert.equal(JSON.parse(lines[1]).event, "files.synced");
});

test("audit log keeps every line under cross-process contention", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-audit-cross-process-"));
  const moduleUrl = new URL("./audit.ts", import.meta.url).href;
  const totalChildren = 20;

  await Promise.all(
    Array.from({ length: totalChildren }, (_, index) => new Promise<void>((resolve, reject) => {
      const child = childProcess.spawn(process.execPath, [
        "--input-type=module",
        "-e",
        `
          const { WorkspaceAuditLog } = await import(process.argv[1]);
          const workspaceDir = process.argv[2];
          const index = Number(process.argv[3]);
          new WorkspaceAuditLog().append(workspaceDir, {
            timestamp: new Date(1_700_000_000_000 + index).toISOString(),
            event: "audit.child",
            detail: { index },
          });
        `,
        moduleUrl,
        workspaceDir,
        String(index),
      ], { stdio: "ignore" });

      child.once("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Audit child exited with code ${code ?? -1}`));
      });
      child.once("error", reject);
    })),
  );

  const auditPath = path.join(workspaceDir, ".clawjs", "audit", "audit.jsonl");
  const lines = fs.readFileSync(auditPath, "utf8").trim().split("\n");
  assert.equal(lines.length, totalChildren);
  const indexes = lines.map((line) => Number((JSON.parse(line) as { detail?: { index?: number } }).detail?.index)).sort((a, b) => a - b);
  assert.deepEqual(indexes, Array.from({ length: totalChildren }, (_, index) => index));
});

test("audit log can query records by capability and entity id", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-audit-query-"));
  const audit = new WorkspaceAuditLog();

  audit.append(workspaceDir, {
    timestamp: "2026-03-22T10:00:00.000Z",
    event: "tasks.created",
    capability: "tasks",
    detail: { taskId: "task-1" },
  });
  audit.append(workspaceDir, {
    timestamp: "2026-03-22T10:05:00.000Z",
    event: "notes.created",
    capability: "notes",
    detail: { noteId: "note-1" },
  });
  audit.append(workspaceDir, {
    timestamp: "2026-03-22T10:10:00.000Z",
    event: "tasks.updated",
    capability: "tasks",
    detail: { taskId: "task-1" },
  });

  const taskRecords = audit.query(workspaceDir, {
    capability: "tasks",
    entityId: "task-1",
  });
  assert.equal(taskRecords.length, 2);
  assert.deepEqual(taskRecords.map((record) => record.event), ["tasks.created", "tasks.updated"]);

  const created = audit.query(workspaceDir, { action: "created" });
  assert.deepEqual(created.map((record) => record.event), ["tasks.created", "notes.created"]);
});
