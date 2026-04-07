import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import childProcess from "child_process";

import { ConversationStore, resolveConversationPath } from "./store.ts";

function createStore() {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-conversations-"));
  return { workspaceDir, store: new ConversationStore(workspaceDir) };
}

test("createSession writes a new transcript and listSessions returns it", () => {
  const { store, workspaceDir } = createStore();
  const session = store.createSession("  my new session  ");

  assert.match(session.sessionId, /^clawjs-/);
  assert.equal(session.title, "my new session");
  assert.equal(fs.existsSync(path.join(workspaceDir, ".clawjs", "conversations", `${session.sessionId}.jsonl`)), true);

  const sessions = store.listSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.sessionId, session.sessionId);
});

test("listSessions sorts by most recently updated session", () => {
  const { store } = createStore();
  const first = store.createSession("first");
  const second = store.createSession("second");

  store.appendMessage(first.sessionId, { role: "user", content: "older message", createdAt: 1_000 });
  store.appendMessage(second.sessionId, { role: "user", content: "newer message", createdAt: 2_000 });

  const sessions = store.listSessions();
  assert.equal(sessions[0]?.sessionId, second.sessionId);
  assert.equal(sessions[1]?.sessionId, first.sessionId);
});

test("getSession returns hydrated messages and preview", () => {
  const { store } = createStore();
  const session = store.createSession();
  store.appendMessage(session.sessionId, {
    role: "user",
    content: "A question about boundaries and work",
    createdAt: 1_000,
    attachments: [{ name: "note.txt", mimeType: "text/plain" }],
    contextChips: [{ type: "person", id: "p1", label: "Taylor" }],
  });
  store.appendMessage(session.sessionId, { role: "assistant", content: "Here is a short reply", createdAt: 2_000 });

  const loaded = store.getSession(session.sessionId);
  assert.ok(loaded);
  assert.equal(loaded?.messages.length, 2);
  assert.equal(loaded?.preview, "Here is a short reply");
  assert.equal(loaded?.messages[0]?.attachments?.[0]?.name, "note.txt");
  assert.equal(loaded?.messages[0]?.contextChips?.[0]?.label, "Taylor");
});

test("getSession preserves document references on persisted messages", () => {
  const { store } = createStore();
  const session = store.createSession();
  store.appendMessage(session.sessionId, {
    role: "user",
    content: "See attached",
    createdAt: 1_000,
    documents: [{
      documentId: "document-1",
      name: "budget.txt",
      mimeType: "text/plain",
      sizeBytes: 128,
    }],
  });

  const loaded = store.getSession(session.sessionId);
  assert.equal(loaded?.messages[0]?.documents?.[0]?.documentId, "document-1");
  assert.equal(loaded?.messages[0]?.documents?.[0]?.name, "budget.txt");
});

test("searchSessions matches title, preview, and message content", () => {
  const { store } = createStore();
  const titleSession = store.createSession("Quarterly planning");
  store.appendMessage(titleSession.sessionId, {
    role: "user",
    content: "Agenda draft",
    createdAt: 1_000,
  });

  const messageSession = store.createSession("Inbox");
  store.appendMessage(messageSession.sessionId, {
    role: "user",
    content: "Need to review the quarterly budget with finance",
    createdAt: 2_000,
  });

  const results = store.searchSessions("quarterly");

  assert.equal(results.length, 2);
  assert.equal(results[0]?.sessionId, titleSession.sessionId);
  assert.deepEqual(results[0]?.matchedFields, ["title"]);
  assert.equal(results[1]?.sessionId, messageSession.sessionId);
  assert.equal(results[1]?.matchedFields.includes("message"), true);
});

test("updateSessionTitle rewrites the transcript header", () => {
  const { store, workspaceDir } = createStore();
  const session = store.createSession("initial");
  const ok = store.updateSessionTitle(session.sessionId, "  updated title  ");

  assert.equal(ok, true);
  const raw = fs.readFileSync(path.join(workspaceDir, ".clawjs", "conversations", `${session.sessionId}.jsonl`), "utf8");
  assert.match(raw, /updated title/);
});

