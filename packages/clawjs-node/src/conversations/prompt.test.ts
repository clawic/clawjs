import test from "node:test";
import assert from "node:assert/strict";

import { buildOpenAIMessages, buildOpenClawCliPrompt, buildSystemPromptWithContext, formatOpenClawConversation } from "./prompt.ts";

test("buildSystemPromptWithContext merges one-shot context blocks", () => {
  const prompt = buildSystemPromptWithContext("Base rules", [
    { title: "Workspace note", content: "Use concise answers." },
  ]);

  assert.match(prompt, /Base rules/);
  assert.match(prompt, /Workspace note/);
  assert.match(prompt, /Use concise answers\./);
});

test("formatOpenClawConversation renders roles, chips and attachments", () => {
  const rendered = formatOpenClawConversation([{
    role: "user",
    content: "hello",
    contextChips: [{ type: "file", id: "1", label: "SOUL.md" }],
    attachments: [{ name: "image.png", mimeType: "image/png" }],
  }]);

  assert.match(rendered, /^USER: hello/m);
  assert.match(rendered, /Context: SOUL\.md/);
  assert.match(rendered, /Attachments: image\.png/);
});

test("buildOpenClawCliPrompt and buildOpenAIMessages keep context and multimodal payloads", () => {
  const cliPrompt = buildOpenClawCliPrompt({
    systemPrompt: "Behave.",
    contextBlocks: [{ title: "Session memory", content: "User prefers Spanish." }],
    messages: [{ role: "user", content: "hello" }],
  });
  assert.match(cliPrompt, /SYSTEM PROMPT:/);
  assert.match(cliPrompt, /Session memory/);
  assert.match(cliPrompt, /USER: hello/);

  const openaiMessages = buildOpenAIMessages({
    systemPrompt: "Behave.",
    contextBlocks: [{ title: "Session memory", content: "User prefers Spanish." }],
    messages: [{
      role: "user",
      content: "Describe this image",
      attachments: [{ name: "image.png", mimeType: "image/png", data: "abcd" }],
    }],
  });

  assert.equal(openaiMessages[0]?.role, "system");
  assert.equal(Array.isArray(openaiMessages[1]?.content), true);
  assert.match(JSON.stringify(openaiMessages[1]), /data:image\/png;base64,abcd/);
});
