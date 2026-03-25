import test from "node:test";
import assert from "node:assert/strict";

import { Claw, createClaw } from "./index.ts";

test("@clawjs/node reexports the primary Claw SDK surface", () => {
  assert.equal(Claw.create, createClaw);
});