test("ConversationStore instances share the same workspace transcript without leaking into other workspaces", () => {
  const workspaceA = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-conversations-a-"));
  const workspaceB = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-conversations-b-"));
  const storeA1 = new ConversationStore(workspaceA);
  const storeA2 = new ConversationStore(workspaceA);
  const storeB = new ConversationStore(workspaceB);

  const sessionA = storeA1.createSession("shared");
  storeA1.appendMessage(sessionA.sessionId, {
    role: "user",
    content: "first message",
    createdAt: 1_000,
  });

  assert.equal(storeA2.getSession(sessionA.sessionId)?.messageCount, 1);

  storeA2.appendMessage(sessionA.sessionId, {
    role: "assistant",
    content: "second message",
    createdAt: 2_000,
  });

  assert.equal(storeA1.getSession(sessionA.sessionId)?.messageCount, 2);
  assert.equal(storeB.listSessions().length, 0);
  assert.equal(storeB.getSession(sessionA.sessionId), null);
  assert.equal(fs.existsSync(resolveConversationPath(workspaceB, sessionA.sessionId)), false);
});

test("ConversationStore preserves every message across cross-process append contention", async () => {
  const { store, workspaceDir } = createStore();
  const session = store.createSession("contention");
  const moduleUrl = new URL("./store.ts", import.meta.url).href;

  await Promise.all(
    ["worker-a", "worker-b"].map((prefix) => new Promise<void>((resolve, reject) => {
      const child = childProcess.spawn(process.execPath, [
        "--input-type=module",
        "-e",
        `
          const { ConversationStore } = await import(process.argv[1]);
          const store = new ConversationStore(process.argv[2]);
          const sessionId = process.argv[3];
          const prefix = process.argv[4];
          for (let index = 0; index < 25; index += 1) {
            store.appendMessage(sessionId, {
              role: "user",
              content: prefix + "-" + index,
              createdAt: 1_700_000_000_000 + index,
            });
          }
        `,
        moduleUrl,
        workspaceDir,
        session.sessionId,
        prefix,
      ], { stdio: "ignore" });

      child.once("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Conversation child exited with code ${code ?? -1}`));
      });
      child.once("error", reject);
    })),
  );

  const loaded = store.getSession(session.sessionId);
  assert.ok(loaded);
  assert.equal(loaded?.messageCount, 50);
  const contents = new Set(loaded?.messages.map((message) => message.content));
  for (const prefix of ["worker-a", "worker-b"]) {
    for (let index = 0; index < 25; index += 1) {
      assert.equal(contents.has(`${prefix}-${index}`), true);
    }
  }
});

test("ConversationStore serializes append and title updates across processes", async () => {
  const { store, workspaceDir } = createStore();
  const session = store.createSession("initial");
  const moduleUrl = new URL("./store.ts", import.meta.url).href;

  const child = childProcess.spawn(process.execPath, [
    "--input-type=module",
    "-e",
    `
      const { ConversationStore } = await import(process.argv[1]);
      const store = new ConversationStore(process.argv[2]);
      const sessionId = process.argv[3];
      for (let index = 0; index < 30; index += 1) {
        store.appendMessage(sessionId, {
          role: "assistant",
          content: "reply-" + index,
          createdAt: 1_700_000_100_000 + index,
        });
      }
    `,
    moduleUrl,
    workspaceDir,
    session.sessionId,
  ], { stdio: "ignore" });

  for (let index = 0; index < 10; index += 1) {
    store.updateSessionTitle(session.sessionId, `title-${index}`);
  }

  await new Promise<void>((resolve, reject) => {
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Conversation title child exited with code ${code ?? -1}`));
    });
    child.once("error", reject);
  });

  const loaded = store.getSession(session.sessionId);
  assert.ok(loaded);
  assert.equal(loaded?.messageCount, 30);
  assert.equal(loaded?.title, "title-9");
});
