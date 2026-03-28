import test from "node:test";
import assert from "node:assert/strict";

import { extractOpenClawCliText, splitTextIntoChunks, streamOpenClawConversation, streamOpenClawConversationEvents, type StreamConversationDependencies } from "./stream.ts";

test("extractOpenClawCliText and splitTextIntoChunks normalize CLI output", () => {
  const text = extractOpenClawCliText(JSON.stringify({
    result: {
      payloads: [{ text: "hello " }, { text: "world" }],
    },
  }));

  assert.equal(text, "hello world");
  assert.deepEqual(splitTextIntoChunks(text, 4), ["hell", "o wo", "rld"]);
});

test("extractOpenClawCliText tolerates gateway preamble and root payloads", () => {
  const text = extractOpenClawCliText(`Gateway agent failed; falling back to embedded: Error: gateway closed
Gateway target: ws://127.0.0.1:18789
{
  "payloads": [
    { "text": "Hi. " },
    { "text": "What can I help you with?" }
  ],
  "meta": {
    "aborted": false
  }
}`);

  assert.equal(text, "Hi. What can I help you with?");
});

test("streamOpenClawConversation streams via gateway SSE when available", async () => {
  const encoder = new TextEncoder();
  const dependencies: StreamConversationDependencies = {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ho"}}]}\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"la"}}]}\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }), { status: 200 }),
  };

  const chunks: string[] = [];
  for await (const chunk of streamOpenClawConversation({
    sessionId: "session-1",
    messages: [{ role: "user", content: "hello" }],
  }, dependencies)) {
    if (!chunk.done) chunks.push(chunk.delta);
  }

  assert.deepEqual(chunks, ["ho", "la"]);
});

test("streamOpenClawConversation falls back to CLI when gateway is unavailable", async () => {
  const chunks: string[] = [];
  for await (const chunk of streamOpenClawConversation({
    sessionId: "session-1",
    agentId: "agent-1",
    messages: [{ role: "user", content: "hello" }],
    chunkSize: 3,
  }, {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response("boom", { status: 500 }),
    runner: {
      async exec() {
        return {
          stdout: JSON.stringify({
            result: {
              payloads: [{ text: "hello world" }],
            },
          }),
          stderr: "",
          exitCode: 0,
        };
      },
    },
  })) {
    if (!chunk.done) chunks.push(chunk.delta);
  }

  assert.deepEqual(chunks, ["hel", "lo ", "wor", "ld"]);
});

test("streamOpenClawConversation parses CLI fallback output with preamble logs", async () => {
  const chunks: string[] = [];
  for await (const chunk of streamOpenClawConversation({
    sessionId: "session-cli-preamble",
    agentId: "agent-1",
    messages: [{ role: "user", content: "hello" }],
    chunkSize: 6,
    transport: "cli",
  }, {
    runner: {
      async exec() {
        return {
          stdout: "",
          stderr: `Gateway agent failed; falling back to embedded: Error: gateway closed
Gateway target: ws://127.0.0.1:18789
{
  "payloads": [
    { "text": "hello world" }
  ]
}`,
          exitCode: 0,
        };
      },
    },
  })) {
    if (!chunk.done) chunks.push(chunk.delta);
  }

  assert.deepEqual(chunks, ["hello ", "world"]);
});

test("streamOpenClawConversationEvents emits chunk and title events", async () => {
  const dependencies: StreamConversationDependencies = {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Plan"}}]}\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":" a launch checklist"}}]}\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    }), { status: 200 }),
  };

  const events: Array<{ type: string; value?: string }> = [];
  for await (const event of streamOpenClawConversationEvents({
    sessionId: "session-2",
    messages: [{ role: "user", content: "Plan a launch checklist" }],
  }, dependencies)) {
    if (event.type === "transport") {
      events.push({ type: event.type });
    } else if (event.type === "chunk") {
      events.push({ type: event.type, value: event.chunk.delta });
    } else if (event.type === "done") {
      events.push({ type: event.type });
    } else if (event.type === "title") {
      events.push({ type: event.type, value: event.title });
    }
  }

  assert.deepEqual(events, [
    { type: "transport" },
    { type: "chunk", value: "Plan" },
    { type: "chunk", value: " a launch checklist" },
    { type: "done" },
    { type: "title", value: "Plan a launch checklist" },
  ]);
});

test("streamOpenClawConversation retries gateway failures and emits aborted/error events", async () => {
  let attempts = 0;
  const retryChunks: string[] = [];
  for await (const chunk of streamOpenClawConversation({
    sessionId: "session-retry",
    messages: [{ role: "user", content: "hello" }],
    transport: "gateway",
    gatewayRetries: 1,
  }, {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("boom", { status: 500 });
      }
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n'));
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
        },
      }), { status: 200 });
    },
  })) {
    if (!chunk.done) retryChunks.push(chunk.delta);
  }
  assert.deepEqual(retryChunks, ["ok"]);

  attempts = 0;
  const retryEvents: string[] = [];
  for await (const event of streamOpenClawConversationEvents({
    sessionId: "session-retry-events",
    messages: [{ role: "user", content: "hello" }],
    transport: "gateway",
    gatewayRetries: 1,
  }, {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("boom", { status: 500 });
      }
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n'));
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
        },
      }), { status: 200 });
    },
  })) {
    retryEvents.push(event.type);
  }
  assert.deepEqual(retryEvents, ["transport", "retry", "chunk", "done", "title"]);

  const abortController = new AbortController();
  abortController.abort("user_cancelled");
  const abortedEvents: Array<{ type: string; reason?: string }> = [];
  for await (const event of streamOpenClawConversationEvents({
    sessionId: "session-abort",
    messages: [{ role: "user", content: "hello" }],
    signal: abortController.signal,
  }, {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response("should-not-run", { status: 200 }),
  })) {
    abortedEvents.push({
      type: event.type,
      ...("reason" in event ? { reason: event.reason } : {}),
    });
  }
  assert.deepEqual(abortedEvents, [{ type: "aborted", reason: "user_cancelled" }]);

  const errorEvents: Array<{ type: string; partialText?: string }> = [];
  for await (const event of streamOpenClawConversationEvents({
    sessionId: "session-error",
    messages: [{ role: "user", content: "hello" }],
    transport: "gateway",
  }, {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response("boom", { status: 500 }),
  })) {
    errorEvents.push({
      type: event.type,
      ...("partialText" in event ? { partialText: event.partialText } : {}),
    });
  }
  assert.deepEqual(errorEvents, [{ type: "transport" }, { type: "error" }]);
});

test("streamOpenClawConversationEvents falls back from gateway to CLI with transport events", async () => {
  const events: string[] = [];
  for await (const event of streamOpenClawConversationEvents({
    sessionId: "session-fallback",
    agentId: "agent-1",
    messages: [{ role: "user", content: "hello" }],
    transport: "auto",
  }, {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response("boom", { status: 500 }),
    runner: {
      async exec() {
        return {
          stdout: JSON.stringify({
            result: {
              payloads: [{ text: "fallback reply" }],
            },
          }),
          stderr: "",
          exitCode: 0,
        };
      },
    },
  })) {
    events.push(event.type === "transport" ? `${event.type}:${event.transport}:${String(event.fallback)}` : event.type);
  }

  assert.deepEqual(events, ["transport:gateway:false", "transport:cli:true", "chunk", "done", "title"]);
});
