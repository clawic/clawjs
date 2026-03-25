import test from "node:test";
import assert from "node:assert/strict";

import { buildTitleConversationSnippet, buildTitlePrompt, generateConversationTitle } from "./title.ts";

test("buildTitleConversationSnippet and buildTitlePrompt normalize transcript excerpts", () => {
  const snippet = buildTitleConversationSnippet([
    { role: "user", content: "  Hello   world " },
    { role: "assistant", content: "Long reply" },
  ]);
  assert.match(snippet, /^USER: Hello world/m);
  assert.match(snippet, /ASSISTANT: Long reply/);

  const prompt = buildTitlePrompt([{ role: "user", content: "hello world" }]);
  assert.match(prompt, /Generate a concise conversation title/);
  assert.match(prompt, /CONVERSATION:/);
});

test("generateConversationTitle uses gateway first and falls back to CLI or heuristics", async () => {
  const gatewayTitle = await generateConversationTitle({
    messages: [{ role: "user", content: "I want to talk about anxiety at work" }],
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: "Work anxiety" } }],
    }), { status: 200 }),
  });
  assert.equal(gatewayTitle, "Work anxiety");

  const cliTitle = await generateConversationTitle({
    messages: [{ role: "user", content: "I want to talk about anxiety at work" }],
    agentId: "agent-1",
    fetchImpl: async () => new Response("boom", { status: 500 }),
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    runner: {
      async exec() {
        return {
          stdout: JSON.stringify({
            result: {
              payloads: [{ text: "Anxiety and work" }],
            },
          }),
          stderr: "",
          exitCode: 0,
        };
      },
    },
  });
  assert.equal(cliTitle, "Anxiety and work");

  const fallbackTitle = await generateConversationTitle({
    messages: [{ role: "user", content: "I need to organize my thoughts for tomorrow" }],
  });
  assert.equal(fallbackTitle, "I need to organize my thoughts for tomorrow");
});
