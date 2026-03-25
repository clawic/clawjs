import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createSession,
  extractLatestUserMessageFromWrappedPrompt,
  getSession,
  listSessions,
  openClawSessionsDir,
  parseOpenClawTranscript,
  sessionExists,
} from "./sessions.ts";

test("extractLatestUserMessageFromWrappedPrompt returns the latest user block", () => {
  const wrapped = [
    "You are ClawJS inside a web chat UI.",
    "CONVERSATION:",
    "ASSISTANT: Earlier reply",
    "",
    "USER: First turn",
    "",
    "ASSISTANT: Follow-up",
    "",
    "USER: Latest turn",
    "Attachments: image/png #1",
  ].join("\n");

  assert.equal(extractLatestUserMessageFromWrappedPrompt(wrapped), "Latest turn");
});

test("parseOpenClawTranscript recovers user and assistant messages", () => {
  const transcript = [
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-17T10:00:00.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "CONVERSATION:\nASSISTANT: Hi\n\nUSER: I need to talk" }],
      },
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-17T10:00:01.000Z",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "[[reply_to_current]] Sure, tell me more." }],
      },
    }),
  ].join("\n");

  assert.deepEqual(
    parseOpenClawTranscript(transcript).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    [
      { role: "user", content: "I need to talk" },
      { role: "assistant", content: "Sure, tell me more." },
    ]
  );
});

test("sessions load directly from OpenClaw transcripts", { concurrency: false }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-sessions-"));
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = tempRoot;

  try {
    const sessionId = "clawjs-legacy-session";
    fs.mkdirSync(openClawSessionsDir(), { recursive: true });
    fs.writeFileSync(
      path.join(openClawSessionsDir(), `${sessionId}.jsonl`),
      [
        JSON.stringify({
          type: "session",
          id: sessionId,
          timestamp: "2026-03-17T11:00:00.000Z",
        }),
        JSON.stringify({
          type: "message",
          id: "user-1",
          timestamp: "2026-03-17T11:00:00.000Z",
          message: {
            role: "user",
            content: [{ type: "text", text: "CONVERSATION:\nUSER: Legacy prompt" }],
          },
        }),
        JSON.stringify({
          type: "message",
          id: "assistant-1",
          timestamp: "2026-03-17T11:00:01.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Legacy reply" }],
          },
        }),
      ].join("\n")
    );

    const sessions = listSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.sessionId, sessionId);
    assert.equal(getSession(sessionId)?.messages.length, 2);
    assert.equal(getSession(sessionId)?.messages[0]?.content, "Legacy prompt");
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("session event titles override transcript-derived summaries", { concurrency: false }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-session-title-"));
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = tempRoot;

  try {
    const sessionId = "clawjs-explicit-title";
    fs.mkdirSync(openClawSessionsDir(), { recursive: true });
    fs.writeFileSync(
      path.join(openClawSessionsDir(), `${sessionId}.jsonl`),
      [
        JSON.stringify({
          type: "session",
          id: sessionId,
          timestamp: "2026-03-17T11:00:00.000Z",
          title: "Burnout",
        }),
        JSON.stringify({
          type: "message",
          id: "assistant-1",
          timestamp: "2026-03-17T11:00:01.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "We can start there." }],
          },
        }),
        JSON.stringify({
          type: "message",
          id: "user-1",
          timestamp: "2026-03-17T11:00:02.000Z",
          message: {
            role: "user",
            content: [{ type: "text", text: "CONVERSATION:\nASSISTANT: We can start there.\n\nUSER: Work is starting to overwhelm me" }],
          },
        }),
      ].join("\n")
    );

    const session = getSession(sessionId);
    assert.equal(session?.title, "Burnout");
    assert.equal(listSessions()[0]?.title, "Burnout");
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("createSession uses the SDK-backed session store", { concurrency: false }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-create-session-"));
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = tempRoot;

  try {
    const created = createSession("Set boundaries");
    assert.match(created.sessionId, /^clawjs-/);
    assert.equal(created.title, "Set boundaries");
    assert.equal(created.messages.length, 0);
    assert.equal(sessionExists(created.sessionId), true);

    const transcript = fs.readFileSync(
      path.join(openClawSessionsDir(), `${created.sessionId}.jsonl`),
      "utf8"
    ).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(transcript.length, 1);
    assert.equal(transcript[0]?.type, "session");
    assert.equal(transcript[0]?.title, "Set boundaries");
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
