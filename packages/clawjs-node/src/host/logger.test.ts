import test from "node:test";
import assert from "node:assert/strict";

import { MemoryStructuredLogSink, StructuredLogger, redactSecrets } from "./logger.ts";

test("redactSecrets masks sensitive keys recursively", () => {
  const redacted = redactSecrets({
    apiKey: "sk-12345678",
    nested: {
      authorization: "Bearer secret-token",
    },
    safe: "value",
  });

  assert.equal(redacted.apiKey, "*******5678");
  assert.equal((redacted.nested as { authorization: string }).authorization.includes("secret-token"), false);
  assert.equal(redacted.safe, "value");
});

test("redactSecrets masks inline secrets inside error and message strings", () => {
  const redacted = redactSecrets({
    error: "Gateway HTTP 401: Authorization: Bearer secret-token-12345678",
    message: "apiKey=sk-live-12345678",
  });

  assert.equal((redacted.error as string).includes("secret-token-12345678"), false);
  assert.equal((redacted.message as string).includes("sk-live-12345678"), false);
});

test("StructuredLogger writes sanitized structured entries", () => {
  const sink = new MemoryStructuredLogSink();
  const logger = new StructuredLogger(sink).child({ workspaceId: "demo" });

  logger.info("auth.saved", {
    provider: "openai",
    token: "secret-token-12345678",
  });

  assert.equal(sink.entries.length, 1);
  assert.equal(sink.entries[0]?.event, "auth.saved");
  assert.equal((sink.entries[0]?.detail as { token: string }).token.includes("secret-token"), false);
  assert.equal((sink.entries[0]?.detail as { workspaceId: string }).workspaceId, "demo");
});
