import test from "node:test";
import assert from "node:assert/strict";

import { listRuntimeAdapters } from "./registry.ts";

test("runtime adapters expose support metadata with one recommended production path", () => {
  const adapters = listRuntimeAdapters();
  const recommended = adapters.filter((adapter) => adapter.recommended);

  assert.ok(adapters.every((adapter) => typeof adapter.stability === "string"));
  assert.ok(adapters.every((adapter) => typeof adapter.supportLevel === "string"));
  assert.equal(recommended.length, 1);
  assert.equal(recommended[0]?.id, "openclaw");
  assert.equal(recommended[0]?.stability, "stable");
  assert.equal(recommended[0]?.supportLevel, "production");
});
