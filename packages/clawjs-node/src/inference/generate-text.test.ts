import test from "node:test";
import assert from "node:assert/strict";

import { generateRuntimeText } from "./generate-text.ts";

test("generateRuntimeText uses gateway transport when available", async () => {
  const result = await generateRuntimeText({
    sessionId: "inference-gateway",
    messages: [{ role: "user", content: "hello" }],
    transport: "gateway",
  }, {
    fetchImpl: async () => new Response(
      [
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n",
        "data: [DONE]\n",
      ].join(""),
      {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      },
    ),
    conversationAdapter: {
      transport: {
        kind: "hybrid",
        streaming: true,
        gatewayKind: "openai-chat-completions",
      },
      gateway: {
        kind: "openai-chat-completions",
        url: "http://127.0.0.1:18789",
      },
      buildCliInvocation() {
        throw new Error("not used");
      },
      supportsGateway: true,
    },
  });

  assert.equal(result.text, "Hello world");
  assert.equal(result.transport, "gateway");
  assert.equal(result.fallback, false);
});

test("generateRuntimeText falls back to CLI when gateway fails in auto mode", async () => {
  const result = await generateRuntimeText({
    sessionId: "inference-cli",
    agentId: "demo",
    messages: [{ role: "user", content: "summarize this" }],
    transport: "auto",
  }, {
    fetchImpl: async () => new Response("boom", { status: 500 }),
    runner: {
      exec: async () => ({
        stdout: JSON.stringify({
          result: {
            payloads: [{ text: "Local response" }],
          },
        }),
        stderr: "",
        exitCode: 0,
      }),
    },
    conversationAdapter: {
      transport: {
        kind: "hybrid",
        streaming: true,
        gatewayKind: "openai-chat-completions",
      },
      gateway: {
        kind: "openai-chat-completions",
        url: "http://127.0.0.1:18789",
      },
      buildCliInvocation() {
        return {
          command: "openclaw",
          args: ["agent"],
          parser: "json-payloads",
        };
      },
      supportsGateway: true,
    },
  });

  assert.equal(result.text, "Local response");
  assert.equal(result.transport, "cli");
  assert.equal(result.fallback, true);
});
