import test from "node:test";
import assert from "node:assert/strict";

import { buildDetachedPtySpec, NodeProcessHost } from "./process.ts";

test("exec returns stdout for successful commands", async () => {
  const host = new NodeProcessHost();
  const result = await host.exec(process.execPath, ["-e", "process.stdout.write('ok')"]);
  assert.equal(result.stdout, "ok");
  assert.equal(result.exitCode, 0);
});

test("stream yields stdout through callbacks", async () => {
  const host = new NodeProcessHost();
  let seen = "";

  const result = await host.stream(process.execPath, ["-e", "process.stdout.write('chunk')"], {
    onStdout: (chunk) => { seen += chunk; },
  });

  assert.equal(result.stdout, "chunk");
  assert.equal(seen, "chunk");
});

test("buildDetachedPtySpec wraps commands for the current platform", () => {
  const spec = buildDetachedPtySpec("openclaw", ["models", "status", "--json"]);

  if (process.platform === "darwin") {
    assert.equal(spec.command, "script");
    assert.deepEqual(spec.args, ["-q", "/dev/null", "openclaw", "models", "status", "--json"]);
    return;
  }

  if (process.platform === "win32") {
    assert.equal(spec.command, "openclaw");
    assert.deepEqual(spec.args, ["models", "status", "--json"]);
    assert.equal(spec.shell, true);
    return;
  }

  assert.equal(spec.command, "script");
  assert.deepEqual(spec.args, ["-qc", "openclaw models status --json", "/dev/null"]);
});
