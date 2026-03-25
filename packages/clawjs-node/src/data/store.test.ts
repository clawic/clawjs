import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { createWorkspaceDataStore } from "./store.ts";

test("workspace data store reads and writes documents", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-data-docs-"));
  const data = createWorkspaceDataStore(workspaceDir);
  const document = data.document<{ enabled: boolean }>("settings");

  assert.equal(document.exists(), false);
  document.write({ enabled: true });

  assert.equal(document.exists(), true);
  assert.deepEqual(document.read(), { enabled: true });
});

test("workspace data store supports collection CRUD and stable ordering", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-data-collection-"));
  const data = createWorkspaceDataStore(workspaceDir);
  const collection = data.collection<{ title: string }>("notes");

  collection.put("b", { title: "Beta" });
  collection.put("a", { title: "Alpha" });

  assert.deepEqual(collection.listIds(), ["a", "b"]);
  assert.deepEqual(collection.entries(), [
    { id: "a", value: { title: "Alpha" } },
    { id: "b", value: { title: "Beta" } },
  ]);

  collection.remove("a");
  assert.equal(collection.get("a"), null);
});

test("workspace data store supports text and binary assets", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-data-assets-"));
  const data = createWorkspaceDataStore(workspaceDir);
  const textAsset = data.asset("notes/context.txt");
  const binaryAsset = data.asset("avatars/user.bin");

  textAsset.writeText("hello");
  binaryAsset.writeBuffer(Buffer.from([1, 2, 3]));

  assert.equal(textAsset.readText(), "hello");
  assert.deepEqual(Array.from(binaryAsset.readBuffer() ?? []), [1, 2, 3]);
});
