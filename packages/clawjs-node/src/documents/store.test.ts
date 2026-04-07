import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { createDocumentStore } from "./store.ts";

function createStore() {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-documents-"));
  return { workspaceDir, store: createDocumentStore(workspaceDir) };
}

test("upload indexes text documents and deduplicates canonical blob storage by hash", () => {
  const { store } = createStore();
  const contentBase64 = Buffer.from("budget alpha for q3", "utf8").toString("base64");

  const first = store.upload({
    name: "budget.txt",
    mimeType: "text/plain",
    data: contentBase64,
    sessionId: "session-1",
  });
  const second = store.upload({
    name: "budget-copy.txt",
    mimeType: "text/plain",
    data: contentBase64,
    sessionId: "session-1",
  });

  assert.notEqual(first.documentId, second.documentId);
  assert.equal(first.storage.kind, "blob");
  assert.equal(second.storage.kind, "blob");
  assert.equal(first.storage.path, second.storage.path);
  assert.equal(first.indexStatus, "indexed");

  const hits = store.search({ query: "q3", sessionId: "session-1" });
  assert.equal(hits.some((document) => document.documentId === first.documentId), true);
});

test("registerPath preserves stable workspace files without copying blobs", () => {
  const { workspaceDir, store } = createStore();
  const sourcePath = path.join(workspaceDir, "reports", "plan.txt");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "deploy plan alpha");

  const document = store.registerPath({
    filePath: "reports/plan.txt",
    name: "plan.txt",
    mimeType: "text/plain",
    sessionId: "session-2",
  });

  assert.equal(document.storage.kind, "workspace_path");
  assert.match(document.storage.path, /reports\/plan\.txt$/);
  assert.equal(store.download(document.documentId)?.buffer.toString("utf8"), "deploy plan alpha");
});

test("chunked uploads commit into persisted searchable documents", () => {
  const { store } = createStore();
  const { uploadId } = store.beginUpload({
    name: "notes.md",
    mimeType: "text/markdown",
    sessionId: "session-3",
  });

  store.appendUploadChunk(uploadId, Buffer.from("# Notes\nalpha beta", "utf8").toString("base64"));
  const document = store.commitUpload(uploadId);

  assert.equal(document.name, "notes.md");
  assert.equal(document.sessionId, "session-3");
  assert.equal(store.get(document.documentId)?.documentId, document.documentId);
  assert.equal(store.resolveRefs([document.documentId])[0]?.documentId, document.documentId);
  assert.equal(store.search({ query: "alpha", sessionId: "session-3" })[0]?.documentId, document.documentId);
});
