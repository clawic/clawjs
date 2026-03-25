import test from "node:test";
import assert from "node:assert/strict";

import { ClawEventBus } from "./events.ts";

test("ClawEventBus emits typed events and supports unsubscribe", () => {
  const bus = new ClawEventBus();
  const seen: string[] = [];

  const off = bus.on("files.synced", (event) => {
    seen.push(`${event.type}:${String((event.payload as { id: string }).id)}`);
  });

  bus.emit("files.synced", { id: "one" });
  off();
  bus.emit("files.synced", { id: "two" });

  assert.deepEqual(seen, ["files.synced:one"]);
});

test("ClawEventBus supports async iterator consumption", async () => {
  const bus = new ClawEventBus();
  const iterator = bus.iterate("files.synced")[Symbol.asyncIterator]();

  bus.emit("files.synced", { id: "one" });
  const first = await iterator.next();
  await iterator.return?.();

  assert.equal(first.done, false);
  assert.equal(first.value?.type, "files.synced");
  assert.deepEqual(first.value?.payload, { id: "one" });
});
