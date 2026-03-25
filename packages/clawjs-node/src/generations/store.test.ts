import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { createGenerationStore } from "./store.ts";

function createFakeGeneratorScript(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-generation-script-"));
  const scriptPath = path.join(root, "generate-artifact");
  fs.writeFileSync(scriptPath, `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
if (outIndex === -1 || !args[outIndex + 1]) {
  console.error("missing --out");
  process.exit(1);
}
const outputPath = args[outIndex + 1];
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, "artifact:" + (args[1] || ""));
`, { mode: 0o755 });
  return scriptPath;
}

function withPatchedEnv<TValue>(patch: NodeJS.ProcessEnv, fn: () => Promise<TValue>): Promise<TValue> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return fn().finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function createFakeOpenClawImageSkillEnv(): { skillsDir: string; binDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-skills-"));
  const skillsDir = path.join(root, "skills");
  const skillDir = path.join(skillsDir, "openai-image-gen");
  const scriptDir = path.join(skillDir, "scripts");
  const binDir = path.join(root, "bin");
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: openai-image-gen\ndescription: test skill\n---\n");
  fs.writeFileSync(path.join(scriptDir, "gen.py"), "print('stub')\n");
  fs.writeFileSync(path.join(binDir, "python3"), `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const outDirIndex = args.indexOf("--out-dir");
if (outDirIndex === -1 || !args[outDirIndex + 1]) {
  console.error("missing --out-dir");
  process.exit(1);
}
const modelIndex = args.indexOf("--model");
const model = modelIndex === -1 ? "" : args[modelIndex + 1];
const formatIndex = args.indexOf("--output-format");
const format = formatIndex === -1 ? "png" : args[formatIndex + 1];
const outDir = args[outDirIndex + 1];
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "001-generated." + format), "artifact:" + model);
fs.writeFileSync(path.join(outDir, "index.html"), "<html></html>");
`, { mode: 0o755 });
  return { skillsDir, binDir };
}

test("generation store registers command backends and persists generated assets", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-generations-workspace-"));
  const scriptPath = createFakeGeneratorScript();
  const store = createGenerationStore({
    workspaceDir,
    runtimeAdapter: "openclaw",
  });

  const backend = store.registerCommandBackend({
    id: "fake-image",
    label: "Fake Image Generator",
    supportedKinds: ["image"],
    command: scriptPath,
    args: ["--prompt", "{prompt}", "--out", "{outputPath}"],
    outputExtension: "png",
    mimeType: "image/png",
  });

  assert.equal(backend.id, "fake-image");
  assert.equal(store.listBackends().some((entry) => entry.id === "fake-image" && entry.available === true), true);

  const created = await store.create({
    kind: "image",
    prompt: "blue bird",
    backendId: "fake-image",
    metadata: { seed: 7 },
  });

  assert.equal(created.status, "succeeded");
  assert.equal(created.kind, "image");
  assert.equal(created.backendId, "fake-image");
  assert.equal(created.output?.exists, true);
  assert.equal(created.output?.mimeType, "image/png");
  assert.equal(fs.existsSync(created.output?.filePath || ""), true);

  const fetched = store.get(created.id);
  assert.equal(fetched?.id, created.id);
  assert.equal(fetched?.metadata?.seed, 7);

  const listed = store.list({ kind: "image" });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, created.id);

  const removed = store.remove(created.id);
  assert.equal(removed, true);
  assert.equal(store.get(created.id), null);
  assert.equal(fs.existsSync(created.output?.filePath || ""), false);
});

test("generation store supports ad hoc command executions without prior registration", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-generations-adhoc-"));
  const scriptPath = createFakeGeneratorScript();
  const store = createGenerationStore({
    workspaceDir,
    runtimeAdapter: "demo",
  });

  const record = await store.create({
    kind: "document",
    prompt: "release notes",
    command: scriptPath,
    args: ["--prompt", "{prompt}", "--out", "{outputPath}"],
    outputExtension: "txt",
    mimeType: "text/plain",
  });

  assert.equal(record.backendSource, "ad_hoc");
  assert.equal(record.output?.mimeType, "text/plain");
  assert.match(fs.readFileSync(record.output?.filePath || "", "utf8"), /artifact:release notes/);
});

test("generation store auto-discovers OpenClaw bundled image skills and persists their output", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-generations-openclaw-"));
  const { skillsDir, binDir } = createFakeOpenClawImageSkillEnv();

  await withPatchedEnv({
    OPENCLAW_SKILLS_DIR: skillsDir,
    OPENAI_API_KEY: "test-key",
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const store = createGenerationStore({
      workspaceDir,
      runtimeAdapter: "openclaw",
    });

    const availableBackend = store.listBackends().find((backend) => backend.id === "openclaw-skill:openai-image-gen");
    assert.equal(availableBackend?.available, true);

    const record = await store.create({
      prompt: "lobster astronaut",
      kind: "image",
      model: "gpt-image-1.5",
      metadata: {
        outputFormat: "webp",
      },
    });

    assert.equal(record.backendId, "openclaw-skill:openai-image-gen");
    assert.equal(record.output?.mimeType, "image/webp");
    assert.equal(record.output?.exists, true);
    assert.match(fs.readFileSync(record.output?.filePath || "", "utf8"), /artifact:gpt-image-1.5/);
  });
});
