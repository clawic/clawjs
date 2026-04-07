import { test } from "node:test";
import assert from "node:assert/strict";

import { redactSecrets } from "./logger.ts";

test("redactSecrets masks bearer tokens and key-value secrets", () => {
  const redacted = redactSecrets("Authorization: Bearer secret-token-12345678 token=my-secret-value");
  assert.equal(redacted.includes("secret-token-12345678"), false);
  assert.equal(redacted.includes("my-secret-value"), false);
  assert.match(redacted, /\*+5678/);
});
