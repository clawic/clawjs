import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { createWorkspaceClaw } from "./index.ts";

function createWorkspaceDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `clawjs-workspace-${label}-`));
}

function embedText(text: string): number[] {
  const normalized = text.toLowerCase();
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return alphabet.split("").map((letter) => normalized.split(letter).length - 1);
}

test("createWorkspaceClaw manages tasks, notes, people, inbox, events, and badges locally", async () => {
  const workspaceDir = createWorkspaceDir("crud");
  const claw = await createWorkspaceClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "workspace-crud",
      agentId: "agent-crud",
      rootDir: workspaceDir,
    },
    productivity: {
      semanticSearch: {
        embed: async (text) => embedText(text),
        minTextLength: 10,
      },
    },
  });

  const person = await claw.people.upsert({
    displayName: "Alice Example",
    emails: ["alice@example.com"],
    identities: [{ channel: "telegram", handle: "@alice" }],
  });

  const task = await claw.tasks.create({
    title: "Ship workspace package",
    description: "Implement the local-first productivity layer.",
    priority: "high",
    assigneePersonId: person.id,
    labels: ["sdk", "workspace"],
    dueAt: "2026-03-25T12:00:00.000Z",
  });

  const note = await claw.notes.create({
    title: "Launch checklist",
    content: "Workspace launch checklist with tasks, inbox, and notes.",
    tags: ["launch", "workspace"],
    linkedEntityIds: [task.id],
  });

  const event = await claw.events.create({
    title: "Workspace review",
    startsAt: "2026-03-26T09:00:00.000Z",
    attendeePersonIds: [person.id],
    linkedTaskIds: [task.id],
    linkedNoteIds: [note.id],
    reminders: [{ minutesBeforeStart: 30 }],
  });

  const incoming = await claw.inbox.ingestIncomingMessage({
    channel: "telegram",
    subject: "Workspace updates",
    content: "Please share the latest workspace launch checklist.",
    participantPersonIds: [person.id],
    linkedTaskIds: [task.id],
    linkedNoteIds: [note.id],
    replyTarget: { channel: "telegram", threadId: "thread-42" },
    externalThreadId: "thread-42",
    externalMessageId: "message-1",
  });

  assert.equal(incoming.thread.status, "read");
  assert.equal((await claw.inbox.getThread(incoming.thread.id))?.channel, "telegram");

  const reply = await claw.inbox.routeReply(incoming.thread.id, {
    content: "Shared. The checklist is updated.",
    linkedTaskIds: [task.id],
  });
  assert.equal(reply.status, "sent");
  assert.deepEqual(await claw.inbox.resolveReplyTarget(incoming.thread.id), { channel: "telegram", threadId: "thread-42" });

  const results = await claw.search.query({
    query: "launch checklist",
    domains: ["notes", "inbox", "tasks"],
    strategy: "hybrid",
  });
  assert.equal(results[0]?.domain, "notes");
  assert.equal(results.some((result) => result.domain === "inbox"), true);

  const badges = await claw.ui.badges();
  assert.equal(badges.find((badge) => badge.id === "inbox_unread")?.value, 0);
  assert.equal(badges.find((badge) => badge.id === "events_upcoming")?.value, 1);

  const rebuilt = await claw.workspaceIndex.rebuild();
  assert.ok(rebuilt.reindexed >= 4);
  assert.ok(rebuilt.embeddings >= 1);

  assert.equal(fs.existsSync(path.join(workspaceDir, ".clawjs", "data", "collections", "tasks")), true);
});

test("createWorkspaceClaw builds context blocks and augments conversation streaming", async () => {
  const workspaceDir = createWorkspaceDir("context");
  const claw = await createWorkspaceClaw({
    runtime: {
      adapter: "openclaw",
      gateway: { url: "http://127.0.0.1:18889" },
    },
    workspace: {
      appId: "demo",
      workspaceId: "workspace-context",
      agentId: "agent-context",
      rootDir: workspaceDir,
    },
  });

  await claw.tasks.create({
    title: "Workspace launch checklist response",
    description: "Summarize the workspace launch checklist for the user.",
    priority: "urgent",
  });
  await claw.notes.create({
    title: "Workspace launch checklist",
    content: "Workspace launch checklist includes tasks, inbox routing, notes, and events.",
  });
  await claw.events.create({
    title: "Launch call",
    startsAt: "2026-03-26T11:00:00.000Z",
  });

  const session = claw.conversations.createSession("Workspace help");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "Please summarize the workspace launch checklist",
  });

  const bundle = await claw.context.build({
    sessionId: session.sessionId,
    query: "workspace launch checklist",
    strategy: "keyword",
  });
  assert.equal(bundle.blocks.some((block) => block.title === "Relevant tasks"), true);
  assert.equal(bundle.blocks.some((block) => block.title === "Relevant notes"), true);

  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Workspace"}}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" summary"}}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), { status: 200 })) as typeof fetch;

  try {
    const seen: string[] = [];
    for await (const event of claw.conversations.streamAssistantReplyEvents({
      sessionId: session.sessionId,
      transport: "gateway",
      workspaceContext: "auto",
    })) {
      if (event.type === "chunk") {
        seen.push(event.chunk.delta);
      }
    }
    assert.deepEqual(seen, ["Workspace", " summary"]);
    assert.equal(claw.conversations.getSession(session.sessionId)?.messages.at(-1)?.content, "Workspace summary");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
