import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findCommandFresh } from "./platform.ts";

function writeExecutable(target: string, body = "#!/bin/sh\nexit 0\n"): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body, { mode: 0o755 });
}

test("findCommandFresh respects the current PATH order on unix", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-platform-path-"));
  const preferredDir = path.join(tempRoot, "preferred");
  const fallbackDir = path.join(tempRoot, "fallback");
  const homeDir = path.join(tempRoot, "home");
  const previousPath = process.env.PATH;
  const previousHome = process.env.HOME;

  writeExecutable(path.join(preferredDir, "npm"));
  writeExecutable(path.join(fallbackDir, "npm"));
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".bash_profile"), `export PATH="${fallbackDir}:$PATH"\n`);

  process.env.PATH = `${preferredDir}:${fallbackDir}:/usr/bin:/bin`;
  process.env.HOME = homeDir;

  try {
    const resolved = await findCommandFresh("npm");
    assert.equal(resolved, path.join(preferredDir, "npm"));
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("findCommandFresh can disable fallback probes and use PATH only", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-platform-strict-path-"));
  const previousPath = process.env.PATH;
  const previousFlag = process.env.CLAWJS_FIND_COMMAND_STRICT_PATH;

  process.env.PATH = `${tempRoot}:/usr/bin:/bin`;
  process.env.CLAWJS_FIND_COMMAND_STRICT_PATH = "1";

  try {
    const resolved = await findCommandFresh("openclaw");
    assert.equal(resolved, null);
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    if (previousFlag === undefined) {
      delete process.env.CLAWJS_FIND_COMMAND_STRICT_PATH;
    } else {
      process.env.CLAWJS_FIND_COMMAND_STRICT_PATH = previousFlag;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
