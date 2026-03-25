import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertValidOutput, exampleInput, type __APP_PASCAL__Input } from "./contract.js";
import { runSkill, skillMetadata } from "./index.js";

const mode = process.argv[2] ?? "example";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadManifest() {
  const manifestPath = path.join(rootDir, "skill.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw) as {
    id: string;
    name: string;
    version: string;
    verification?: { exampleInput?: string };
  };
}

async function loadExampleInput(manifest: { verification?: { exampleInput?: string } }) {
  const configuredPath = manifest.verification?.exampleInput ?? "./examples/input.json";
  const examplePath = path.resolve(rootDir, configuredPath);
  const raw = await fs.readFile(examplePath, "utf8");
  return JSON.parse(raw) as __APP_PASCAL__Input;
}

async function main() {
  const manifest = await loadManifest();
  const input = await loadExampleInput(manifest);
  const output = await runSkill(input);

  assert.equal(manifest.id, skillMetadata.id);
  assert.equal(manifest.name, skillMetadata.name);
  assert.equal(manifest.version, skillMetadata.version);
  assertValidOutput(output);

  const payload = {
    ok: true,
    mode,
    skill: skillMetadata,
    input,
    output,
  };

  if (mode === "check") {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (mode === "example") {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  throw new Error(`Unknown harness mode: ${mode}`);
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
