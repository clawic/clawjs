import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTranscriptEvents, normalizeTranscriptMessage, resolveSessionTitle, suggestConversationTitle, summarizePreview, summarizeTitle } from "./transcript.ts";

test("normalizeTranscriptMessage keeps attachments and chips", () => {
  const message = normalizeTranscriptMessage({
    role: "user",
    content: "hello",
    attachments: [{ name: "file.txt", mimeType: "text/plain" }],
    contextChips: [{ type: "goal", id: "g1", label: "Focus" }],
  });

  assert.ok(message);
  assert.equal(message?.content, "hello");
  assert.equal(message?.attachments?.[0]?.mimeType, "text/plain");
  assert.equal(message?.contextChips?.[0]?.label, "Focus");
});

test("normalizeTranscriptEvents deduplicates adjacent duplicate messages", () => {
  const raw = [
    JSON.stringify({ type: "message", timestamp: "2026-03-20T10:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "Same" }] } }),
    JSON.stringify({ type: "message", timestamp: "2026-03-20T10:01:00.000Z", message: { role: "user", content: [{ type: "text", text: "Same" }] } }),
    JSON.stringify({ type: "message", timestamp: "2026-03-20T10:02:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "Reply" }] } }),
  ].join("\n");

  const messages = normalizeTranscriptEvents(raw);
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.role, "user");
  assert.equal(messages[1]?.role, "assistant");
});

test("summarizeTitle and summarizePreview trim and truncate content", () => {
  assert.equal(summarizeTitle("  [draft] A very long title that should be shortened because it is quite verbose indeed  "), "A very long title that should be shortened becau...");
  assert.equal(summarizePreview({ id: "1", role: "assistant", content: "Hello world", createdAt: Date.now() }), "Hello world");
});

test("suggestConversationTitle and resolveSessionTitle prefer the first user message", () => {
  const messages = [
    { id: "1", role: "assistant" as const, content: "This is an answer", createdAt: 1_000 },
    { id: "2", role: "user" as const, content: "Build a compact title from this conversation", createdAt: 2_000 },
  ];

  assert.equal(suggestConversationTitle(messages), "Build a compact title from this conversation");
  assert.equal(resolveSessionTitle({ messages }), "Build a compact title from this conversation");
});
